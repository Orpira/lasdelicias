# Las Delicias · Cafetería ~ Panadería (Málaga)

App de pedidos y atención en el local para Las Delicias (Calle Ayala, 28 · Málaga).

- **Clientes**: carta online, pedido desde la mesa con QR, encargo para recoger a una hora, seguimiento del pedido en directo, llamar al personal o pedir la cuenta desde la mesa.
- **Mesas seguras**: cada QR lleva un código secreto (`/m/<código>`), así que nadie puede pedir "a otra mesa" cambiando un número en la URL. Si un móvil con un pedido en curso escanea otra mesa, se le pregunta si se ha cambiado; la barra ve el cambio declarado (🔄) o el sospechoso (⚠). Cada QR se puede regenerar desde el panel.
- **Barra**: pedidos en tiempo real (nuevos → preparando → listos), avisos sonoros, llamadas de mesa, avisos de stock bajo.
- **Cocina (tablet)**: comandas por orden de llegada, filtradas por puesto (cocina, barra, pastelería), platos que se tachan al tocarlos, tiempos en colores, resumen de producción y pantalla siempre encendida.
- **Carta**: agotados con un toque, productos y fotos, stock de envasados, enlace con la caja (TPV), hoja de QR imprimible.
- **Ecosistema**: los eventos (pedido creado, cambio de estado o de mesa, llamada de mesa, stock bajo) salen hacia **n8n**, que puede avisar por WhatsApp/Telegram, publicar en Instagram, atender pedidos por WhatsApp con IA o sincronizar el stock con la caja, usando la misma API.

## Arquitectura

```
Vercel ─ PWA React (este repo)                 Servidor Hetzner (docker compose, carpeta server/)
  /            portada + ficha del negocio      ┌─ Caddy/Nginx  → https://api-delicias.orpira.es
  /menu        carta                            ├─ API Node (Fastify)
  /m/:código   destino del QR de cada mesa  ──► │    precios recalculados en servidor, SSE en directo
  /pedido      enviar pedido                    ├─ PostgreSQL 16 (LISTEN/NOTIFY → eventos)
  /pedido/:cod seguimiento en directo           ├─ backup diario (pg_dump, 14 días)
  /admin       barra · cocina · carta · QR      ├─ n8n ◄── eventos firmados / ──► X-Api-Key
                                                └─ caja (TPV) ──► stock de envasados (src/tpv/)
```

Una sola fuente de datos: la carta (`GET /productos`) y la ficha del negocio (`GET /negocio`: dirección, horario, teléfono, Instagram, servicios) las consumen por igual la web, n8n y cualquier canal futuro.

## Desarrollo local

```bash
# API (necesita un PostgreSQL)
cd server && cp .env.example .env   # ajusta DATABASE_URL y secretos
npm install && npm run dev          # migra y carga la carta de demo al arrancar
STAFF_PASSWORD='una-clave-larga' npm run crear-staff -- tu@email.es "Tu nombre" admin

# Web
cd .. && npm install
echo "VITE_API_URL=http://localhost:3001" > .env.local
npm run dev
```

## Despliegue

- **Backend en el servidor**: un comando con `server/deploy/instalar.sh`; detalles en [server/DESPLIEGUE.md](server/DESPLIEGUE.md).
- **Frontend en Vercel**: importar el repo, framework Vite, variable `VITE_API_URL=https://api-delicias.orpira.es`. `vercel.json` ya resuelve las rutas del SPA.

## Nombres de mesa

El nombre se edita en el panel de QR de mesas. Los clientes ven «Mesa 7» si conserva el nombre por defecto, o solo el nombre personalizado, como «Terraza 2». El personal ve «Terraza 2 (mesa 7)» en los pedidos, llamadas, avisos de cambio, cocina y gestión de QR.

Las etiquetas se centralizan en `src/lib/mesa.ts`. El QR guarda también el nombre en el carrito; los carritos antiguos sin nombre siguen funcionando y muestran «Mesa N». Los pedidos y llamadas de la API incluyen `mesa_nombre`, también en los eventos SSE y de n8n, sin migraciones ni cambios de esquema.

