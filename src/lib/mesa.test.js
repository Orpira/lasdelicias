import comprobar from "node:assert/strict";
import { test as prueba } from "node:test";
import { etiquetaMesa } from "./mesa.ts";

for (const conNumero of [false, true]) {
	const destino = conNumero ? "personal" : "cliente";
	for (const nombre of [null, undefined, "", "Mesa 7"]) {
		prueba(`El ${destino} ve Mesa 7 sin repetir el número cuando el nombre es ${JSON.stringify(nombre)}`, () => {
			comprobar.equal(etiquetaMesa(7, nombre, { conNumero }), "Mesa 7");
		});
	}
}

prueba("El cliente ve solo el nombre personalizado", () => {
	comprobar.equal(etiquetaMesa(7, "Terraza 2", { conNumero: false }), "Terraza 2");
});

prueba("El personal ve el nombre personalizado con el número secundario", () => {
	comprobar.equal(etiquetaMesa(7, "Terraza 2", { conNumero: true }), "Terraza 2 (mesa 7)");
});

prueba("Sin opciones se utiliza la etiqueta del cliente", () => {
	comprobar.equal(etiquetaMesa(7, "Terraza 2"), "Terraza 2");
});

prueba("Un nombre que corresponde a otro número se conserva como personalizado", () => {
	comprobar.equal(etiquetaMesa(7, "Mesa 8", { conNumero: true }), "Mesa 8 (mesa 7)");
});
