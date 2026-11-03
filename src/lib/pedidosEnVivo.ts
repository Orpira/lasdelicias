// Pedidos y llamadas de mesa en tiempo real para las pantallas del personal (barra y cocina)
import { useCallback, useEffect, useRef, useState } from "react";
import { api, escuchar, leerToken } from "./api";
import type { EstadoPedido, LlamadaMesa, Pedido } from "../types/producto";

/** Pitido corto con Web Audio (sin archivos de sonido) */
export function pitar(veces = 1) {
	try {
		const ctx = new AudioContext();
		for (let i = 0; i < veces; i++) {
			const osc = ctx.createOscillator();
			const gan = ctx.createGain();
			osc.frequency.value = 880;
			osc.connect(gan).connect(ctx.destination);
			const t = ctx.currentTime + i * 0.25;
			gan.gain.setValueAtTime(0.25, t);
			gan.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
			osc.start(t);
			osc.stop(t + 0.2);
		}
	} catch {
		/* sin audio */
	}
}

export interface AvisoStock {
	tipo: "stock.bajo" | "stock.agotado";
	id: string;
	nombre: string;
	stock: number;
	stock_minimo: number;
}

/** Orden de preparación: por orden de llegada */
export const porLlegada = (a: Pedido, b: Pedido) =>
	new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

export function minutosDesde(iso: string, ahora: number) {
	return Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 60000));
}

/** Reloj que se actualiza cada `cadaMs` */
export function useAhora(cadaMs = 30_000) {
	const [ahora, setAhora] = useState(Date.now());
	useEffect(() => {
		const t = setInterval(() => setAhora(Date.now()), cadaMs);
		return () => clearInterval(t);
	}, [cadaMs]);
	return ahora;
}

export function usePedidosEnVivo(alCaducar: () => void) {
	const [pedidos, setPedidos] = useState<Pedido[]>([]);
	const [llamadas, setLlamadas] = useState<LlamadaMesa[]>([]);
	const [conectado, setConectado] = useState(false);
	const [error, setError] = useState("");
	const [avisosStock, setAvisosStock] = useState<AvisoStock[]>([]);
	const vistos = useRef(new Set<string>());

	useEffect(() => {
		let cancelado = false;
		Promise.all([
			api<Pedido[]>("/admin/pedidos", { auth: true }),
			api<LlamadaMesa[]>("/admin/llamadas", { auth: true }),
		])
			.then(([p, l]) => {
				if (cancelado) return;
				p.forEach((x) => vistos.current.add(x.id!));
				setPedidos(p);
				setLlamadas(l);
			})
			.catch((e) => (e.status === 401 ? alCaducar() : setError(e.message)));

		const cerrar = escuchar(
			"/admin/stream",
			(evento, datos) => {
				if (evento === "pedido") {
					const p = datos as Pedido;
					if (!vistos.current.has(p.id!)) {
						vistos.current.add(p.id!);
						pitar(2);
					}
					setPedidos((prev) => [...prev.filter((x) => x.id !== p.id), p]);
				} else if (evento === "stock") {
					const a = datos as AvisoStock;
					pitar(1);
					setAvisosStock((prev) => [...prev.filter((x) => x.id !== a.id), a]);
				} else if (evento === "llamada") {
					const l = datos as LlamadaMesa;
					if (l.atendida) setLlamadas((prev) => prev.filter((x) => x.id !== l.id));
					else {
						pitar(3);
						setLlamadas((prev) => [...prev.filter((x) => x.id !== l.id), l]);
					}
				}
			},
			{
				auth: true,
				alCambiarConexion: (ok) => {
					setConectado(ok);
					if (!ok && !leerToken()) alCaducar(); // sesión caducada
				},
			},
		);
		return () => {
			cancelado = true;
			cerrar();
		};
	}, [alCaducar]);

	const mover = useCallback(async (p: Pedido, estado: EstadoPedido) => {
		try {
			const act = await api<Pedido>(`/admin/pedidos/${p.id}`, { metodo: "PATCH", cuerpo: { estado }, auth: true });
			setPedidos((prev) => prev.map((x) => (x.id === act.id ? act : x)));
		} catch (e) {
			setError(e instanceof Error ? e.message : "No se pudo actualizar");
		}
	}, []);

	const atender = useCallback(async (l: LlamadaMesa) => {
		setLlamadas((prev) => prev.filter((x) => x.id !== l.id));
		await api(`/admin/llamadas/${l.id}`, { metodo: "PATCH", auth: true }).catch(() => {});
	}, []);

	const descartarAvisoStock = useCallback((id: string) => setAvisosStock((prev) => prev.filter((x) => x.id !== id)), []);

	return { pedidos, llamadas, conectado, error, setError, mover, atender, avisosStock, descartarAvisoStock };
}

/** Mantiene la pantalla encendida (tablets de cocina/barra) mientras la vista esté abierta */
export function usePantallaEncendida() {
	useEffect(() => {
		let bloqueo: WakeLockSentinel | null = null;
		const pedir = async () => {
			try {
				if (document.visibilityState === "visible" && "wakeLock" in navigator) {
					bloqueo = await navigator.wakeLock.request("screen");
				}
			} catch {
				/* no soportado o denegado */
			}
		};
		pedir();
		document.addEventListener("visibilitychange", pedir);
		return () => {
			document.removeEventListener("visibilitychange", pedir);
			bloqueo?.release().catch(() => {});
		};
	}, []);
}
