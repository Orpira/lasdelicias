import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const flujo = JSON.parse(readFileSync(new URL("../n8n/las-delicias-eventos.json", import.meta.url), "utf8"));
const nodo = (nombre) => flujo.nodes.find((elemento) => elemento.name === nombre);
const reglas = nodo("Distribuir eventos").parameters.rules.values;
const evaluar = (expresion, datos) => vm.runInNewContext(expresion.slice(3, -2).trim(), { $json: datos });
const salida = (datos) => reglas.findIndex((regla) => {
	const cumple = (condicion) => {
		const valor = evaluar(condicion.leftValue, datos);
		switch (condicion.operator.operation) {
			case "equals": return valor === condicion.rightValue;
			case "notEquals": return valor !== condicion.rightValue;
			case "notEmpty": return valor !== "";
			case "true": return valor === true;
			default: throw new Error(`Operador de prueba no previsto: ${condicion.operator.operation}`);
		}
	};
	return regla.conditions.combinator === "or" ? regla.conditions.conditions.some(cumple) : regla.conditions.conditions.every(cumple);
});
const preparar = (body) => vm.runInNewContext(`(function () { ${nodo("Normalizar teléfono").parameters.jsCode} })()`, { $json: { body } }).json;
const pedido = { nombre_cliente: "Cliente de prueba", numero_dia: 7, telefono: "600 123 456", tipo: "recoger", fuera_horario: true, atender_desde: "2026-11-09T06:00:00Z" };

describe("Workflow de confirmación fuera de horario", () => {
	it("La rama nueva solo confirma pedidos creados fuera de horario con teléfono", () => {
		const indice = reglas.findIndex((regla) => regla.outputKey === "Recibido fuera de horario");
		assert.ok(indice >= 0);
		assert.equal(salida({ body: { tipo: "pedido.creado", pedido } }), indice);
		for (const cambio of [{ fuera_horario: false }, { telefono: "" }, { telefono: "  " }]) {
			assert.notEqual(salida({ body: { tipo: "pedido.creado", pedido: { ...pedido, ...cambio } } }), indice);
		}
		assert.notEqual(salida({ body: { tipo: "pedido.estado", pedido } }), indice);
		assert.equal(flujo.connections["Distribuir eventos"].main[indice][0].node, "Normalizar teléfono");
	});

	it("El mensaje confirma número, fecha española y hora de Madrid", () => {
		const preparado = preparar({ tipo: "pedido.creado", pedido });
		assert.equal(preparado.telefono, "34600123456");
		assert.match(preparado.mensaje, /Hemos recibido tu pedido #7/);
		assert.match(preparado.mensaje, /lunes.*9 de noviembre.*07:00/);
		assert.match(preparado.mensaje, /te avisaremos cuando esté listo/);
		const verano = preparar({ tipo: "pedido.creado", pedido: { ...pedido, atender_desde: "2026-03-29T05:00:00Z" } });
		assert.match(verano.mensaje, /domingo.*29 de marzo.*07:00/);
	});

	it("El aviso de listo y la normalización anterior siguen funcionando", () => {
		const listo = { ...pedido, estado: "listo", fuera_horario: false, telefono: "+34 (600) 123-456" };
		assert.equal(salida({ body: { tipo: "pedido.estado", pedido: listo } }), 0);
		assert.equal(preparar({ tipo: "pedido.estado", pedido: listo }).telefono, "34600123456");
		assert.match(preparar({ tipo: "pedido.estado", pedido: listo }).mensaje, /ya está listo/);
		assert.throws(() => preparar({ tipo: "pedido.creado", pedido: { ...pedido, atender_desde: null } }), /apertura válida/);
		assert.throws(() => preparar({ tipo: "pedido.creado", pedido: { ...pedido, telefono: "no válido" } }), /internacional válido/);
	});

	it("Las conexiones son válidas y el flujo sigue inactivo y sin credenciales reales", () => {
		assert.equal(flujo.active, false);
		const nombres = new Set(flujo.nodes.map((elemento) => elemento.name));
		for (const [origen, conexiones] of Object.entries(flujo.connections)) {
			assert.ok(nombres.has(origen));
			for (const destino of conexiones.main.flat()) assert.ok(nombres.has(destino.node));
		}
		assert.equal(flujo.connections["Distribuir eventos"].main.length, reglas.length + 1);
		for (const elemento of flujo.nodes) {
			for (const credencial of Object.values(elemento.credentials ?? {})) {
				assert.ok(credencial.id.startsWith("CAMBIAR_"));
				assert.ok(credencial.name.startsWith("CAMBIAR_"));
			}
		}
		assert.equal(nodo("Avisar por WhatsApp").parameters.url, "http://evolution-api:8080/message/sendText/CAMBIAR_INSTANCIA_EVOLUTION");
	});
});
