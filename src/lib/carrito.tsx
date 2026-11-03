// Carrito compartido entre la carta y la pantalla de pedido.
// Se guarda en el navegador para no perderlo al recargar.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Producto } from "../types/producto";

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

interface Carrito {
	lineas: LineaCarrito[];
	mesa: number | null;
	mesaToken: string | null;
	mesaNombre: string | null;
	total: number;
	unidades: number;
	cantidadDe: (id: string) => number;
	cambiar: (producto: Producto, delta: number) => void;
	fijarCantidad: (id: string, cantidad: number) => void;
	vaciar: () => void;
	fijarMesa: (mesa: Omit<MesaActual, "desde"> | null) => void;
}

const ContextoCarrito = createContext<Carrito | null>(null);
const CLAVE = "delicias.carrito";

function cargar(): { lineas: LineaCarrito[]; mesa: MesaActual | null } {
	try {
		const guardado = JSON.parse(localStorage.getItem(CLAVE) ?? "null");
		if (guardado && Array.isArray(guardado.lineas)) {
			const mesa = guardado.mesa;
			const vigente = mesa && typeof mesa === "object" && mesa.token && Date.now() - mesa.desde < VIGENCIA_MESA_MS;
			return {
				lineas: guardado.lineas,
				mesa: vigente ? { ...mesa, nombre: typeof mesa.nombre === "string" ? mesa.nombre : null } : null,
			};
		}
	} catch {
		/* sin almacenamiento o dato corrupto */
	}
	return { lineas: [], mesa: null };
}

export function CarritoProvider({ children }: { children: ReactNode }) {
	const inicial = useMemo(cargar, []);
	const [lineas, setLineas] = useState<LineaCarrito[]>(inicial.lineas);
	const [mesa, setMesa] = useState<MesaActual | null>(inicial.mesa);

	// Estable entre renders: se puede usar en dependencias de efectos
	const fijarMesa = useCallback(
		(m: Omit<MesaActual, "desde"> | null) => setMesa(m ? { ...m, desde: Date.now() } : null),
		[],
	);

	useEffect(() => {
		try {
			localStorage.setItem(CLAVE, JSON.stringify({ lineas, mesa }));
		} catch {
			/* ignorar */
		}
	}, [lineas, mesa]);

	const valor = useMemo<Carrito>(() => {
		const total = lineas.reduce((acc, l) => acc + l.producto.precio * l.cantidad, 0);
		const unidades = lineas.reduce((acc, l) => acc + l.cantidad, 0);
		return {
			lineas,
			mesa: mesa?.numero ?? null,
			mesaToken: mesa?.token ?? null,
			mesaNombre: mesa?.nombre ?? null,
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
			vaciar: () => setLineas([]),
			fijarMesa,
		};
	}, [lineas, mesa, fijarMesa]);

	return <ContextoCarrito.Provider value={valor}>{children}</ContextoCarrito.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCarrito() {
	const ctx = useContext(ContextoCarrito);
	if (!ctx) throw new Error("useCarrito debe usarse dentro de CarritoProvider");
	return ctx;
}
