// Carrito compartido entre la carta y la pantalla de pedido.
// Se guarda en el navegador para no perderlo al recargar.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Pedido, Producto } from "../types/producto";

export interface MesaActual {
	numero: number;
	token: string; // código secreto del QR
	nombre: string | null;
	desde: number; // cuándo se escaneó (ms)
}

// Tras este tiempo sin volver a escanear, la mesa se olvida (evita pedir "a una mesa" desde casa)
const VIGENCIA_MESA_MS = 4 * 60 * 60 * 1000;

export interface LineaCarrito {
	producto: Producto;
	cantidad: number;
}

interface CuentaDispositivo {
	id: string;
	mesaNumero: number;
	pedidos: { codigo: string; creadoEn: number }[];
	caduca: number;
}

interface Carrito {
	lineas: LineaCarrito[];
	mesa: number | null;
	mesaToken: string | null;
	mesaNombre: string | null;
	mesaDesde: number | null;
	cuentas: CuentaDispositivo[];
	registrarPedido: (pedido: Pick<Pedido, "codigo" | "cuenta_id" | "mesa_numero" | "created_at">) => void;
	total: number;
	unidades: number;
	cantidadDe: (id: string) => number;
	cambiar: (producto: Producto, delta: number) => void;
	fijarCantidad: (id: string, cantidad: number) => void;
	vaciar: () => void;
	fijarMesa: (mesa: Omit<MesaActual, "desde"> | null) => void;
	confirmarMesaDelPedido: (mesa: MesaActual) => void;
}

const ContextoCarrito = createContext<Carrito | null>(null);
const CLAVE = "delicias.carrito";
const CLAVE_CUENTAS = "delicias.cuentas";
const VIGENCIA_CUENTAS_MS = 12 * 60 * 60 * 1000;

