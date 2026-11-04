// Pedidos y llamadas de mesa en tiempo real para las pantallas del personal (barra y cocina)
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ErrorApi, escuchar, leerToken } from "./api";
import type { Cuenta, EstadoPedido, LlamadaMesa, Pedido, PendientesCobro } from "../types/producto";
import { esEventoCuenta } from "./cuentas";

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

export const COLORES_PEDIDO: Record<EstadoPedido, string> = {
	nuevo: "border-red-500 bg-red-50",
	preparando: "border-orange-500 bg-orange-50",
	listo: "border-green-500 bg-white",
	entregado: "border-green-600 bg-white",
	cancelado: "border-gray-400 bg-gray-50",
};

export function usePedidosEnVivo(alCaducar: () => void, conCobro = false) {
	const [pedidos, setPedidos] = useState<Pedido[]>([]);
	const [llamadas, setLlamadas] = useState<LlamadaMesa[]>([]);
	const [conectado, setConectado] = useState(false);
	const [error, setError] = useState("");
	const [avisosStock, setAvisosStock] = useState<AvisoStock[]>([]);
	const vistos = useRef(new Set<string>());
	const [cuentas, setCuentas] = useState<Cuenta[]>([]);
	const [pendientes, setPendientes] = useState<PendientesCobro | null>(null);
	const consultasCobro = useRef({ revision: 0 });

	const recargarCobros = useCallback(async () => {
		if (!conCobro) return;
		const actual = ++consultasCobro.current.revision;
		try {
			const [abiertas, porCobrar] = await Promise.all([
				api<Cuenta[]>("/admin/cuentas?estado=abierta", { auth: true }),
				api<PendientesCobro>("/admin/pendientes-cobro", { auth: true }),
			]);
			if (actual !== consultasCobro.current.revision) return;
			setCuentas(abiertas);
			setPendientes(porCobrar);
		} catch (fallo) {
			if (actual !== consultasCobro.current.revision) return;
			if (fallo instanceof ErrorApi && fallo.status === 401) alCaducar();
			else setError(fallo instanceof Error ? fallo.message : "No se pudieron actualizar las cuentas");
		}
	}, [conCobro, alCaducar]);

	useEffect(() => {
		const estadoCobros = consultasCobro.current;
		let cancelado = false;
		let revision = 0;
		let consulta = 0;
		async function cargar() {
			const actual = ++consulta;
			const inicio = revision;
			try {
				const [p, l] = await Promise.all([
					api<Pedido[]>("/admin/pedidos", { auth: true }),
					api<LlamadaMesa[]>("/admin/llamadas", { auth: true }),
				]);
				if (cancelado || actual !== consulta) return;
				if (inicio !== revision) { void cargar(); return; }
				p.forEach((pedido) => vistos.current.add(pedido.id!));
				setPedidos(p);
				setLlamadas(l);
			} catch (fallo) {
				if (cancelado || actual !== consulta) return;
				if (fallo instanceof ErrorApi && fallo.status === 401) alCaducar();
				else setError(fallo instanceof Error ? fallo.message : "No se pudieron cargar los pedidos");
			}
		}
		void cargar();
		void recargarCobros();

		const cerrar = escuchar(
			"/admin/stream",
			(evento, datos) => {
				if (evento === "pedido") {
					revision++;
					const p = datos as Pedido;
					if (!vistos.current.has(p.id!)) {
						vistos.current.add(p.id!);
						pitar(2);
					}
					setPedidos((prev) => [...prev.filter((x) => x.id !== p.id), p]);
					void recargarCobros();
				} else if (evento === "cuenta") {
					if (esEventoCuenta(datos)) void recargarCobros();
					else console.warn("El panel recibió un evento de cuenta con un formato no válido");
				} else if (evento === "stock") {
					const a = datos as AvisoStock;
					pitar(1);
					setAvisosStock((prev) => [...prev.filter((x) => x.id !== a.id), a]);
				} else if (evento === "llamada") {
					revision++;
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
					if (ok) { void cargar(); void recargarCobros(); }
					if (!ok && !leerToken()) alCaducar(); // sesión caducada
				},
			},
		);
		return () => {
			cancelado = true;
			estadoCobros.revision++;
			cerrar();
		};
	}, [alCaducar, recargarCobros]);

	const actualizarPedido = useCallback((pedido: Pedido) => {
		setPedidos((anteriores) => [...anteriores.filter((anterior) => anterior.id !== pedido.id), pedido]);
	}, []);

	const mover = useCallback(async (p: Pedido, estado: EstadoPedido) => {
		try {
			const act = await api<Pedido>(`/admin/pedidos/${p.id}`, { metodo: "PATCH", cuerpo: { estado }, auth: true });
			actualizarPedido(act);
			await recargarCobros();
		} catch (e) {
			if (e instanceof ErrorApi && e.status === 401) alCaducar();
			else setError(e instanceof Error ? e.message : "No se pudo actualizar");
		}
	}, [alCaducar, actualizarPedido, recargarCobros]);

	const atender = useCallback(async (l: LlamadaMesa) => {
		try {
			await api(`/admin/llamadas/${l.id}`, { metodo: "PATCH", auth: true });
			setLlamadas((prev) => prev.filter((x) => x.id !== l.id));
		} catch (fallo) {
			if (fallo instanceof ErrorApi && fallo.status === 401) alCaducar();
			else setError(fallo instanceof Error ? fallo.message : "No se pudo atender la llamada");
		}
	}, [alCaducar]);

	const descartarAvisoStock = useCallback((id: string) => setAvisosStock((prev) => prev.filter((x) => x.id !== id)), []);

	return { pedidos, llamadas, cuentas, pendientes, recargarCobros, actualizarPedido, conectado, error, setError, mover, atender, avisosStock, descartarAvisoStock };
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
