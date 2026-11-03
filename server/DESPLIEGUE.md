# Despliegue del backend en OrPiRa-Cloud (Hetzner CX23)

Servidor: 2 vCPU · 4 GB RAM · Ubuntu/Debian con Docker · IPv4 `167.233.139.93`.
Consumo esperado: Postgres + API ≈ 150–250 MB de RAM; cabe holgado junto a n8n.

## Instalación rápida (un comando)

Con el DNS del paso 1 ya creado, en el servidor (con tu usuario; las variables van **después** de `sudo`):

```bash
curl -fsSL https://raw.githubusercontent.com/Orpira/lasdelicias/main/server/deploy/instalar.sh \
  | sudo ADMIN_EMAIL=tu@email.es ADMIN_NOMBRE="Tu nombre" \
         FRONT_ORIGENES="https://lasdelicias.vercel.app" bash
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
- `CORS_ORIGINS`: los dominios del frontend en Vercel, separados por comas (`https://lasdelicias.vercel.app,https://delicias.orpira.es`)
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

Crea en n8n un flujo con un nodo **Webhook** (POST) y pon su URL en `N8N_WEBHOOK_URL`. Primer nodo tras el webhook: un **IF** que compruebe la cabecera `x-delicias-secret` = `N8N_WEBHOOK_SECRET`; descarta lo demás.

| `tipo` | Cuándo | Contenido |
|---|---|---|
| `pedido.creado` | Entra un pedido (web, mesa o WhatsApp) | `pedido` completo con líneas, teléfono y tipo |
| `pedido.estado` | El personal lo mueve de columna | `pedido` + `estado_anterior` |
| `mesa.llamada` | Una mesa llama al personal o pide la cuenta | `llamada` (mesa, motivo) |

Ideas de flujos: `pedido.estado` con `pedido.estado = "listo"` y teléfono → WhatsApp "Tu pedido #N está listo"; `mesa.llamada` → mensaje al grupo de Telegram del personal; resumen diario al cierre.

### Llamadas de n8n → API

Cabecera `X-Api-Key: <N8N_API_KEY>`:

| Método | Ruta | Uso |
|---|---|---|
| GET | `/productos` | Carta con disponibilidad (pública) |
| GET | `/negocio` | Dirección, horario, teléfono, Instagram, servicios (pública) |
| POST | `/n8n/pedidos` | Crear pedido de WhatsApp: `{ items:[{producto_id,cantidad}], nombre, telefono, hora_recogida?, notas? }` — el precio lo calcula la API |
| GET | `/n8n/pedidos/:codigo` | Consultar un pedido |
| PATCH | `/n8n/pedidos/:id` | Cambiar estado: `{ "estado": "listo" }` |

### Avisos de stock

Además de los pedidos, la API envía a n8n `stock.bajo` y `stock.agotado` (`{ id, nombre, stock, stock_minimo }`) cuando un producto envasado cruza su mínimo. Ideal para un mensaje al dueño: "Quedan 5 refrescos".

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
