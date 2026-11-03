// Rutas abiertas: carta, pedidos de clientes, seguimiento, llamadas de mesa e imágenes
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { query } from "../db.js";
import { config } from "../config.js";
import { esquemaNuevoPedido, esquemaLlamada, esquemaDispositivo, tokenMesa, validar } from "../esquemas.js";
import {
	cambiarDeMesa,
	crearPedido,
	obtenerPedidoPorCodigo,
	pedidosEnOtraMesa,
	vistaPublica,
} from "../pedidos-servicio.js";
import { abrirSSE, suscribirSeguimiento } from "../eventos.js";

const TIPOS_IMAGEN = { ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

export default async function rutasPublicas(app) {
	app.get("/productos", async () => {
		const { rows } = await query(
			`SELECT id, nombre, descripcion, precio, categoria, valoracion, imagen_url,
			        sin_gluten, alergenos, disponible,
			        CASE WHEN stock IS NOT NULL AND stock <= GREATEST(stock_minimo, 3) THEN stock END AS quedan
			 FROM productos WHERE activo
			 ORDER BY categoria, orden, nombre`,
		);
		return rows;
	});

	// Ficha del negocio (dirección, horario, contacto…): la usan la web y n8n
	app.get("/negocio", async (request, reply) => {
		const { rows } = await query("SELECT datos, updated_at FROM negocio WHERE id = 1");
		reply.header("Cache-Control", "public, max-age=300");
		return { ...rows[0]?.datos, actualizado: rows[0]?.updated_at };
	});

	// Destino del QR: /mesas/qr/<token>?dispositivo=<id>
	// Devuelve la mesa y, si este móvil tiene pedidos en curso en otra mesa, cuáles son
	app.get("/mesas/qr/:token", async (request, reply) => {
		if (!tokenMesa(request.params.token)) return reply.code(404).send({ error: "Mesa no encontrada" });
		const { rows } = await query("SELECT numero, nombre FROM mesas WHERE token = $1 AND activa", [request.params.token]);
		if (!rows[0]) return reply.code(404).send({ error: "Este QR ya no es válido. Pide ayuda al personal." });
		const dispositivo = String(request.query.dispositivo ?? "");
		const enOtraMesa = /^[a-zA-Z0-9-]{8,64}$/.test(dispositivo) ? await pedidosEnOtraMesa(dispositivo, rows[0].numero) : [];
		return { ...rows[0], pedidos_en_otra_mesa: enOtraMesa };
	});

	// El cliente confirma que se ha cambiado a esta mesa
	app.post(
		"/mesas/qr/:token/cambio",
		{ config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
		async (request, reply) => {
			if (!tokenMesa(request.params.token)) return reply.code(404).send({ error: "Mesa no encontrada" });
			const { dispositivo } = validar(esquemaDispositivo, request.body);
			const { rows } = await query("SELECT numero FROM mesas WHERE token = $1 AND activa", [request.params.token]);
			if (!rows[0]) return reply.code(404).send({ error: "Este QR ya no es válido" });
			const movidos = await cambiarDeMesa(dispositivo, rows[0].numero);
			return { mesa: rows[0].numero, pedidos: movidos };
		},
	);

	app.post(
		"/pedidos",
		{ config: { rateLimit: { max: 8, timeWindow: "10 minutes" } } },
		async (request, reply) => {
			const datos = validar(esquemaNuevoPedido, request.body);
			const pedido = await crearPedido({
				items: datos.items,
				nombre: datos.nombre,
				telefono: datos.telefono,
				tipo: datos.tipo,
				mesaToken: datos.mesa_token,
				dispositivo: datos.dispositivo,
				horaRecogida: datos.hora_recogida,
				notas: datos.notas,
			});
			return reply.code(201).send(vistaPublica(pedido));
		},
	);

	app.get("/pedidos/:codigo", async (request, reply) => {
		const pedido = await obtenerPedidoPorCodigo(String(request.params.codigo));
		if (!pedido) return reply.code(404).send({ error: "Pedido no encontrado" });
		return vistaPublica(pedido);
	});

	// Seguimiento en tiempo real para el cliente
	app.get("/pedidos/:codigo/stream", async (request, reply) => {
		const pedido = await obtenerPedidoPorCodigo(String(request.params.codigo));
		if (!pedido) return reply.code(404).send({ error: "Pedido no encontrado" });
		const raw = abrirSSE(request, reply);
		raw.write(`event: pedido\ndata: ${JSON.stringify(vistaPublica(pedido))}\n\n`);
		suscribirSeguimiento(pedido.codigo, raw);
	});

	app.post(
		"/mesas/qr/:token/llamar",
		{ config: { rateLimit: { max: 4, timeWindow: "5 minutes" } } },
		async (request, reply) => {
			if (!tokenMesa(request.params.token)) return reply.code(404).send({ error: "Mesa no encontrada" });
			const { motivo } = validar(esquemaLlamada, request.body);
			const { rows: mesa } = await query("SELECT numero FROM mesas WHERE token = $1 AND activa", [request.params.token]);
			if (!mesa[0]) return reply.code(404).send({ error: "Este QR ya no es válido. Vuelve a escanearlo." });
			const numero = mesa[0].numero;
			// Si ya hay una llamada pendiente de esa mesa por el mismo motivo, no se duplica
			const { rows: pendiente } = await query(
				"SELECT id FROM llamadas_mesa WHERE mesa_numero = $1 AND motivo = $2 AND NOT atendida",
				[numero, motivo],
			);
			if (!pendiente[0]) {
				await query("INSERT INTO llamadas_mesa (mesa_numero, motivo) VALUES ($1, $2)", [numero, motivo]);
			}
			return reply.code(201).send({ ok: true });
		},
	);

	app.get("/uploads/:archivo", async (request, reply) => {
		const archivo = String(request.params.archivo);
		if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(archivo)) return reply.code(404).send();
		const ruta = path.join(config.uploadsDir, archivo);
		try {
			await stat(ruta);
		} catch {
			return reply.code(404).send();
		}
		reply.header("Cache-Control", "public, max-age=31536000, immutable");
		reply.type(TIPOS_IMAGEN[path.extname(archivo)]);
		return reply.send(createReadStream(ruta));
	});
}