function esObjeto(valor: unknown): valor is Record<string, unknown> {
	return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function esCuentaDispositivo(valor: unknown): valor is CuentaDispositivo {
	return esObjeto(valor) && typeof valor.id === "string" && /^[1-9]\d*$/.test(valor.id)
		&& typeof valor.mesaNumero === "number" && Number.isInteger(valor.mesaNumero) && valor.mesaNumero > 0
		&& typeof valor.caduca === "number" && Number.isFinite(valor.caduca)
		&& Array.isArray(valor.pedidos) && valor.pedidos.every((pedido: unknown) =>
			esObjeto(pedido) && typeof pedido.codigo === "string" && /^[a-z0-9]{10}$/.test(pedido.codigo)
			&& typeof pedido.creadoEn === "number" && Number.isFinite(pedido.creadoEn));
}

function cargarCuentas(): CuentaDispositivo[] {
	try {
		const datos: unknown = JSON.parse(localStorage.getItem(CLAVE_CUENTAS) ?? "[]");
		if (!Array.isArray(datos)) throw new Error("Formato de cuentas guardadas no válido");
		const validas = datos.filter(esCuentaDispositivo);
		if (validas.length !== datos.length) console.warn("Se han descartado cuentas guardadas con un formato no válido");
		return validas.filter((cuenta) => cuenta.caduca > Date.now());
	} catch (error) {
		console.warn("No se pudieron leer las cuentas de este dispositivo", error);
		return [];
	}
}

function cargar(): { lineas: LineaCarrito[]; mesa: MesaActual | null } {
	try {
		const guardado = JSON.parse(localStorage.getItem(CLAVE) ?? "null");
		if (guardado && Array.isArray(guardado.lineas)) {
			const mesa = guardado.mesa;
			const vigente = mesa && typeof mesa === "object" && typeof mesa.token === "string" && /^[a-f0-9]{32}$/.test(mesa.token)
				&& Number.isInteger(mesa.numero) && mesa.numero > 0 && typeof mesa.desde === "number"
				&& Number.isFinite(mesa.desde) && Date.now() >= mesa.desde && Date.now() - mesa.desde < VIGENCIA_MESA_MS;
			return {
				lineas: guardado.lineas,
				mesa: vigente ? { ...mesa, nombre: typeof mesa.nombre === "string" ? mesa.nombre : null } : null,
			};
		}
	} catch (error) {
		console.warn("No se pudo recuperar el carrito guardado", error);
	}
	return { lineas: [], mesa: null };
}

export function CarritoProvider({ children }: { children: ReactNode }) {
	const inicial = useMemo(cargar, []);
	const [lineas, setLineas] = useState<LineaCarrito[]>(inicial.lineas);
	const [mesa, setMesa] = useState<MesaActual | null>(inicial.mesa);
	const [cuentas, setCuentas] = useState(cargarCuentas);
	const vaciar = useCallback(() => setLineas([]), []);
	const registrarPedido = useCallback((pedido: Pick<Pedido, "codigo" | "cuenta_id" | "mesa_numero" | "created_at">) => {
		if (!pedido.cuenta_id || pedido.mesa_numero === null) return;
		const id = pedido.cuenta_id;
		const mesaNumero = pedido.mesa_numero;
		const creadoEn = Date.parse(pedido.created_at);
		if (!/^[1-9]\d*$/.test(id) || !/^[a-z0-9]{10}$/.test(pedido.codigo) || !Number.isFinite(creadoEn)) {
			console.warn("No se pudo recordar la cuenta: el pedido tiene un formato no válido");
			return;
		}
		if (creadoEn + VIGENCIA_CUENTAS_MS <= Date.now()) return;
		setCuentas((anteriores) => {
			const vigente = anteriores.filter((cuenta) => cuenta.caduca > Date.now());
			const previa = vigente.find((cuenta) => cuenta.id === id);
			const pedidos = [...(previa?.pedidos ?? []).filter((anterior) => anterior.codigo !== pedido.codigo),
				{ codigo: pedido.codigo, creadoEn }].sort((a, b) => a.creadoEn - b.creadoEn);
			const otras = vigente.filter((cuenta) => cuenta.id !== id).map((cuenta) => ({
				...cuenta, pedidos: cuenta.pedidos.filter((anterior) => anterior.codigo !== pedido.codigo),
			})).filter((cuenta) => cuenta.pedidos.length > 0).map((cuenta) => ({
				...cuenta, caduca: Math.max(...cuenta.pedidos.map((anterior) => anterior.creadoEn)) + VIGENCIA_CUENTAS_MS,
			}));
			return [...otras, { id, mesaNumero, pedidos, caduca: Math.max(...pedidos.map((anterior) => anterior.creadoEn)) + VIGENCIA_CUENTAS_MS }];
		});
	}, []);

	// Estable entre renders: se puede usar en dependencias de efectos
	const fijarMesa = useCallback(
		(m: Omit<MesaActual, "desde"> | null) => setMesa(m ? { ...m, desde: Date.now() } : null),
		[],
	);
	// El cobro puede desvincular la mesa mientras aún llega la respuesta de un pedido.
	const confirmarMesaDelPedido = useCallback((confirmada: MesaActual) => setMesa((actual) => actual ?? confirmada), []);

	useEffect(() => {
		try {
			localStorage.setItem(CLAVE, JSON.stringify({ lineas, mesa }));
		} catch {
			/* ignorar */
		}
	}, [lineas, mesa]);

	useEffect(() => {
		try {
			if (cuentas.length) localStorage.setItem(CLAVE_CUENTAS, JSON.stringify(cuentas));
			else localStorage.removeItem(CLAVE_CUENTAS);
		} catch (error) {
			console.warn("No se pudieron guardar las cuentas de este dispositivo", error);
		}
	}, [cuentas]);

	useEffect(() => {
		if (!cuentas.length) return;
		const siguiente = Math.min(...cuentas.map((cuenta) => cuenta.caduca));
		const temporizador = setTimeout(
			() => setCuentas((anteriores) => anteriores.filter((cuenta) => cuenta.caduca > Date.now())),
			Math.max(1, siguiente - Date.now()),
		);
		return () => clearTimeout(temporizador);
	}, [cuentas]);

	useEffect(() => {
		const actualizar = (evento: StorageEvent) => {
			if (evento.key === CLAVE_CUENTAS || evento.key === null) setCuentas(cargarCuentas());
		};
		window.addEventListener("storage", actualizar);
		return () => window.removeEventListener("storage", actualizar);
	}, []);

	const valor = useMemo<Carrito>(() => {
		const total = lineas.reduce((acc, l) => acc + l.producto.precio * l.cantidad, 0);
		const unidades = lineas.reduce((acc, l) => acc + l.cantidad, 0);
		return {
			lineas,
			mesa: mesa?.numero ?? null,
			mesaToken: mesa?.token ?? null,
			mesaNombre: mesa?.nombre ?? null,
			mesaDesde: mesa?.desde ?? null,
			cuentas,
			registrarPedido,
			total,
			unidades,
			cantidadDe: (id) => lineas.find((l) => l.producto.id === id)?.cantidad ?? 0,
			cambiar: (producto, delta) =>
				setLineas((prev) => {
					const actual = prev.find((l) => l.producto.id === producto.id);
					const nueva = Math.min(50, Math.max(0, (actual?.cantidad ?? 0) + delta));
					if (nueva === 0) return prev.filter((l) => l.producto.id !== producto.id);
					if (actual) return prev.map((l) => (l.producto.id === producto.id ? { ...l, cantidad: nueva } : l));
					return [...prev, { producto, cantidad: nueva }];
				}),
			fijarCantidad: (id, cantidad) =>
				setLineas((prev) =>
					cantidad <= 0
						? prev.filter((l) => l.producto.id !== id)
						: prev.map((l) => (l.producto.id === id ? { ...l, cantidad: Math.min(50, cantidad) } : l)),
				),
			vaciar,
			fijarMesa,
			confirmarMesaDelPedido,
		};
	}, [lineas, mesa, cuentas, fijarMesa, confirmarMesaDelPedido, vaciar, registrarPedido]);

	return <ContextoCarrito.Provider value={valor}>{children}</ContextoCarrito.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCarrito() {
	const ctx = useContext(ContextoCarrito);
	if (!ctx) throw new Error("useCarrito debe usarse dentro de CarritoProvider");
	return ctx;
}
