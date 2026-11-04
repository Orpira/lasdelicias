import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { avisosDeApertura, diaApertura, estaProgramado } from "./programados.ts";

const apertura = Date.parse("2026-11-09T06:00:00Z");
const pedido = { codigo: "programado1", estado: "nuevo", atender_desde: new Date(apertura).toISOString() };

describe("Pedidos programados en las pantallas", () => {
	it("Solo es futuro antes de la apertura, nunca justo al llegar la hora", () => {
		assert.equal(estaProgramado(pedido, apertura - 1), true);
		assert.equal(estaProgramado(pedido, apertura), false);
		assert.equal(estaProgramado({ atender_desde: null }, apertura), false);
	});

	it("No pita al recibir un futuro y avisa una sola vez cuando pasa a Nuevos", () => {
		const pendientes = new Set();
		assert.equal(avisosDeApertura([pedido], apertura - 1000, pendientes), 0);
		assert.equal(avisosDeApertura([pedido], apertura - 1, pendientes), 0);
		assert.equal(avisosDeApertura([pedido], apertura, pendientes), 1);
		assert.equal(avisosDeApertura([pedido], apertura + 30_000, pendientes), 0);
	});

	it("No pita por los pedidos ya activos al abrir la pantalla", () => {
		assert.equal(avisosDeApertura([pedido], apertura + 1000, new Set()), 0);
		assert.equal(avisosDeApertura([{ ...pedido, atender_desde: null }], apertura, new Set()), 0);
	});

	it("Cancelar, empezar o desaparecer antes de abrir elimina el aviso pendiente", () => {
		for (const estado of ["cancelado", "preparando", "listo", "entregado"]) {
			const pendientes = new Set([pedido.codigo]);
			assert.equal(avisosDeApertura([{ ...pedido, estado }], apertura, pendientes), 0);
			assert.equal(pendientes.size, 0);
		}
		const pendientes = new Set([pedido.codigo]);
		assert.equal(avisosDeApertura([], apertura, pendientes), 0);
		assert.equal(pendientes.size, 0);
	});

	it("Agrupa los avisos simultáneos y localiza las fechas siempre en Madrid", () => {
		const segundo = { ...pedido, codigo: "programado2" };
		const pendientes = new Set();
		avisosDeApertura([pedido, segundo], apertura - 1, pendientes);
		assert.equal(avisosDeApertura([pedido, segundo], apertura, pendientes), 2);
		assert.equal(diaApertura("2026-11-08T23:30:00Z"), "lunes");
		assert.match(diaApertura("2026-11-08T23:30:00Z", true), /lunes.*9 de noviembre/);
	});
});
