// Bus de eventos: escucha el canal "delicias" de Postgres y reparte cada evento
//  - al panel del local (SSE, personal autenticado)
//  - al seguimiento del cliente (SSE, por código de pedido)
//  - a n8n (webhook HTTP firmado con un secreto compartido)
import pg from "pg";
import { config } from "./config.js";
import { obtenerPedidoPorId, vistaPublica } from "./pedidos-servicio.js";
import { query } from "./db.js";

const clientesPanel = new Set(); // respuestas SSE del personal
const clientesSeguimiento = new Map(); // codigo -> Set de respuestas SSE

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

async function enviarAN8n(evento, log) {
	if (!config.n8nWebhookUrl) return;
	try {
		const res = await fetch(config.n8nWebhookUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Delicias-Secret": config.n8nWebhookSecret,
			},
			body: JSON.stringify({ ...evento, enviado_en: new Date().toISOString() }),
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
	} else if (aviso.tipo === "opinion.nueva") {
		for (const raw of clientesPanel) enviarSSE(raw, "opinion", aviso);
		await enviarAN8n(aviso, log);
	} else if (aviso.tipo.startsWith("stock.")) {
		for (const raw of clientesPanel) enviarSSE(raw, "stock", aviso);
		await enviarAN8n(aviso, log);
	} else if (aviso.tipo === "mesa.llamada" || aviso.tipo === "mesa.atendida") {
		const { rows } = await query(
			"SELECT id, mesa_numero, motivo, atendida, created_at FROM llamadas_mesa WHERE id = $1",
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
	};
}
