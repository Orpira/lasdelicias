// Ficha del negocio: misma fuente que usa n8n (GET /negocio)
import { useEffect, useState } from "react";
import { api } from "./api";

export interface Negocio {
	nombre: string;
	titular?: string | null;
	nif?: string | null;
	email_contacto?: string | null;
	conservacion_meses?: number | null;
	dias_cerrado?: string[];
	cierre_incluye_listos?: boolean;
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

/** Enlace para abrir la dirección en Google Maps */
export const enlaceMapa = (direccion: string) =>
	`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Las Delicias, ${direccion}`)}`;

/** "+34633272668" → "633 27 26 68" */
export function telefonoLegible(tel: string) {
	const d = tel.replace(/^\+34/, "").replace(/\D/g, "");
	return d.length === 9 ? `${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7)}` : tel;
}
