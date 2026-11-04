import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { calcularFirma, firmarEvento, verificarFirma } from "../src/firma.js";

const SECRETO = "secreto-de-prueba-0123456789abcdef";
const evento = { tipo: "stock.bajo", id: "00000000-0000-4000-8000-000000000001", nombre: "Café <b>", stock: 2, stock_minimo: 5, precio: 1.5 };

function recibido(firmado) {
	const h = firmado.cabeceras;
	return { timestamp: h["X-Delicias-Timestamp"], eventoId: h["X-Delicias-Evento"], firma: h["X-Delicias-Firma"], cuerpo: firmado.cuerpo };
}

describe("Firma HMAC de los webhooks a n8n", () => {
	it("No envía el secreto e incluye id, marca de tiempo y firma v1", () => {
		const { cuerpo, cabeceras } = firmarEvento(SECRETO, evento);
		assert.ok(!JSON.stringify(cabeceras).includes(SECRETO) && !cuerpo.includes(SECRETO));
		assert.equal(cabeceras["X-Delicias-Secret"], undefined);
		assert.match(cabeceras["X-Delicias-Firma"], /^v1=[0-9a-f]{64}$/);
		assert.equal(JSON.parse(cuerpo).evento_id, cabeceras["X-Delicias-Evento"]);
	});

	it("Acepta una firma válida y rechaza secreto, cuerpo o marca de tiempo alterados", () => {
		const ahora = Date.now();
		const r = recibido(firmarEvento(SECRETO, evento, ahora));
		assert.equal(verificarFirma(SECRETO, r, ahora), null);
		assert.equal(verificarFirma("otro", r, ahora), "firma no válida");
		assert.equal(verificarFirma(SECRETO, { ...r, cuerpo: r.cuerpo.replace('"stock":2', '"stock":0') }, ahora), "firma no válida");
		assert.equal(verificarFirma(SECRETO, { ...r, timestamp: String(Number(r.timestamp) + 1) }, ahora), "firma no válida");
		assert.equal(verificarFirma(SECRETO, r, ahora + 301_000), "marca de tiempo fuera de margen");
		assert.equal(verificarFirma("", r, ahora), "sin secreto configurado");
	});
});

describe("Verificación de la firma en el flujo de n8n", () => {
	const flujo = JSON.parse(readFileSync(new URL("../n8n/las-delicias-eventos.json", import.meta.url), "utf8"));
	const nodo = (nombre) => flujo.nodes.find((n) => n.name === nombre);
	const estatico = {};
	const comprobar = (items) => vm.runInNewContext(`(function () { ${nodo("Comprobar marca de tiempo").parameters.jsCode} })()`, {
		$input: { all: () => items }, $getWorkflowStaticData: () => estatico, Date, Number, String, Object,
	});
	// Lo que hace el nodo Crypto (HMAC SHA256, hex) con el secreto ya configurado
	const calcular = (json) => ({ ...json, firma_calculada: createHmac("sha256", SECRETO).update(json.firma_base).digest("hex") });
	const evaluar = (expr, json) => vm.runInNewContext(expr.slice(3, -2).trim(), { $json: json });
	const valida = (json) => nodo("¿Firma válida?").parameters.conditions.conditions.every((c) =>
		c.operator.operation === "equals" ? evaluar(c.leftValue, json) === evaluar(c.rightValue, json) : evaluar(c.leftValue, json) === true);
	const comoN8n = ({ cuerpo, cabeceras }) => ({
		json: { headers: Object.fromEntries(Object.entries(cabeceras).map(([k, v]) => [k.toLowerCase(), v])), body: JSON.parse(cuerpo) },
	});

	it("El flujo pasa por los tres nodos de verificación antes de distribuir", () => {
		const siguiente = (n) => flujo.connections[n].main[0][0].node;
		assert.equal(siguiente("Recibir eventos de la API"), "Comprobar marca de tiempo");
		assert.equal(siguiente("Comprobar marca de tiempo"), "Calcular firma");
		assert.equal(siguiente("Calcular firma"), "¿Firma válida?");
		assert.equal(siguiente("¿Firma válida?"), "Distribuir eventos");
		assert.deepEqual(flujo.connections["¿Firma válida?"].main[1], []);
		const crypto = nodo("Calcular firma").parameters;
		assert.equal(crypto.secret, "CAMBIAR_SECRETO_COMPARTIDO");
		assert.deepEqual([crypto.action, crypto.type, crypto.encoding], ["hmac", "SHA256", "hex"]);
		assert.doesNotMatch(nodo("Comprobar marca de tiempo").parameters.jsCode, /require\(|\$env/);
	});

	it("Acepta un evento firmado por la API y rechaza el replay, la firma falsa y el evento antiguo", () => {
		const firmado = firmarEvento(SECRETO, evento);
		const [paso] = comprobar([comoN8n(firmado)]);
		assert.ok(paso);
		assert.equal(`v1=${calcular(paso.json).firma_calculada}`, calcularFirma(SECRETO, paso.json.headers["x-delicias-timestamp"], paso.json.headers["x-delicias-evento"], firmado.cuerpo));
		assert.equal(valida(calcular(paso.json)), true);
		assert.equal(paso.json.body.tipo, "stock.bajo");

		assert.equal(comprobar([comoN8n(firmado)]).length, 0, "el mismo evento repetido se descarta");

		const falso = firmarEvento("secreto-del-atacante", evento);
		const [pasoFalso] = comprobar([comoN8n(falso)]);
		assert.equal(valida(calcular(pasoFalso.json)), false);

		const alterado = comoN8n(firmarEvento(SECRETO, evento));
		alterado.json.body.stock = 0;
		assert.equal(valida(calcular(comprobar([alterado])[0].json)), false);

		assert.equal(comprobar([comoN8n(firmarEvento(SECRETO, evento, Date.now() - 10 * 60_000))]).length, 0);
		const sinFirma = comoN8n(firmarEvento(SECRETO, evento));
		delete sinFirma.json.headers["x-delicias-firma"];
		assert.equal(comprobar([sinFirma]).length, 0);
	});
});
