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

## Contenido de demo

Las fotos de `public/demo/` salen de la ficha pública del negocio y de su Instagram ([@pc_lasdelicias2019](https://instagram.com/pc_lasdelicias2019)). Los **precios son orientativos** salvo las palmeras rellenas (2,60 €, cartel de la vitrina) y la natilla con buñuelos (5 €, publicación de Instagram). Confirmar carta, precios y horario con el negocio antes de abrirlo al público; todo se edita desde `/admin`.
