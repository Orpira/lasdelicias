// Rutas para n8n (agente de WhatsApp, automatizaciones).
// Se autentican con la cabecera X-Api-Key = N8N_API_KEY.
import { timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { claveIdempotencia, esquemaEstado, esquemaGuardarCierre, esquemaPedidoN8n, esquemaStockExterno, validar } from "../esquemas.js";
import { consultarCierre, guardarCierre } from "../cierres.js";
import { aplicarStockExterno } from "../tpv/index.js";
import { cambiarEstado, crearPedidoIdempotente, obtenerPedidoPorCodigo } from "../pedidos-servicio.js";

function coincideClave(recibida, esperada) {
	if (!esperada || typeof recibida !== "string") return false;
	const a = Buffer.from(recibida);
	const b = Buffer.from(esperada);
	return a.length === b.length && timingSafeEqual(a, b);
}

export default async function rutasN8n(app) {
	app.addHook("onRequest", async (request, reply) => {
		const rutaFinanciera = request.url.split("?")[0].startsWith("/n8n/cierres");
		const claveEsperada = rutaFinanciera && config.n8nFinanceApiKey ? config.n8nFinanceApiKey : config.n8nApiKey;
		if (!coincideClave(request.headers["x-api-key"], claveEsperada)) {
			return reply.code(401).send({ error: "Clave de API no válida" });
		}
	});

	// Crear un pedido recibido por WhatsApp (el precio lo calcula la API)
	app.post("/n8n/pedidos", async (request, reply) => {
		const d = validar(esquemaPedidoN8n, request.body);
		// n8n reintenta si falla la red: con Idempotency-Key el reintento no duplica el pedido
		const clave = claveIdempotencia(request.headers);
		const { pedido, repetido } = await crearPedidoIdempotente({
			items: d.items,
			nombre: d.nombre,
			telefono: d.telefono,
			tipo: "whatsapp",
			horaRecogida: d.hora_recogida,
			notas: d.notas,
		}, clave);
		if (repetido) reply.header("Idempotent-Replayed", "true");
		return reply.code(repetido ? 200 : 201).send(pedido);
	});

	// Puente con cualquier caja: n8n lee el stock del TPV y lo envía aquí
	// { "origen": "glop", "articulos": [{ "codigo_tpv": "REF-COLA-33", "stock": 18 }] }
	app.post("/n8n/stock", async (request) => {
		const { origen, articulos } = validar(esquemaStockExterno, request.body);
		return aplicarStockExterno(origen, articulos.map((a) => ({ codigo: a.codigo_tpv, stock: a.stock })));
	});

	app.get("/n8n/pedidos/:codigo", async (request, reply) => {
		const pedido = await obtenerPedidoPorCodigo(String(request.params.codigo));
		if (!pedido) return reply.code(404).send({ error: "Pedido no encontrado" });
		return pedido;
	});

	app.patch("/n8n/pedidos/:id", async (request) => {
		const { estado } = validar(esquemaEstado, request.body);
		return cambiarEstado(request.params.id, estado);
	});

	app.get("/n8n/cierres/:fecha", async (request, reply) => {
		reply.header("Cache-Control", "no-store");
		return consultarCierre(request.params.fecha, request.query);
	});

	app.post("/n8n/cierres", async (request, reply) => {
		const { fecha, forzar } = validar(esquemaGuardarCierre, request.body);
		const datos = await guardarCierre(fecha, { origen: "n8n", forzar });
		return reply.code(datos.creado ? 201 : 200).send(datos);
	});
}
