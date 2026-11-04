import { after, before, beforeEach, it, mock } from "node:test";
import assert from "node:assert/strict";
import { esEventoCuenta, leerCodigosPropios, METODOS_PAGO, nombreMetodo, recordarPedido } from "./cuentas.ts";

const almacen = new Map();
const anterior = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
before(() => Object.defineProperty(globalThis, "localStorage", {
	configurable: true,
	value: { getItem: (clave) => almacen.get(clave) ?? null, setItem: (clave, valor) => almacen.set(clave, valor) },
}));
beforeEach(() => { almacen.clear(); mock.restoreAll(); });
after(() => {
	mock.restoreAll();
	if (anterior) Object.defineProperty(globalThis, "localStorage", anterior);
	else Reflect.deleteProperty(globalThis, "localStorage");
});

it("Los cuatro métodos de cobro tienen una etiqueta en español", () => {
	assert.deepEqual(METODOS_PAGO.map(({ id }) => nombreMetodo(id)), ["Efectivo", "Tarjeta", "Bizum", "Otro"]);
});

const evento = { id: "7", tipo: "cuenta.cobrada", estado: "cobrada", mesa_numero: 7, total: 3.25, metodo_pago: "efectivo", cerrada_at: "2026-11-04T00:00:00.000Z" };
it("Los eventos de cuenta válidos se reconocen", () => {
	assert.equal(esEventoCuenta(evento), true);
	assert.equal(esEventoCuenta({ ...evento, tipo: "cuenta.actualizada", estado: "abierta", cerrada_at: null, metodo_pago: null }), true);
	assert.equal(esEventoCuenta({ ...evento, tipo: "cuenta.anulada", estado: "anulada", metodo_pago: null }), true);
});

it("Se rechazan los eventos incompletos, las fechas inválidas y las conversiones de tipos", () => {
	for (const datos of [null, {}, { ...evento, tipo: ["cuenta.cobrada"] }, { ...evento, estado: ["cobrada"] },
		{ ...evento, id: 7 }, { ...evento, mesa_numero: -1 }, { ...evento, total: Infinity },
		{ ...evento, total: -1 }, { ...evento, cerrada_at: "no es una fecha" }, { ...evento, metodo_pago: "desconocido" }]) {
		assert.equal(esEventoCuenta(datos), false);
	}
});

it("Sin historial no se atribuyen pedidos al dispositivo", () => {
	assert.deepEqual(leerCodigosPropios(), []);
});

it("Solo se recuerdan los diez últimos códigos propios, sin duplicados", () => {
	const codigos = Array.from({ length: 11 }, (_, indice) => String(indice).padStart(10, "2"));
	for (const codigo of codigos) recordarPedido(codigo);
	assert.deepEqual(leerCodigosPropios(), codigos.slice(1).reverse());
	recordarPedido(codigos[3]);
	assert.equal(leerCodigosPropios()[0], codigos[3]);
	assert.equal(leerCodigosPropios().length, 10);
});

it("Un historial corrupto no se interpreta como una lista de pedidos válida", () => {
	for (const dato of ["no es JSON", "{}", '["corto"]', "[7]"]) {
		almacen.set("delicias.misPedidos", dato);
		assert.throws(leerCodigosPropios);
	}
});

it("Un fallo de almacenamiento se avisa sin simular que se guardó el código", () => {
	const aviso = mock.method(console, "warn", () => {});
	almacen.set("delicias.misPedidos", "{}");
	recordarPedido("abcdefghjk");
	assert.equal(aviso.mock.callCount(), 1);
	assert.equal(almacen.get("delicias.misPedidos"), "{}");
});
