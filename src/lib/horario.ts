import { useEffect, useState } from "react";
import { api } from "./api";

export interface EstadoHorario {
	abierto: boolean;
	siguiente_apertura: string | null;
	texto: string;
	recogida?: { fecha: string; opciones: { hora: string; instante: string }[] } | null;
}

export function useEstadoHorario(conRecogida = false) {
	const [estado, setEstado] = useState<EstadoHorario | null>(null);
	const [error, setError] = useState("");
	const [cargando, setCargando] = useState(true);
	const [revision, setRevision] = useState(0);

	useEffect(() => {
		let vigente = true;
		let consulta = 0;
		async function consultar() {
			const actual = ++consulta;
			setCargando(true);
			try {
				const datos = await api<EstadoHorario>(`/horario/estado${conRecogida ? "?recogida=true" : ""}`);
				if (vigente && actual === consulta) {
					setEstado(datos);
					setError("");
				}
			} catch (fallo) {
				if (vigente && actual === consulta) {
					setEstado(null);
					setError(fallo instanceof Error ? fallo.message : "No se pudo consultar el horario.");
				}
			} finally {
				if (vigente && actual === consulta) setCargando(false);
			}
		}
		void consultar();
		const temporizador = window.setInterval(() => { void consultar(); }, 30_000);
		return () => { vigente = false; window.clearInterval(temporizador); };
	}, [conRecogida, revision]);

	return { estado, error, cargando, recargar: () => setRevision((anterior) => anterior + 1) };
}
