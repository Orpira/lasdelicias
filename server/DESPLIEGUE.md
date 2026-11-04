# Despliegue del backend en OrPiRa-Cloud (Hetzner CX23)

Servidor: 2 vCPU · 4 GB RAM · Ubuntu/Debian con Docker · IPv4 `167.233.139.93`.
Consumo esperado: Postgres + API ≈ 150–250 MB de RAM; cabe holgado junto a n8n.

## Endurecimiento de seguridad (migración 012)

Al desplegar esta versión, ten en cuenta lo siguiente:

- **Hay que reimprimir todos los QR de mesa.** La migración `012_seguridad_tokens_idempotencia.sql` sustituye los tokens de 64 bits por tokens de 128 bits (32 hexadecimales) y regenera todos los existentes. Los QR antiguos dejan de funcionar al arrancar la API. En la pestaña **QR de mesas** del panel, descarga e imprime los nuevos.
- **Antes de desplegar, reconfigura n8n.** Los eventos ya no llevan `X-Delicias-Secret`, sino una firma HMAC (ver [Conectar n8n](#5-conectar-n8n)). Un flujo antiguo dejará de aceptarlos.
- **`TRUST_PROXY`** (por defecto `loopback,uniquelocal`) limita qué proxys pueden fijar la IP del cliente con `X-Forwarded-For`. Si el proxy no está en el mismo servidor ni en una red privada, indica su IP.
- La API envía cabeceras de seguridad: HSTS de un año, CSP `default-src 'none'`, `nosniff`, `Referrer-Policy: no-referrer` y `frame-ancestors 'none'`. La web en Vercel las envía en [vercel.json](../vercel.json).
- `POST /pedidos` y `POST /n8n/pedidos` admiten la cabecera `Idempotency-Key` (16–128 caracteres `A-Za-z0-9_-`). Un reintento con la misma clave y el mismo contenido devuelve el pedido original con `200` y `Idempotent-Replayed: true`. Si la clave se reutiliza con otro contenido, responde `422`. La web genera la clave sola; desde n8n, envía una por mensaje de WhatsApp, por ejemplo el id del mensaje.
- Las rutas públicas y las de n8n rechazan con `400` los campos desconocidos en el cuerpo.

## Cuentas y registro del cobro

La app **no procesa pagos ni incorpora una pasarela**. El personal recibe el dinero en la caja del local y registra el cobro con **Efectivo**, **Tarjeta**, **Bizum** u **Otro**.

- El primer pedido de una mesa abre una cuenta; los siguientes comparten esa cuenta hasta cerrarla. Hay como máximo una cuenta abierta por mesa, incluso con peticiones simultáneas.
- En **Barra → Mesas abiertas**, cada ficha muestra mesa, total, número de pedidos, pedidos sin entregar y tiempo abierta. La llamada «pide la cuenta» abre el mismo detalle.
- Elige el método para registrar el cobro. Si faltan entregas, debes confirmar expresamente que se marquen como entregadas. El cierre y los pagos se guardan en una única transacción; no se permite repetir el cobro.
- Al cobrar se atienden las llamadas de cuenta, pero no las de atención. El dispositivo que pidió ve el agradecimiento, el resumen y la invitación a valorar; se vacían su carrito y su mesa. Quien solo escaneó el QR se desvincula sin redirección y conserva el carrito.
- **Ver mi cuenta** permite al cliente consultar artículos, estados y total antes de pedir la cuenta. El siguiente pedido tras un cierre abre una visita nueva.
- El cambio de mesa traslada los pedidos en curso del dispositivo a la cuenta de destino. Si la anterior queda sin pedidos, se anula con motivo `sin pedidos`. Cancelar un pedido lo excluye del total.
- Solo administración puede **anular una cuenta**, con motivo obligatorio. No se registra ningún pago ni se recuperan esos pedidos como deuda de una visita nueva. El cierre anulado nunca muestra un agradecimiento por un pago.
- Para llevar o WhatsApp: **Entregado y cobrado** registra ambos hechos con el método elegido. **Entregado sin cobrar** mantiene el cobro pendiente. El seguimiento ofrece el mismo agradecimiento y valoración cuando constan entrega y pago.
- **Pendiente de cobro (N)** reúne los pedidos entregados sin pagar y las cuentas abiertas de días anteriores (fecha de Madrid), con acceso al cobro.

La migración automática `007_cuentas_y_cobro.sql` incorpora a cuentas únicamente los pedidos de mesa en estado `nuevo`, `preparando` o `listo`. No agrupa los ya entregados ni inventa pagos históricos. Los pedidos para llevar entregados sin registro de pago quedan pendientes de revisión.

El resumen público `GET /cuentas/:id/resumen` solo admite cuentas cobradas durante las últimas **24 horas**, sin nombres de clientes, teléfonos, códigos de seguimiento, dispositivo ni personal. El dispositivo guarda sus cuentas y códigos en `delicias.cuentas` durante **12 horas desde el último pedido de cada cuenta**, para reconocer su visita y permitir su valoración. Se recuperan también los cierres ocurridos mientras estaba desconectado. Los enlaces compartidos de seguimiento no acreditan que el dispositivo haya hecho el pedido.

### Eventos de cuentas para n8n

Continúan usando el webhook y la cabecera secreta existentes:

| `tipo` | Cuándo | Contenido |
|---|---|---|
| `cuenta.actualizada` | Se añade, traslada o cancela un pedido; cambia el total | `id`, `mesa_numero`, `mesa_nombre`, `estado`, `total`, `metodo_pago`, `cerrada_at` |
| `cuenta.cobrada` | El personal registra el cobro completo | Los mismos campos, con estado `cobrada`, total y método definitivos |
| `cuenta.anulada` | Administración anula o la cuenta queda sin pedidos tras un traslado | Los mismos campos y `motivo_anulacion` |
| `pedido.pagado` | Se registra un pago sin cambiar el estado del pedido | `pedido` completo; si también cambia el estado, se emite el habitual `pedido.estado` |

Los campos de cuenta van **en la raíz del JSON**, junto a `tipo` y `enviado_en`, no dentro de `cuenta`. El SSE público usa el evento `cuenta`, con `tipo` en los datos, y nunca incluye el motivo libre de anulación. Los eventos del personal usan el mismo nombre `cuenta`.

Idea de ampliación: Webhook → comprobar el secreto → Switch por `body.tipo = cuenta.anulada` → Telegram al dueño con la mesa, total y motivo. Se puede excluir `sin pedidos` para no avisar de los traslados normales. No se activa ninguna automatización nueva ni se envían avisos reales al desplegar esta función.

### Pruebas de cuentas

```bash
# Sin esta variable, la suite se omite de forma explícita.
cd server
DATABASE_URL_TEST='postgres://usuario:clave-de-pruebas@localhost:5432/delicias_pruebas' npm test
```

Usa **una base PostgreSQL dedicada a pruebas**, nunca producción. La suite crea un esquema aleatorio, aplica las migraciones reales, comprueba concurrencia, cobro, cambios de mesa, cancelación, permisos, privacidad y recuperación SSE, y elimina su esquema al terminar. Desactiva las salidas a n8n y TPV. No requiere modificar ningún archivo de entorno.

## Cierre diario y criterio de venta

Las migraciones `008_cierres_diarios.sql`, `010_criterio_cobro_cierres.sql` y `011_criterio_venta_cierres.sql` crean y actualizan `cierres_diarios`. Los nuevos cierres cuentan únicamente pedidos con cobro registrado (`pagado_at` no nulo y estado distinto de cancelado). Los cierres guardados conservan siempre el criterio aplicado.

Los pedidos se asignan por su `fecha` de creación en **Europe/Madrid**. El resumen incluye totales, ticket medio, tipos, categorías, productos y las 24 horas del día. Los artículos conservan el nombre y precio de la línea original; las categorías se consultan en la carta al calcular. Todos los desgloses de una consulta usan la misma fotografía de los datos. Siempre se muestran entregados, listos sin recoger, en curso y cancelados; ventas y en curso nunca se solapan.

En **Cierre diario**, el informe muestra el criterio fijo «Solo pedidos cobrados», entregados, listos sin recoger, cobro por método, cuentas abiertas y cuentas anuladas.

| Ruta | Permiso | Comportamiento |
|---|---|---|
| `GET /admin/cierres/:fecha` | Personal autenticado | Cierre guardado o vista previa según la ficha |
| `GET /admin/cierres/:fecha` | Personal autenticado | Vista previa del cierre según pedidos cobrados |
| `GET /admin/cierres/:fecha/csv` | Personal autenticado | CSV UTF-8 con criterio, métodos de pago y pendientes |
| `PATCH /admin/negocio/cierre` | Solo administración | Se conserva por compatibilidad; los nuevos cierres siguen contando solo pedidos cobrados |
| `POST /admin/cierres` | Solo administración | Cuerpo `{ "fecha": "AAAA-MM-DD", "forzar": false }`; guarda con el criterio actual |
| `GET /n8n/cierres/:fecha` | `X-Api-Key` existente | El mismo informe y la misma previsualización |
| `POST /n8n/cierres` | `X-Api-Key` existente | Cuerpo `{ "fecha": "AAAA-MM-DD", "forzar": false }`; mismo guardado que administración |

El informe devuelve `resumen.criterio = { incluye_listos, descripcion }`, `cobro`, `pendiente_cobro`, `anuladas`, el desglose de entregados y listos sin recoger, `guardado`, `cerrado_at`, `cerrado_por`, `origen`, `criterio_configurado` y `hoy`. `incluye_listos` se mantiene únicamente para compatibilidad con cierres históricos; la descripción de los nuevos cierres es «Solo pedidos cobrados».

Los cierres guardados **no se recalculan**: consultar con otro criterio, cambiar la ficha o reintentar un POST conserva el resumen original. El primer guardado devuelve `201`; los reintentos, `200`. Se conserva quién lo guardó o si procedió de n8n. CSV e impresión muestran también el criterio guardado. No se puede guardar una fecha futura.

Al cerrar **hoy**, se bloquea si quedan pedidos nuevos o preparando; los pedidos listos solo bloquean cuando no forman parte de las ventas. Las cuentas abiertas también requieren confirmación; administración puede confirmar `forzar: true`. El cierre no modifica pedidos ni pagos y no impide recibir pedidos posteriores.

### Automatizar con n8n

Usa un nodo **Schedule Trigger** en zona **Europe/Madrid**, tras el fin de jornada. Un **HTTP Request** hace `POST http://lasdelicias-api:3001/n8n/cierres`, con una credencial Header Auth `X-Api-Key` que contenga la `N8N_API_KEY` ya configurada y JSON:

```json
{ "fecha": "{{ $now.setZone('Europe/Madrid').minus({ days: 1 }).toFormat('yyyy-MM-dd') }}" }
```

La expresión del ejemplo cierra **ayer** y es adecuada para ejecutarlo después de medianoche. Para cerrar hoy antes de medianoche, elimina `.minus({ days: 1 })`: respetará el bloqueo de pedidos en curso. Ajusta el nombre del contenedor a tu red existente. No hay automatización programada por defecto ni se modifican archivos de entorno. La misma fecha se puede reintentar sin duplicar ni alterar el cierre.

Las pruebas de `test/cierres.test.js` se ejecutan junto a las de cuentas con `DATABASE_URL_TEST` y comprueban que sumar listos añade exactamente su importe, sin solapar ventas y en curso, además de todas las rutas, roles, CSV e históricos.

## Pedidos fuera de horario

La migración automática `009_fuera_de_horario.sql` añade `pedidos.fuera_horario`, `pedidos.atender_desde` y `negocio.datos.dias_cerrado`, sin sobrescribir los festivos existentes. Se usa `009` porque `008` está ocupado por el cierre diario. No hay que modificar ningún archivo de entorno.

`src/horario.js` es la única fuente de cálculo: **Europe/Madrid**, apertura incluida y cierre excluido, un tramo diario sin cruzar medianoche y búsqueda de apertura durante los próximos 14 días, incluido hoy. Un valor `null` cierra ese día. Se admiten guion normal y largo; `24:00` solo puede ser la hora final. En el salto de marzo se usa el primer minuto real del tramo; en octubre se distinguen los dos instantes de una hora repetida.

Configura `horario` y `dias_cerrado` mediante `PUT /admin/negocio`, con sesión de administración y el resto de la ficha. Por ejemplo, `dias_cerrado: ["2026-12-25", "2027-01-01"]` cierra esas fechas aunque el horario semanal diga que abre. Un cliente antiguo que omita la lista no la borra. Las fechas y los tramos se validan; los errores del horario almacenado se notifican, no se interpreta una configuración inválida como abierto.

### Contrato y funcionamiento

- `GET /horario/estado`, público y sin caché: `{ abierto, siguiente_apertura, texto }`. Mientras está abierto, `siguiente_apertura` es `null`. Home y carta refrescan el mismo texto cada 30 segundos.
- `GET /horario/estado?recogida=true` añade `recogida: { fecha, opciones: [{ hora, instante }] }` o `null`. Solo el formulario pide esta lista de minutos válidos; `instante` es ISO y la etiqueta está en Madrid. En octubre las horas repetidas incluyen su zona.
- Con el local cerrado, para llevar y WhatsApp se aceptan con `fuera_horario: true`, `atender_desde` y **fecha/correlativo del día de apertura**. Se mantiene la fecha real de recepción en `created_at`; así el cierre del día de preparación no pierde estos pedidos.
- La hora de recogida debe estar dentro de un tramo abierto, fuera de festivos y no ser anterior a `atender_desde`. No se aplica el límite antiguo de 48 horas, que impediría recoger tras vacaciones o fines de semana largos.
- Un pedido de mesa cerrado devuelve `409` con la alternativa para recoger. Si no se encuentra ninguna apertura, ambos canales devuelven `409` e indican que hay que llamar. No se guarda un pedido, abre una cuenta ni descuenta stock en esos rechazos.
- Los pedidos aceptados reservan stock al crearse, como los inmediatos. Se pueden cancelar desde la sección de programados y se devuelve ese stock; no se pueden poner a preparar antes de su apertura.
- Barra muestra **Programados para la apertura**, plegado inicialmente. Al llegar `atender_desde`, el reloj los mueve a **Nuevos** y avisa una sola vez; ni la recepción anticipada ni las reconexiones duplican el aviso. Cocina no los incluye hasta entonces y la espera empieza en la apertura, no la noche anterior.
- Cambiar después la ficha no reprograma los pedidos ya confirmados: conservan la hora comunicada al cliente.

### Prueba manual en una base de pruebas

1. Guarda una ficha con horario de prueba `07:00–19:00` todos los días y añade la fecha actual de Madrid a `dias_cerrado`. Consulta `/horario/estado?recogida=true`: debe indicar cerrado y devolver la apertura de mañana.
2. Desde la carta, añade un producto y envía un pedido **para recoger**. El aviso y la opción «En cuanto abramos» muestran la apertura; las horas seleccionables pertenecen solo a ese día y al tramo permitido.
3. Comprueba en la respuesta y en `/pedidos/:codigo` que `fuera_horario` es `true`, `atender_desde` coincide con la apertura y `fecha`/`numero_dia` son del día de preparación. El seguimiento confirma día y hora, con **Recibido** marcado y el resto en espera.
4. Abre Barra: está en **Programados para la apertura**, no en Nuevos y no suena al recibirlo. Cocina no lo muestra. En la base de pruebas, adelanta únicamente su `atender_desde` a un instante pasado; tras el refresco del reloj pasa a Nuevos y avisa una vez. No hagas esta manipulación en producción.
5. Intenta crear un pedido de mesa con un QR válido: debe responder `409` «El local está cerrado ahora mismo…», sin crear cuenta ni consumir stock.
6. Restaura la ficha de prueba o elimina el entorno aislado. Las pruebas automatizadas crean su propio esquema con `DATABASE_URL_TEST` y no alteran producción.

## Instalación rápida (un comando)

Con el DNS del paso 1 ya creado, en el servidor (con tu usuario; las variables van **después** de `sudo`):

```bash
curl -fsSL https://raw.githubusercontent.com/Orpira/lasdelicias/main/server/deploy/instalar.sh \
  | sudo ADMIN_EMAIL=tu@email.es ADMIN_NOMBRE="Tu nombre" \
         FRONT_ORIGENES="https://lasdelicias.orpira.es" bash
```

El script:

1. clona el repo en `/opt/lasdelicias` y genera los secretos en `server/.env`;
2. detecta **Nginx Proxy Manager** y n8n, y une la API a su red Docker (`PROXY_NETWORK`); si n8n está en esa red, le envía los eventos por la red interna;
3. arranca Postgres + API + copias de seguridad (contenedores `lasdelicias-*`, independientes del resto del servidor);
4. crea la cuenta de administración (te pide la contraseña);
5. te dice exactamente qué poner en el proxy y muestra la clave y el secreto para n8n.

Volver a ejecutarlo **actualiza** sin tocar el `.env` ni los datos.

### Publicar la API en Nginx Proxy Manager

`http://IP-del-servidor:81` → Hosts → Proxy Hosts → **Add Proxy Host**:

| Pestaña | Campo | Valor |
|---|---|---|
| Details | Domain Names | `api-delicias.orpira.es` |
| | Scheme / Forward Hostname / Port | `http` / `lasdelicias-api` / `3001` |
| | Block Common Exploits, Websockets Support | ✔ |
| SSL | Request a new SSL Certificate, Force SSL, HTTP/2 | ✔ |
| Advanced | Custom Nginx Configuration | ver abajo |

```nginx
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 1h;
client_max_body_size 6m;
```

Las tres primeras líneas son imprescindibles para el tiempo real (panel de barra, cocina y seguimiento del cliente); la última permite subir fotos de hasta 5 MB.

Los pasos 1–8 de abajo explican lo mismo a mano.

## 1. DNS

En el proveedor de `orpira.es`, crea un registro:

| Tipo | Nombre | Valor |
|---|---|---|
| A | `api-delicias` | `167.233.139.93` |

En el **firewall de Hetzner** (si lo usas) deben estar abiertos 22, 80 y 443. **Nunca** abras el 5432 ni el 3001.

## 2. Código y secretos

```bash
ssh root@167.233.139.93
git clone https://github.com/Orpira/lasdelicias.git /opt/lasdelicias
cd /opt/lasdelicias/server
cp .env.example .env
nano .env
```

Rellena (genera cada secreto con `openssl rand -base64 32`):

- `POSTGRES_PASSWORD`, `JWT_SECRET`, `N8N_WEBHOOK_SECRET`, `N8N_API_KEY`
- `CORS_ORIGINS`: los dominios del frontend, separados por comas. Admite `*` para las URLs que Vercel genera en cada despliegue: `https://lasdelicias.orpira.es,https://lasdelicias-orpira-7163s-projects.vercel.app,https://lasdelicias-*-orpira-7163s-projects.vercel.app`
- `PUBLIC_URL=https://api-delicias.orpira.es`
- `N8N_WEBHOOK_URL`: la URL del webhook que crearás en n8n (paso 5). Si n8n está en Docker en este servidor, puedes usar la red interna (ver comentario en `docker-compose.yml`).

## 3. Arrancar

```bash
docker compose up -d --build
docker compose logs -f api        # debe mostrar las migraciones y "Carta inicial cargada"
curl http://127.0.0.1:3001/health # {"ok":true}
```

Crea las cuentas del personal (rol `admin` para el dueño, `barra` para quien solo gestiona pedidos y agotados):

```bash
docker compose exec -e STAFF_PASSWORD='clave-larga-del-dueño' api npm run crear-staff -- dueno@lasdelicias.es "Dueño" admin
docker compose exec -e STAFF_PASSWORD='clave-de-la-barra' api npm run crear-staff -- barra@lasdelicias.es "Barra" barra
```

## 4. HTTPS (proxy inverso)

Usa el mismo proxy que ya publica n8n:

- **Nginx Proxy Manager**: ver la tabla de la instalación rápida (destino `lasdelicias-api:3001`).
- **Caddy**: añade el bloque de `deploy/Caddyfile.ejemplo` y `caddy reload`.
- **Nginx**: copia `deploy/nginx.ejemplo.conf`, enlázalo y ejecuta `certbot --nginx -d api-delicias.orpira.es`.
- **Traefik**: etiqueta el servicio `api` con el host `api-delicias.orpira.es` y su certresolver.

Comprueba: `curl https://api-delicias.orpira.es/negocio`.

> Importante para el tiempo real: el proxy no debe almacenar en búfer las respuestas SSE (las plantillas ya lo configuran).

## 5. Conectar n8n

### Eventos que envía la API → n8n

El flujo [las-delicias-eventos.json](n8n/las-delicias-eventos.json) está listo para importar en **n8n 1.x**. Usa nodos nativos con versiones contrastadas con n8n 1.100.1, sin extensiones comunitarias ni acceso a variables de entorno desde los nodos. Se importa **inactivo** y sin secretos reales.

La API envía un POST JSON a `http://n8n:5678/webhook/las-delicias` **firmado con HMAC-SHA256** ([firma.js](src/firma.js)); el secreto no viaja en la petición. Cabeceras: `X-Delicias-Evento` (UUID, también en `body.evento_id`), `X-Delicias-Timestamp` (segundos Unix) y `X-Delicias-Firma: v1=<hex>`, calculada sobre `<timestamp>.<evento>.<cuerpo JSON>`. Si falta `N8N_WEBHOOK_SECRET`, la API no envía nada a n8n y lo registra como error. El Webhook responde **200 inmediatamente** para no superar los cinco segundos de espera de la API. Antes de ejecutar acciones:

1. **Comprobar marca de tiempo** (Code, sin módulos ni variables de entorno) descarta marcas con más de ±5 minutos de diferencia, ids repetidos (anti-replay, recordados 10 minutos en los datos estáticos del flujo) y peticiones sin firma.
2. **Calcular firma** (nodo nativo Crypto) calcula el HMAC con el secreto compartido.
3. **¿Firma válida?** compara ambas firmas; su salida falsa queda desconectada.

El reloj del servidor y el de n8n deben estar sincronizados (NTP). Los datos estáticos solo se conservan en ejecuciones de producción (flujo activo).

| `tipo` | Cuándo | Contenido |
|---|---|---|
| `pedido.creado` | Entra un pedido (web, mesa o WhatsApp) | `pedido` completo con líneas, teléfono, tipo, `mesa_nombre`, `fuera_horario` y `atender_desde` |
| `pedido.estado` | El personal lo mueve de columna | `pedido` + `estado_anterior` |
| `pedido.mesa` | Un pedido cambia de mesa | `pedido` + `estado_anterior` |
| `mesa.llamada` | Una mesa llama al personal o pide la cuenta | `llamada` con `mesa_numero`, `mesa_nombre`, `motivo` y `created_at` |
| `stock.bajo` / `stock.agotado` | Un producto cruza el mínimo o llega a cero | `id`, `nombre`, `stock`, `stock_minimo` |
| `opinion.nueva` | Entra una opinión pendiente de revisión | `id`, `nombre`, `puntuacion`, `comentario`, `verificada` |

El Switch lee **`body.tipo`**, porque n8n coloca el JSON recibido dentro de `body`. Incluye estas acciones:

- **Pedido listo**: WhatsApp por Evolution únicamente para `pedido.estado`, estado `listo`, tipo distinto de `mesa` y teléfono no vacío. El mensaje usa el nombre del cliente y `numero_dia`, no el identificador interno.
- **Recibido fuera de horario**: para `pedido.creado`, `pedido.fuera_horario === true` y teléfono no vacío. Confirma al instante el número de la apertura y cuándo se preparará, con fecha española y hora de Madrid. Comparte **Normalizar teléfono** y **Avisar por WhatsApp**, sin duplicar credenciales ni enviar también el aviso de listo.
- **Llamada de mesa**: Telegram al grupo del personal, distinguiendo atención y cuenta. Muestra `mesa_nombre` o, si está vacío, `Mesa N`.
- **Stock**: Telegram al dueño para mínimos y agotados.
- **Opinión nueva**: Telegram al dueño, indicando si procede de un pedido verificado.

Las salidas **Pedido creado · reservado** (el resto de pedidos creados), **Cambio de mesa** y **Otros eventos** quedan sin conectar, preparadas para ampliaciones. Los textos dinámicos de Telegram se escapan para que nombres y comentarios con `<`, `>` o `&` no se interpreten como HTML.

La confirmación de apertura dice «¡Hola {nombre}! Hemos recibido tu pedido #{numero_dia} en Las Delicias. Ahora estamos cerrados: lo prepararemos {día} a partir de las {hora} y te avisaremos cuando esté listo. ¡Gracias!». Una fecha de apertura inválida detiene la ejecución; no se sustituye por otra inventada. Importa de nuevo el JSON o añade la rama al flujo ya configurado sin perder sus credenciales. Para WhatsApp, el agente debe usar la respuesta de creación y esta confirmación, sin prometer que se está preparando mientras el local siga cerrado.

### Preparar Telegram

1. Abre **@BotFather** en Telegram, ejecuta `/newbot` y crea un bot para Las Delicias. Guarda su token únicamente en una credencial **Telegram API** de n8n, por ejemplo «Telegram de Las Delicias».
2. Añade el bot al grupo del personal y permite que envíe mensajes. El dueño debe abrir la conversación privada con el bot y pulsar **Iniciar** (`/start`); un bot no puede iniciar esa conversación por sí solo.
3. Para obtener los `chat_id`, crea un flujo temporal con **Telegram Trigger**, selecciona esa credencial y escucha mensajes de prueba. En el grupo, envía un comando dirigido al bot, por ejemplo `/prueba@CAMBIAR_USUARIO_BOT`, para que lo reciba incluso con la privacidad de grupos activada. Copia `message.chat.id` de la salida: el del grupo suele ser negativo; conserva el signo.
4. Repite la escucha enviando `/start` en el chat privado del dueño y copia su `message.chat.id`. Detén la prueba y elimina el flujo temporal; el flujo de avisos solo necesita los nodos de envío. Telegram permite un único webhook por bot: usa un bot dedicado para no reemplazar el de otra integración.

### Preparar Evolution API v2

1. La instancia de WhatsApp debe existir y estar conectada. Comprueba la versión e imagen en el servidor, por ejemplo con `docker inspect --format '{{.Config.Image}}' evolution-api`; este repositorio no despliega ese contenedor.
2. Crea en n8n una credencial genérica **Header Auth**, por ejemplo «Evolution de Las Delicias»: **Name** = `apikey`; **Value** = la clave real de Evolution (`CAMBIAR_APIKEY_EVOLUTION` hasta configurarla). No pongas la clave en el cuerpo, la URL ni el archivo del repositorio.
3. El nodo **Avisar por WhatsApp** hace POST a `http://evolution-api:8080/message/sendText/CAMBIAR_INSTANCIA_EVOLUTION` con `{ "number": "...", "text": "..." }`. Este contrato está confirmado en los esquemas oficiales de [v2.2.3](https://github.com/evolution-foundation/evolution-api/blob/2.2.3/src/validate/message.schema.ts) y [v2.3.7](https://github.com/evolution-foundation/evolution-api/blob/2.3.7/src/validate/message.schema.ts), en `textMessageSchema`.

La [referencia web de sendText](https://docs.evolutionfoundation.com.br/es/evolution-api/send-text-message) actualmente muestra `textMessage.text`, en discrepancia con esos esquemas de v2. **No cambies al formato anidado por defecto**: comprueba el contrato de la versión realmente instalada. Solo si esa versión exige el formato anidado, cambia el campo JSON del nodo a `={{ { number: $json.telefono, textMessage: { text: $json.mensaje } } }}` antes de activarlo. No se ha comprobado una instalación remota de Evolution al generar este archivo.

El nodo **Normalizar teléfono** elimina espacios, guiones, paréntesis y `+`, convierte el prefijo internacional `00` y antepone `34` a los números de nueve cifras que empiezan por 6, 7, 8 o 9. No duplica el prefijo de un número ya internacional. Si el resultado no tiene entre 7 y 15 cifras y primera cifra distinta de cero, detiene la ejecución con un error, sin enviar WhatsApp.

### Importar, configurar y activar

1. En n8n, abre **Workflows → Import from file** e importa [las-delicias-eventos.json](n8n/las-delicias-eventos.json).
2. Sustituye los marcadores siguientes en el editor. Las referencias a credenciales se sustituyen **seleccionando las credenciales reales en cada nodo**, no escribiendo sus identificadores a mano.

| Marcador | Dónde | Configuración |
|---|---|---|
| `CAMBIAR_SECRETO_COMPARTIDO` | Campo **Secret** del nodo **Calcular firma** | El mismo `N8N_WEBHOOK_SECRET` del servidor |
| `CAMBIAR_INSTANCIA_EVOLUTION` | URL de **Avisar por WhatsApp** | Nombre de la instancia conectada, codificado para URL si contiene caracteres especiales |
| `CAMBIAR_CREDENCIAL_EVOLUTION` | Credencial de **Avisar por WhatsApp** | Selecciona la credencial Header Auth creada |
| `CAMBIAR_CREDENCIAL_TELEGRAM` | Credencial de los tres nodos Telegram | Selecciona la credencial del bot creado |
| `CAMBIAR_CHAT_ID_GRUPO_PERSONAL` | **Avisar al personal por Telegram** | `chat_id` del grupo, incluido su signo |
| `CAMBIAR_CHAT_ID_DUENO` | **Avisar de stock al dueño** y **Avisar de opinión al dueño** | `chat_id` privado del dueño en ambos nodos |

3. La API, n8n y `evolution-api` deben compartir una red Docker donde se resuelvan los nombres `n8n` y `evolution-api`. La API ya se une a la red externa `PROXY_NETWORK` de [docker-compose.yml](docker-compose.yml); une también esos servicios a esa red si aún no la comparten. No hace falta publicar los puertos 5678 ni 8080 en Internet.
4. Comprueba la configuración de despliegue del servidor: `N8N_WEBHOOK_URL=http://n8n:5678/webhook/las-delicias` y el secreto compartido. Si el instalador ya generó `N8N_WEBHOOK_SECRET`, conserva ese valor y cópialo al nodo **Calcular firma**. No lo confundas con `N8N_API_KEY` (n8n → API) ni con la clave de Evolution.
5. Guarda el flujo y **actívalo** cuando las credenciales y los marcadores estén configurados. Evita tener otro workflow activo con el mismo método POST y path `las-delicias`.

No se incluyen reintentos automáticos para evitar WhatsApps duplicados. Los errores de Telegram, Evolution o normalización detienen la ejecución y se revisan en **Ejecuciones** de n8n. Protege el acceso a n8n y limita la conservación de ejecuciones: sus datos pueden contener teléfonos, nombres y comentarios (la firma no revela el secreto). Configura `EXECUTIONS_DATA_PRUNE=true` y `EXECUTIONS_DATA_MAX_AGE` (p. ej. 168 horas) en n8n. No vuelvas a guardar en Git una exportación con el secreto ya configurado.

### Probar con curl

Esta prueba **envía un aviso real de stock al dueño**. Usa datos ficticios y confirma primero el destinatario. Desde una terminal Bash con acceso a la URL pública HTTPS de n8n:

```bash
read -r -s -p 'Secreto de N8N_WEBHOOK_SECRET: ' DELICIAS_SECRET
printf '\n'
EVENTO=$(cat /proc/sys/kernel/random/uuid)
TS=$(date +%s)
CUERPO='{"tipo":"stock.bajo","id":"00000000-0000-4000-8000-000000000001","nombre":"Producto de prueba","stock":2,"stock_minimo":5,"evento_id":"'"${EVENTO}"'","enviado_en":"2026-01-01T12:00:00.000Z"}'
FIRMA=$(printf '%s' "${TS}.${EVENTO}.${CUERPO}" | openssl dgst -sha256 -hmac "${DELICIAS_SECRET}" -hex | sed 's/^.* //')
curl --fail-with-body --include --request POST \
  'https://CAMBIAR_DOMINIO_N8N/webhook/las-delicias' \
  --header 'Content-Type: application/json' \
  --header "X-Delicias-Evento: ${EVENTO}" \
  --header "X-Delicias-Timestamp: ${TS}" \
  --header "X-Delicias-Firma: v1=${FIRMA}" \
  --data-binary "${CUERPO}"
unset DELICIAS_SECRET
```

El cuerpo debe ir en una sola línea y sin espacios, igual que lo serializa la API (`JSON.stringify`), porque n8n vuelve a serializarlo para comprobar la firma.

Debes recibir **HTTP 200** inmediatamente y el dueño, `📦 Quedan 2 de Producto de prueba (mínimo 5)`. Repite **exactamente la misma petición** (replay) y otra con un secreto incorrecto: también recibirás 200, pero **no debe enviarse ningún mensaje**. Un 200 confirma recepción, no autenticación ni entrega; comprueba el aviso y los posibles errores en Ejecuciones.

Para una prueba manual sin activar el flujo, pulsa **Listen for test event** en el Webhook y usa `/webhook-test/las-delicias` en lugar de `/webhook/las-delicias`. La URL de producción necesita el flujo activo. El nombre interno `http://n8n:5678` solo se resuelve desde su red Docker; úsalo en curl únicamente desde un contenedor de esa red. Las pruebas de WhatsApp deben usar un teléfono propio y un evento `pedido.estado` con estado `listo`, tipo `recoger` o `whatsapp` y los datos del pedido.

### Llamadas de n8n → API

Cabecera `X-Api-Key: <N8N_API_KEY>`:

| Método | Ruta | Uso |
|---|---|---|
| GET | `/productos` | Carta con disponibilidad (pública) |
| GET | `/negocio` | Dirección, horario, teléfono, Instagram, servicios (pública) |
| GET | `/horario/estado` | Apertura actual y siguiente, con el mismo cálculo que al crear pedidos (pública) |
| POST | `/n8n/pedidos` | Crear pedido de WhatsApp: `{ items:[{producto_id,cantidad}], nombre, telefono, hora_recogida?, notas? }` — el precio lo calcula la API |
| GET | `/n8n/pedidos/:codigo` | Consultar un pedido |
| PATCH | `/n8n/pedidos/:id` | Cambiar estado: `{ "estado": "listo" }` |

### Opiniones

Cada opinión nueva llega a n8n como `opinion.nueva` (`{ id, nombre, puntuacion, comentario, verificada }`): el flujo importable avisa al dueño por Telegram de que hay una por revisar. Se publican desde el panel → **⭐ Opiniones**. El enlace a Páginas Amarillas está en la ficha del negocio (`resenas_externas`).

### Avisos de stock

Además de los pedidos, la API envía a n8n `stock.bajo` y `stock.agotado` (`{ id, nombre, stock, stock_minimo }`) cuando un producto envasado cruza su mínimo. El flujo importable envía al dueño el aviso de mínimo o de producto agotado por Telegram.

## 6. Caja registradora (TPV)

La integración está preparada para cuando sepamos qué caja usan. Hay dos caminos:

**A. Conexión directa** (la API consulta la caja cada `TPV_INTERVALO_MIN` minutos): en `.env`, `TPV_PROVEEDOR=loyverse|revo|agora` y sus credenciales. Loyverse está implementado; Revo y Ágora tienen el adaptador preparado (`src/tpv/`) a falta de confirmar su endpoint de stock con el negocio. Para otra marca se añade un archivo en `src/tpv/` con `leerStock()`.

**B. Puente con n8n** (sirve para cualquier caja que n8n pueda leer: API, base de datos, exportación CSV…): un flujo programado lee el stock y llama a

```http
POST /n8n/stock
X-Api-Key: <N8N_API_KEY>
{ "origen": "glop", "articulos": [{ "codigo_tpv": "REF-33", "stock": 18 }] }
```

En ambos casos, cada producto de la carta se enlaza con su artículo de la caja rellenando **"Código en la caja"** en el panel (Carta → Editar). La caja manda: su stock sobrescribe el de la app y a 0 el producto pasa a "Agotado". El estado de la conexión y la última sincronización se ven en el panel (pestaña Carta).

Sin caja conectada, el stock de los envasados se lleva en la propia app: cada pedido descuenta, al cancelar se devuelve y a 0 queda agotado.

## 7. Copias de seguridad

El servicio `backup` guarda un volcado diario en `server/backups/` (14 días). Para tener copia **fuera** del servidor, activa también los Backups de Hetzner en la consola (≈20 % del precio del servidor) o sincroniza esa carpeta a otro almacenamiento.

Restaurar:

```bash
docker compose exec -T db pg_restore -U delicias -d delicias --clean < backups/delicias-AAAA-MM-DD.dump
```

## 8. Actualizar

```bash
cd /opt/lasdelicias && git pull
cd server && docker compose up -d --build   # las migraciones nuevas se aplican solas al arrancar
```

o simplemente vuelve a ejecutar `sudo bash /opt/lasdelicias/server/deploy/instalar.sh`.