Pruebas de las etiquetas: `node --experimental-strip-types --test src/lib/mesa.test.js`.

## Privacidad y almacenamiento

- `/aviso-legal`, `/privacidad` y `/cookies` leen la ficha pública del negocio y están enlazadas en el pie de página. Los datos legales desconocidos se muestran como `[Pendiente: …]`, nunca se deducen del nombre comercial.
- Google Maps solo se inserta después de pulsar «Ver mapa»; «Cómo llegar» sigue abriendo el servicio externo. La fuente Bricolage Grotesque se sirve localmente, sin Google Fonts.
- Nombre y teléfono solo se recuerdan si se marca la casilla al enviar el pedido; enviar otro pedido sin marcarla elimina ese recordatorio. El resto del almacenamiento técnico y sus duraciones reales se detallan en `/cookies`, sin analítica ni publicidad.

La migración `server/migrations/006_datos_legales.sql` añade `titular`, `nif` y `email_contacto` como datos pendientes, y `conservacion_meses` con valor inicial 12, sin sobrescribir valores existentes. Completa la ficha mediante SQL o `PUT /admin/negocio` (requiere la ficha completa; los campos legales opcionales omitidos se conservan). El email debe ser válido y el plazo, un entero de 1 a 60 meses; `null` en el plazo aplica los 12 meses por defecto.

Antes de publicar, completa el titular, NIF, email de contacto, los datos registrales si proceden y el nombre del encargado del tratamiento en la política de privacidad. Domicilio y teléfono proceden de la ficha y también muestran un hueco si faltan. Revisa los textos legales con los datos y servicios realmente contratados.

La API ejecuta la anonimización un minuto después de arrancar y cada 24 horas. Vacía los datos personales de pedidos antiguos, incluida la relación `cliente_id` para evitar reidentificar desde la ficha del cliente, y elimina clientes sin pedidos recientes. Conserva los productos, importes y opiniones. La operación es transaccional e idempotente, registra recuentos sin datos personales y termina antes de cerrar el pool al apagar. El plazo se consulta en cada ejecución. Revisa también la retención de copias de seguridad y de automatizaciones externas, que no modifica esta tarea.

## Favicon e iconos móviles

El favicon y los iconos de inicio usan el logo original de `public/logo.webp`, centrado sobre su fondo granate y sin recortes. `index.html` enlaza el favicon ICO/PNG, el icono de Apple de 180 × 180 y `public/site.webmanifest`, que declara los iconos Android de 192 y 512 píxeles y una variante adaptable con margen seguro.

- **iPhone/iPad (Safari)**: Compartir → Añadir a pantalla de inicio.
- **Android (Chrome)**: menú → Añadir a pantalla de inicio o Instalar aplicación, según el navegador.

Estos iconos no añaden funcionamiento sin conexión.

## Fotos de la portada

Junto a «Pan, pasteles y comida casera en Calle Ayala», la foto de la vitrina alterna con la del interior de la cafetería cada cinco segundos, con una transición suave. Los controles permiten elegir una foto y pausar o reanudar la rotación. Se pausa mientras hay foco o el puntero está sobre las fotos; no cambia de foto en una pestaña oculta ni se inicia automáticamente si se prefiere movimiento reducido.

La foto del interior aportada para la web está optimizada en `public/interior-cafeteria.webp`; se conserva completa y se encuadra al mostrarla en la portada.

## Vitrina de la portada

«Hoy en la vitrina» muestra la pastelería disponible en un carrusel horizontal con flechas laterales y desplazamiento táctil. Las flechas avanzan una tarjeta y se desactivan en los extremos o cuando todos los productos caben. El desplazamiento respeta la preferencia de movimiento reducido y mantiene los botones para añadir productos al pedido.

## Contenido de demo

Las fotos de `public/demo/` salen de la ficha pública del negocio y de su Instagram ([@pc_lasdelicias2019](https://instagram.com/pc_lasdelicias2019)). Los **precios son orientativos** salvo las palmeras rellenas (2,60 €, cartel de la vitrina) y la natilla con buñuelos (5 €, publicación de Instagram). Confirmar carta, precios y horario con el negocio antes de abrirlo al público; todo se edita desde `/admin`.
