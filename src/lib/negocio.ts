// Ficha del negocio: misma fuente que usa n8n (GET /negocio)
import { useEffect, useState } from "react";
import { api } from "./api";

export interface Negocio {
	nombre: string;
	titular?: string | null;
	nif?: string | null;
	email_contacto?: string | null;
	conservacion_meses?: number | null;
	cierre_criterio?: "cobrados" | "entregados" | "entregados_y_listos";
	lema: string;
	descripcion: string;
	direccion: string;
	referencia: string;
	telefono: string;
	whatsapp: string;
	instagram: string;
	servicios: string[];
	resenas_externas?: { sitio: string; url: string }[];
	horario: Record<"lunes" | "martes" | "miercoles" | "jueves" | "viernes" | "sabado" | "domingo", string | null>;
}

export const DIAS: { clave: keyof Negocio["horario"]; nombre: string }[] = [
	{ clave: "lunes", nombre: "Lunes" },
	{ clave: "martes", nombre: "Martes" },
	{ clave: "miercoles", nombre: "Miércoles" },
	{ clave: "jueves", nombre: "Jueves" },
	{ clave: "viernes", nombre: "Viernes" },
	{ clave: "sabado", nombre: "Sábado" },
	{ clave: "domingo", nombre: "Domingo" },
];

let cache: Promise<Negocio> | null = null;

export function useNegocio(alError?: (mensaje: string) => void) {
	const [negocio, setNegocio] = useState<Negocio | null>(null);
	useEffect(() => {
		cache ??= api<Negocio>("/negocio").catch((e) => {
			cache = null;
			throw e;
		});
		cache.then(setNegocio).catch((error: unknown) => {
			alError?.(error instanceof Error ? error.message : "No se pudo cargar la ficha del negocio");
		});
	}, [alError]);
	return negocio;
}

/** Estado de hoy según el horario (hora de Madrid). null si no se conoce el horario de hoy. */
export function estadoHoy(horario: Negocio["horario"]): { abierto: boolean; texto: string } | null {
	const ahora = new Date();
	const partes = Object.fromEntries(
		new Intl.DateTimeFormat("es-ES", {
			timeZone: "Europe/Madrid",
			weekday: "long",
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
		})
			.formatToParts(ahora)
			.map((p) => [p.type, p.value]),
	);
	const clave = partes.weekday
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "") as keyof Negocio["horario"];
	const tramo = horario[clave];
	if (!tramo) return null;
	const m = tramo.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
	if (!m) return { abierto: false, texto: `Hoy: ${tramo}` };
	const minutos = Number(partes.hour) * 60 + Number(partes.minute);
	const abre = Number(m[1]) * 60 + Number(m[2]);
	const cierra = Number(m[3]) * 60 + Number(m[4]);
	if (minutos >= abre && minutos < cierra) return { abierto: true, texto: `Abierto hasta las ${m[3]}:${m[4]}` };
	if (minutos < abre) return { abierto: false, texto: `Hoy abrimos a las ${m[1]}:${m[2]}` };
	return { abierto: false, texto: "Hoy ya hemos cerrado" };
}

/** Enlace para abrir la dirección en Google Maps */
export const enlaceMapa = (direccion: string) =>
	`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Las Delicias, ${direccion}`)}`;

/** "+34633272668" → "633 27 26 68" */
export function telefonoLegible(tel: string) {
	const d = tel.replace(/^\+34/, "").replace(/\D/g, "");
	return d.length === 9 ? `${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7)}` : tel;
}
