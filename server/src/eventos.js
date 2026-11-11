// Bus de eventos: escucha el canal "delicias" de Postgres y reparte cada evento
//  - al panel del local (SSE, personal autenticado)
//  - al seguimiento del cliente (SSE, por código de pedido)
//  - a n8n (webhook HTTP firmado con HMAC-SHA256, marca de tiempo e id de evento; ver firma.js)
import pg from "pg";
import { config } from "./config.js";
import { obtenerPedidoPorId, vistaPublica } from "./pedidos-servicio.js";
import { query } from "./db.js";
import { obtenerCuenta } from "./cuentas.js";
import { firmarEvento } from "./firma.js";

const clientesPanel = new Set(); // respuestas SSE del personal
const clientesSeguimiento = new Map(); // codigo -> Set de respuestas SSE
const clientesMesa = new Map(); // numero -> Set de conexiones autorizadas por su QR

function enviarSSE(raw, evento, datos) {
	raw.write(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`);
}

/** Abre un stream SSE sobre la respuesta de Fastify. Devuelve el objeto raw. */
export function abrirSSE(request, reply) {
	reply.hijack();
	reply.raw.writeHead(200, {
		...reply.getHeaders(), // conserva cabeceras CORS
		"Content-Type": "text/event-stream; charset=utf-8",
		"Cache-Control": "no-cache, no-transform",
		Connection: "keep-alive",
		"X-Accel-Buffering": "no", // Nginx: no almacenar en búfer
	});
	reply.raw.write("retry: 3000\n\n");
	const latido = setInterval(() => reply.raw.write(": ping\n\n"), 25_000);
	request.raw.on("close", () => clearInterval(latido));
	return reply.raw;
}

export function suscribirPanel(raw) {
	clientesPanel.add(raw);
	raw.on("close", () => clientesPanel.delete(raw));
}

export function suscribirSeguimiento(codigo, raw) {
	if (!clientesSeguimiento.has(codigo)) clientesSeguimiento.set(codigo, new Set());
	const set = clientesSeguimiento.get(codigo);
	set.add(raw);
	raw.on("close", () => {
		set.delete(raw);
		if (set.size === 0) clientesSeguimiento.delete(codigo);
	});
}

export function suscribirMesa(numero, token, raw, { diferir = false } = {}) {
	if (!clientesMesa.has(numero)) clientesMesa.set(numero, new Set());
	const conexiones = clientesMesa.get(numero);
	const conexion = { token, raw, pendientes: diferir ? [] : null };
	conexiones.add(conexion);
	const activar = () => {
		if (conexion.pendientes === null) return;
		for (const evento of conexion.pendientes) enviarSSE(raw, "cuenta", evento);
		conexion.pendientes = null;
	};
	raw.on("close", () => {
		conexiones.delete(conexion);
		if (!conexiones.size) clientesMesa.delete(numero);
	});
	return activar;
}

let avisadoSinSecreto = false;

async function enviarAN8n(evento, log) {
	if (!config.n8nWebhookUrl) return;
	// Sin secreto no se puede firmar: no se envían datos personales sin autenticar
	if (!config.n8nWebhookSecret) {
		if (!avisadoSinSecreto) log.error("N8N_WEBHOOK_URL está configurada pero falta N8N_WEBHOOK_SECRET: no se envían eventos a n8n");
		avisadoSinSecreto = true;
		return;
	}
	try {
		const { cuerpo, cabeceras } = firmarEvento(config.n8nWebhookSecret, evento);
		const res = await fetch(config.n8nWebhookUrl, {
			method: "POST",
			headers: cabeceras,
			body: cuerpo,
			signal: AbortSignal.timeout(5_000),
		});
		if (!res.ok) log.warn({ status: res.status, tipo: evento.tipo }, "n8n respondió con error");
	} catch (err) {
		log.warn({ err: err.message, tipo: evento.tipo }, "No se pudo avisar a n8n");
	}
}

async function procesar(aviso, log) {
	if (aviso.tipo.startsWith("pedido.")) {
		const pedido = await obtenerPedidoPorId(aviso.id);
		if (!pedido) return;
		for (const raw of clientesPanel) enviarSSE(raw, "pedido", pedido);
		for (const raw of clientesSeguimiento.get(pedido.codigo) ?? []) {
			enviarSSE(raw, "pedido", vistaPublica(pedido));
		}
		await enviarAN8n({ tipo: aviso.tipo, estado_anterior: aviso.estado_anterior, pedido }, log);
	} else if (aviso.tipo.startsWith("cuenta.")) {
		const [cuenta, { rows: [mesa] }] = await Promise.all([
			obtenerCuenta(aviso.id),
			query(
				`SELECT m.token, m.activa, c.motivo_anulacion
				 FROM cuentas c JOIN mesas m ON m.numero = c.mesa_numero WHERE c.id = $1`,
				[aviso.id],
			),
		]);
		if (!cuenta || !mesa) return;
		const evento = { ...cuenta, tipo: aviso.tipo };
		for (const raw of clientesPanel) enviarSSE(raw, "cuenta", evento);
		for (const conexion of clientesMesa.get(cuenta.mesa_numero) ?? []) {
			if (mesa.activa && conexion.token === mesa.token) {
				if (conexion.pendientes) conexion.pendientes.push(evento);
				else enviarSSE(conexion.raw, "cuenta", evento);
			}
			else conexion.raw.end();
		}
		await enviarAN8n({ ...evento, motivo_anulacion: mesa.motivo_anulacion }, log);
	} else if (aviso.tipo === "opinion.nueva") {
		for (const raw of clientesPanel) enviarSSE(raw, "opinion", aviso);
		await enviarAN8n(aviso, log);
	} else if (aviso.tipo.startsWith("stock.")) {
		for (const raw of clientesPanel) enviarSSE(raw, "stock", aviso);
		await enviarAN8n(aviso, log);
	} else if (aviso.tipo === "mesa.llamada" || aviso.tipo === "mesa.atendida") {
		const { rows } = await query(
			`SELECT l.id, l.mesa_numero, m.nombre AS mesa_nombre, l.motivo, l.atendida, l.created_at
			 FROM llamadas_mesa l
			 LEFT JOIN mesas m ON m.numero = l.mesa_numero
			 WHERE l.id = $1`,
			[aviso.id],
		);
		const llamada = rows[0];
		if (!llamada) return;
		for (const raw of clientesPanel) enviarSSE(raw, "llamada", llamada);
		if (aviso.tipo === "mesa.llamada") await enviarAN8n({ tipo: aviso.tipo, llamada }, log);
	}
}

/** Mantiene una conexión LISTEN dedicada, reconectando si se cae. */
export function iniciarEscucha(log) {
	let cliente;
	let cerrado = false;

	async function conectar() {
		cliente = new pg.Client({ connectionString: config.databaseUrl });
		cliente.on("notification", (msg) => {
			let aviso;
			try {
				aviso = JSON.parse(msg.payload);
			} catch {
				return;
			}
			procesar(aviso, log).catch((err) => log.error(err, "Error procesando evento"));
		});
		cliente.on("error", (err) => {
			log.error({ err: err.message }, "Conexión LISTEN perdida, reintentando");
			reintentar();
		});
		try {
			await cliente.connect();
			await cliente.query("LISTEN delicias");
			log.info("Escuchando eventos de Postgres (canal delicias)");
		} catch (err) {
			log.error({ err: err.message }, "No se pudo abrir LISTEN, reintentando");
			reintentar();
		}
	}

	let temporizador = null;
	function reintentar() {
		if (cerrado || temporizador) return;
		cliente?.end().catch(() => {});
		temporizador = setTimeout(() => {
			temporizador = null;
			conectar();
		}, 3_000);
	}

	conectar();
	return async () => {
		cerrado = true;
		clearTimeout(temporizador);
		await cliente?.end().catch(() => {});
		for (const raw of clientesPanel) raw.end();
		for (const set of clientesSeguimiento.values()) for (const raw of set) raw.end();
		for (const conexiones of clientesMesa.values()) for (const conexion of conexiones) conexion.raw.end();
	};
}
