import { ErrorOperacion } from "./errores.js";

const ZONA = "Europe/Madrid";
const MINUTO = 60_000;
const DIA = 24 * 60 * MINUTO;
const DIAS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const reloj = new Intl.DateTimeFormat("es-ES", {
	timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit",
	hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
const diaLegible = new Intl.DateTimeFormat("es-ES", { timeZone: ZONA, weekday: "long" });

function partes(instante) {
	if (!(instante instanceof Date) || !Number.isFinite(instante.getTime())) {
		throw new ErrorOperacion("El instante del horario no es válido", 500);
	}
	return Object.fromEntries(reloj.formatToParts(instante).map((parte) => [parte.type, parte.value]));
}

export function fechaMadrid(instante) {
	const p = partes(instante);
	return `${p.year}-${p.month}-${p.day}`;
}

function sumarDias(fecha, cantidad) {
	return new Date(Date.parse(`${fecha}T00:00:00Z`) + cantidad * DIA).toISOString().slice(0, 10);
}

function leerTramo(texto) {
	if (typeof texto !== "string") return null;
	const coincidencia = /^(\d{2}):(\d{2})\s*[-–—]\s*(\d{2}):(\d{2})$/.exec(texto.trim());
	if (!coincidencia) return null;
	const [h1, m1, h2, m2] = coincidencia.slice(1).map(Number);
	if (h1 > 23 || m1 > 59 || h2 > 24 || m2 > 59 || h2 === 24 && m2 !== 0) return null;
	const inicio = h1 * 60 + m1, fin = h2 * 60 + m2;
	return inicio < fin ? { inicio, fin, apertura: texto.trim().slice(0, 5), cierre: `${String(h2).padStart(2, "0")}:${String(m2).padStart(2, "0")}` } : null;
}

export function esTramoHorarioValido(texto) {
	return leerTramo(texto) !== null;
}

function tramoDelDia(horario, diasCerrado, fecha) {
	if (!horario || typeof horario !== "object" || !Array.isArray(diasCerrado)) {
		throw new ErrorOperacion("La ficha del negocio no contiene un horario y unos días de cierre válidos", 500);
	}
	const dia = DIAS[new Date(`${fecha}T00:00:00Z`).getUTCDay()];
	if (diasCerrado.includes(fecha) || horario[dia] === null) return null;
	const tramo = leerTramo(horario[dia]);
	if (!tramo) throw new ErrorOperacion(`El horario del ${dia} no es válido. Usa HH:MM–HH:MM sin cruzar medianoche.`, 500);
	return tramo;
}

export function dentroDeHorario(horario, diasCerrado, instante) {
	const p = partes(instante);
	const tramo = tramoDelDia(horario, diasCerrado, `${p.year}-${p.month}-${p.day}`);
	const minutos = Number(p.hour) * 60 + Number(p.minute);
	return tramo !== null && minutos >= tramo.inicio && minutos < tramo.fin;
}

export function estaAbierto(horario, diasCerrado, instante) {
	return dentroDeHorario(horario, diasCerrado, instante);
}

function desfasesDelDia(fecha) {
	const base = Date.parse(`${fecha}T12:00:00Z`);
	return [...new Set([-DIA, 0, DIA].map((desplazamiento) => {
		const instante = base + desplazamiento;
		const p = partes(new Date(instante));
		return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - instante;
	}))];
}

function instantesLocales(fecha, minutos, desfases) {
	const base = Date.parse(`${fecha}T00:00:00Z`) + minutos * MINUTO;
	const esperada = minutos === 1440 ? sumarDias(fecha, 1) : fecha;
	return desfases.map((desfase) => base - desfase).filter((valor) => {
		const p = partes(new Date(valor));
		return `${p.year}-${p.month}-${p.day}` === esperada
			&& Number(p.hour) * 60 + Number(p.minute) === minutos % 1440;
	}).sort((a, b) => a - b);
}

function iniciosDelTramo(fecha, tramo) {
	const desfases = desfasesDelDia(fecha);
	// En marzo puede no existir la hora de apertura: se toma el primer minuto real del tramo.
	for (let minuto = tramo.inicio; minuto < tramo.fin; minuto++) {
		const candidatos = instantesLocales(fecha, minuto, desfases);
		if (candidatos.length) return candidatos;
	}
	return [];
}

export function siguienteApertura(horario, diasCerrado, instante) {
	const hoy = fechaMadrid(instante);
	for (let dia = 0; dia < 14; dia++) {
		const fecha = sumarDias(hoy, dia);
		const tramo = tramoDelDia(horario, diasCerrado, fecha);
		if (!tramo) continue;
		const inicio = iniciosDelTramo(fecha, tramo).find((valor) => valor >= instante.getTime());
		if (inicio !== undefined) return { inicio: new Date(inicio), fecha };
	}
	return null;
}

export function descripcionHorario(horario, diasCerrado, instante) {
	const fecha = fechaMadrid(instante);
	const tramo = tramoDelDia(horario, diasCerrado, fecha);
	return `El horario del ${fecha} es ${tramo ? `${tramo.apertura}–${tramo.cierre}` : "cerrado"} (hora de Madrid).`;
}

function opcionesRecogida(horario, diasCerrado, fecha, desde) {
	const tramo = tramoDelDia(horario, diasCerrado, fecha);
	if (!tramo) return [];
	const inicios = iniciosDelTramo(fecha, tramo);
	if (!inicios.length) return [];
	const desfases = desfasesDelDia(fecha);
	const finales = instantesLocales(fecha, tramo.fin, desfases);
	// Un cierre inexistente en el salto de marzo equivale al comienzo del salto.
	let fin = finales.at(-1);
	if (fin === undefined) {
		for (let minuto = tramo.fin; minuto <= 1440 && fin === undefined; minuto++) {
			fin = instantesLocales(fecha, minuto, desfases)[0];
		}
	}
	if (fin === undefined) throw new ErrorOperacion("No se pudo calcular la hora de cierre en Madrid", 500);
	const opciones = [];
	for (let valor = Math.ceil(Math.max(inicios[0], desde.getTime()) / MINUTO) * MINUTO; valor < fin; valor += MINUTO) {
		const instante = new Date(valor);
		if (!dentroDeHorario(horario, diasCerrado, instante)) continue;
		const p = partes(instante);
		opciones.push({ hora: `${p.hour}:${p.minute}`, instante: instante.toISOString() });
	}
	const repeticiones = new Map();
	for (const opcion of opciones) repeticiones.set(opcion.hora, (repeticiones.get(opcion.hora) ?? 0) + 1);
	return opciones.map((opcion) => {
		if (repeticiones.get(opcion.hora) === 1) return opcion;
		const zona = new Intl.DateTimeFormat("es-ES", { timeZone: ZONA, timeZoneName: "short" })
			.formatToParts(new Date(opcion.instante)).find((p) => p.type === "timeZoneName").value;
		return { ...opcion, hora: `${opcion.hora} (${zona})` };
	});
}

export function estadoHorario(horario, diasCerrado, instante, { conRecogida = false } = {}) {
	const abierto = estaAbierto(horario, diasCerrado, instante);
	const siguiente = abierto ? null : siguienteApertura(horario, diasCerrado, instante);
	const hoy = fechaMadrid(instante);
	const fecha = abierto ? hoy : siguiente?.fecha;
	let texto;
	if (abierto) texto = `Abierto hasta las ${tramoDelDia(horario, diasCerrado, hoy).cierre}`;
	else if (!siguiente) texto = "Cerrado. Ahora mismo no tenemos horario de apertura previsto.";
	else {
		const cuando = siguiente.fecha === hoy ? "hoy" : siguiente.fecha === sumarDias(hoy, 1) ? "mañana" : `el ${diaLegible.format(siguiente.inicio)}`;
		const p = partes(siguiente.inicio);
		texto = `Cerrado. Abrimos ${cuando} a las ${p.hour}:${p.minute}`;
	}
	return {
		abierto, siguiente_apertura: siguiente?.inicio.toISOString() ?? null, texto,
		...(conRecogida ? {
			recogida: fecha ? { fecha, opciones: opcionesRecogida(horario, diasCerrado, fecha, siguiente?.inicio ?? instante) } : null,
		} : {}),
	};
}
