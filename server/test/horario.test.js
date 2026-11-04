import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dentroDeHorario, esTramoHorarioValido, estaAbierto, estadoHorario, fechaMadrid, siguienteApertura } from "../src/horario.js";

const horario = {
	lunes: "07:00–19:00", martes: "07:00-19:00", miercoles: "07:00–19:00",
	jueves: "07:00–19:00", viernes: "07:00–19:00", sabado: "07:00–14:00", domingo: null,
};
const instante = (texto) => new Date(texto);

describe("Horario de Madrid", () => {
	it("Abre dentro del tramo y exactamente al abrir; cierra exactamente al terminar", () => {
		for (const [hora, abierto] of [["05:59:59", false], ["06:00:00", true], ["11:30:00", true], ["17:59:59", true], ["18:00:00", false]]) {
			const momento = instante(`2026-11-02T${hora}Z`);
			assert.equal(estaAbierto(horario, [], momento), abierto, hora);
			assert.equal(dentroDeHorario(horario, [], momento), abierto, hora);
		}
	});

	it("Antes de abrir devuelve la apertura de hoy; después del cierre, la siguiente", () => {
		assert.deepEqual(siguienteApertura(horario, [], instante("2026-11-02T04:00:00Z")), {
			inicio: instante("2026-11-02T06:00:00Z"), fecha: "2026-11-02",
		});
		assert.deepEqual(siguienteApertura(horario, [], instante("2026-11-02T18:00:00Z")), {
			inicio: instante("2026-11-03T06:00:00Z"), fecha: "2026-11-03",
		});
	});

	it("El sábado por la tarde salta el domingo cerrado y abre el lunes", () => {
		assert.deepEqual(siguienteApertura(horario, [], instante("2026-11-07T16:00:00Z")), {
			inicio: instante("2026-11-09T06:00:00Z"), fecha: "2026-11-09",
		});
		assert.equal(estaAbierto(horario, [], instante("2026-11-08T10:00:00Z")), false);
	});

	it("Los festivos y vacaciones prevalecen sobre el horario semanal", () => {
		const cerrados = ["2026-11-02", "2026-11-03"];
		assert.equal(estaAbierto(horario, cerrados, instante("2026-11-02T11:00:00Z")), false);
		assert.equal(dentroDeHorario(horario, cerrados, instante("2026-11-03T11:00:00Z")), false);
		assert.equal(siguienteApertura(horario, cerrados, instante("2026-11-02T04:00:00Z")).fecha, "2026-11-04");
	});

	it("Sin horarios o sin apertura en los próximos catorce días devuelve null", () => {
		const sinHorario = Object.fromEntries(Object.keys(horario).map((dia) => [dia, null]));
		assert.equal(siguienteApertura(sinHorario, [], instante("2026-11-02T04:00:00Z")), null);
		const cerrados = Array.from({ length: 14 }, (_, dia) => new Date(Date.UTC(2026, 10, 2 + dia)).toISOString().slice(0, 10));
		assert.equal(siguienteApertura(horario, cerrados, instante("2026-11-02T04:00:00Z")), null);
		assert.equal(estadoHorario(sinHorario, [], instante("2026-11-02T04:00:00Z")).siguiente_apertura, null);
	});

	it("Marzo y octubre calculan la apertura con el desfase real, no el del día anterior", () => {
		const domingoAbierto = { ...horario, domingo: "07:00–19:00" };
		assert.deepEqual(siguienteApertura(domingoAbierto, [], instante("2026-03-28T20:00:00Z")), {
			inicio: instante("2026-03-29T05:00:00Z"), fecha: "2026-03-29",
		});
		assert.deepEqual(siguienteApertura(domingoAbierto, [], instante("2026-10-24T20:00:00Z")), {
			inicio: instante("2026-10-25T06:00:00Z"), fecha: "2026-10-25",
		});
	});

	it("Una apertura inexistente en marzo empieza en el primer minuto real del tramo", () => {
		const domingo = { ...horario, domingo: "02:30–04:00" };
		assert.deepEqual(siguienteApertura(domingo, [], instante("2026-03-29T00:00:00Z")), {
			inicio: instante("2026-03-29T01:00:00Z"), fecha: "2026-03-29",
		});
		const estado = estadoHorario(domingo, [], instante("2026-03-29T00:00:00Z"), { conRecogida: true });
		assert.equal(estado.recogida.opciones[0].hora, "03:00");
		assert.equal(estado.recogida.opciones.length, 60);
	});

	it("La hora repetida de octubre tiene dos instantes y no pierde la segunda apertura", () => {
		const domingo = { ...horario, domingo: "02:30–04:00" };
		assert.equal(siguienteApertura(domingo, [], instante("2026-10-25T00:10:00Z")).inicio.toISOString(), "2026-10-25T00:30:00.000Z");
		assert.equal(siguienteApertura(domingo, [], instante("2026-10-25T01:10:00Z")).inicio.toISOString(), "2026-10-25T01:30:00.000Z");
		const estado = estadoHorario(domingo, [], instante("2026-10-25T00:10:00Z"), { conRecogida: true });
		const repetidas = estado.recogida.opciones.filter((opcion) => opcion.hora.startsWith("02:30"));
		assert.equal(repetidas.length, 2);
		assert.notEqual(repetidas[0].hora, repetidas[1].hora);
		assert.notEqual(repetidas[0].instante, repetidas[1].instante);
	});

	it("El estado público distingue hoy, mañana y el lunes y limita las horas de recogida", () => {
		assert.equal(estadoHorario(horario, [], instante("2026-11-02T04:00:00Z")).texto, "Cerrado. Abrimos hoy a las 07:00");
		assert.equal(estadoHorario(horario, [], instante("2026-11-02T20:00:00Z")).texto, "Cerrado. Abrimos mañana a las 07:00");
		assert.equal(estadoHorario(horario, [], instante("2026-11-07T16:00:00Z")).texto, "Cerrado. Abrimos el lunes a las 07:00");
		const estado = estadoHorario(horario, [], instante("2026-11-02T11:30:01Z"), { conRecogida: true });
		assert.equal(estado.texto, "Abierto hasta las 19:00");
		assert.equal(estado.siguiente_apertura, null);
		assert.equal(estado.recogida.opciones[0].hora, "12:31");
		assert.equal(estado.recogida.opciones.at(-1).hora, "18:59");
		for (const opcion of estado.recogida.opciones) assert.ok(dentroDeHorario(horario, [], instante(opcion.instante)));
	});

	it("No depende de la zona del servidor, incluso al cambiar de día en Madrid", () => {
		const anterior = process.env.TZ;
		try {
			process.env.TZ = "America/Los_Angeles";
			assert.equal(fechaMadrid(instante("2026-11-02T23:30:00Z")), "2026-11-03");
			assert.equal(siguienteApertura(horario, [], instante("2026-11-02T23:30:00Z")).inicio.toISOString(), "2026-11-03T06:00:00.000Z");
		} finally {
			if (anterior === undefined) delete process.env.TZ;
			else process.env.TZ = anterior;
		}
	});

	it("Valida los tramos sin cruces de medianoche y permite cerrar a las 24:00", () => {
		for (const texto of ["07:00–19:00", "07:00-19:00", "07:00 — 19:00", "00:00–24:00"]) assert.ok(esTramoHorarioValido(texto));
		for (const texto of ["19:00–07:00", "25:00–26:00", "07:60–19:00", "07:00–24:01", "07:00–07:00", "mañana"]) assert.equal(esTramoHorarioValido(texto), false, texto);
		assert.throws(() => estaAbierto({ ...horario, lunes: "no válido" }, [], instante("2026-11-02T11:00:00Z")), /horario del lunes no es válido/);
	});
});
