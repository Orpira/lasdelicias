// Rutas abiertas: carta, pedidos de clientes, seguimiento, llamadas de mesa e imágenes
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { query } from "../db.js";
import { config } from "../config.js";
import { esquemaNuevoPedido, esquemaLlamada, esquemaDispositivo, esquemaOpinion, esquemaInicioStreamMesa, esquemaConsultaHorario, claveIdempotencia, tokenMesa, validar } from "../esquemas.js";
import { estadoHorario } from "../horario.js";
import {
	cambiarDeMesa,
	crearPedidoIdempotente,
	obtenerPedidoPorCodigo,
	pedidosEnOtraMesa,
	vistaPublica,
} from "../pedidos-servicio.js";
import { abrirSSE, suscribirMesa, suscribirSeguimiento } from "../eventos.js";
import { cuentaAbiertaDeMesa, obtenerCuenta } from "../cuentas.js";
import { ErrorOperacion } from "../errores.js";

const TIPOS_IMAGEN = { ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

async function mesaDelQr(token) {
	if (!tokenMesa(token)) throw new ErrorOperacion("Mesa no encontrada", 404);
	const { rows: [mesa] } = await query("SELECT numero, nombre FROM mesas WHERE token = $1 AND activa", [token]);
	if (!mesa) throw new ErrorOperacion("Este QR ya no es válido. Pide ayuda al personal.", 404);
	return mesa;
}

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

	app.get("/horario/estado", async (request, reply) => {
		const { recogida } = validar(esquemaConsultaHorario, request.query);
		const { rows: [negocio] } = await query("SELECT datos, clock_timestamp() AS instante FROM negocio WHERE id = 1");
		if (!negocio) throw new ErrorOperacion("No existe la ficha del negocio para consultar su horario", 500);
		const { horario, dias_cerrado = [] } = negocio.datos;
		reply.header("Cache-Control", "no-store");
		return estadoHorario(horario, dias_cerrado, negocio.instante, { conRecogida: recogida === "true" });
	});

	// Destino del QR: /mesas/qr/<token>?dispositivo=<id>
	// Devuelve la mesa y, si este móvil tiene pedidos en curso en otra mesa, cuáles son
	app.get("/mesas/qr/:token", async (request) => {
		const mesa = await mesaDelQr(request.params.token);
		const dispositivo = String(request.query.dispositivo ?? "");
		const enOtraMesa = /^[a-zA-Z0-9-]{8,64}$/.test(dispositivo) ? await pedidosEnOtraMesa(dispositivo, mesa.numero) : [];
		return { ...mesa, pedidos_en_otra_mesa: enOtraMesa };
	});

	app.get("/mesas/qr/:token/cuenta", async (request, reply) => {
		const mesa = await mesaDelQr(request.params.token);
		reply.header("Cache-Control", "no-store");
		return cuentaAbiertaDeMesa(mesa.numero);
	});

	app.get("/cuentas/:id/resumen", async (request, reply) => {
		const cuenta = await obtenerCuenta(request.params.id, { soloCobradaReciente: true });
		if (!cuenta) return reply.code(404).send({ error: "Este resumen no está disponible o ha caducado" });
		reply.header("Cache-Control", "no-store");
		return cuenta;
	});

	app.get("/mesas/qr/:token/stream", async (request, reply) => {
		const mesa = await mesaDelQr(request.params.token);
		const { desde, cuenta: cuentaPropia } = validar(esquemaInicioStreamMesa, request.query);
		const raw = abrirSSE(request, reply);
		suscribirMesa(mesa.numero, request.params.token, raw);
		try {
			if (desde) {
				const { rows: cierres } = await query(
					`SELECT id, mesa_numero, estado, cerrada_at, total, metodo_pago
					 FROM cuentas WHERE mesa_numero = $1 AND estado IN ('cobrada','anulada')
					 AND cerrada_at >= GREATEST($2::timestamptz, now() - interval '12 hours')
					 ORDER BY (id = $3::bigint) DESC NULLS LAST, cerrada_at, id`,
					[mesa.numero, desde, cuentaPropia ?? null],
				);
				for (const cierre of cierres) {
					raw.write(`event: cuenta\ndata: ${JSON.stringify({
						...cierre, mesa_nombre: mesa.nombre, tipo: `cuenta.${cierre.estado}`,
					})}\n\n`);
				}
			}
			const cuenta = await cuentaAbiertaDeMesa(mesa.numero);
			if (cuenta) raw.write(`event: cuenta\ndata: ${JSON.stringify({ ...cuenta, tipo: "cuenta.actualizada" })}\n\n`);
		} catch (error) {
			request.log.error(error, "No se pudo enviar el estado inicial de la cuenta");
			raw.end();
		}
	});

	// El cliente confirma que se ha cambiado a esta mesa
	app.post(
		"/mesas/qr/:token/cambio",
		{ config: { rateLimit: { max: 30, timeWindow: "10 minutes" } } },
		async (request, reply) => {
			const { dispositivo } = validar(esquemaDispositivo, request.body);
			const mesa = await mesaDelQr(request.params.token);
			const movidos = await cambiarDeMesa(dispositivo, mesa.numero);
			return { mesa: mesa.numero, ...movidos };
		},
	);

	app.post(
		"/pedidos",
		// Generoso: en el local muchos clientes comparten la IP pública del wifi
		{ config: { rateLimit: { max: 60, timeWindow: "10 minutes" } } },
		async (request, reply) => {
			const datos = validar(esquemaNuevoPedido, request.body);
			const clave = claveIdempotencia(request.headers);
			const { pedido, repetido } = await crearPedidoIdempotente({
				items: datos.items,
				nombre: datos.nombre,
				telefono: datos.telefono,
				tipo: datos.tipo,
				mesaToken: datos.mesa_token,
				dispositivo: datos.dispositivo,
				horaRecogida: datos.hora_recogida,
				notas: datos.notas,
			}, clave);
			if (repetido) reply.header("Idempotent-Replayed", "true");
			return reply.code(repetido ? 200 : 201).send(vistaPublica(pedido));
		},
	);

	app.get("/pedidos/:codigo", async (request, reply) => {
		const pedido = await obtenerPedidoPorCodigo(String(request.params.codigo));
		if (!pedido) return reply.code(404).send({ error: "Pedido no encontrado" });
		const { rows } = await query("SELECT 1 FROM opiniones WHERE pedido_codigo = $1", [pedido.codigo]);
		return { ...vistaPublica(pedido), opinada: rows.length > 0 };
	});

	// Opiniones publicadas, en orden aleatorio, con la media y el total
	app.get("/opiniones", async (request, reply) => {
		const n = Math.min(12, Math.max(1, Number(request.query.n) || 3));
		const [{ rows: opiniones }, { rows: [resumen] }] = await Promise.all([
			query(
				`SELECT id, nombre, puntuacion, comentario, verificada, created_at
				 FROM opiniones WHERE estado = 'publicada' ORDER BY random() LIMIT $1`,
				[n],
			),
			query(
				`SELECT count(*)::int AS total, round(avg(puntuacion)::numeric, 1) AS media
				 FROM opiniones WHERE estado = 'publicada'`,
			),
		]);
		reply.header("Cache-Control", "no-store");
		return { total: resumen.total, media: resumen.media, opiniones };
	});

	app.post(
		"/opiniones",
		{ config: { rateLimit: { max: 15, timeWindow: "30 minutes" } } },
		async (request, reply) => {
			const d = validar(esquemaOpinion, request.body);
			const respuesta = { ok: true, mensaje: "¡Gracias! Publicaremos tu opinión en cuanto la revisemos." };
			if (d.web) return reply.code(201).send(respuesta); // bot: se descarta en silencio

			let verificada = false;
			if (d.pedido_codigo) {
				const { rows } = await query("SELECT estado FROM pedidos WHERE codigo = $1", [d.pedido_codigo]);
				if (!rows[0]) return reply.code(404).send({ error: "Pedido no encontrado" });
				if (!["listo", "entregado"].includes(rows[0].estado)) {
					return reply.code(409).send({ error: "Podrás valorar tu pedido cuando te lo hayamos entregado" });
				}
				verificada = true;
			}
			try {
				await query(
					`INSERT INTO opiniones (nombre, puntuacion, comentario, pedido_codigo, verificada)
					 VALUES ($1, $2, $3, $4, $5)`,
					[d.nombre, d.puntuacion, d.comentario, d.pedido_codigo ?? null, verificada],
				);
			} catch (err) {
				if (err.code === "23505") return reply.code(409).send({ error: "Ya has valorado este pedido. ¡Gracias!" });
				throw err;
			}
			return reply.code(201).send(respuesta);
		},
	);

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
		{ config: { rateLimit: { max: 30, timeWindow: "5 minutes" } } },
		async (request, reply) => {
			const { motivo } = validar(esquemaLlamada, request.body);
			const mesa = await mesaDelQr(request.params.token);
			const numero = mesa.numero;
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
