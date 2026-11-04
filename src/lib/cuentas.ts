import type { EstadoPedido, EventoCuenta, MetodoPago } from "../types/producto";

const CLAVE_MIS_PEDIDOS = "delicias.misPedidos";

export function leerCodigosPropios(): string[] {
	const datos: unknown = JSON.parse(localStorage.getItem(CLAVE_MIS_PEDIDOS) ?? "[]");
	if (!Array.isArray(datos) || !datos.every((codigo: unknown): codigo is string => typeof codigo === "string" && /^[a-z0-9]{10}$/.test(codigo))) {
		throw new Error("Los códigos de pedidos guardados no tienen un formato válido");
	}
	return datos.slice(0, 10);
}

export function recordarPedido(codigo: string) {
	try {
		if (!/^[a-z0-9]{10}$/.test(codigo)) throw new Error("El código del pedido no tiene un formato válido");
		const previos = leerCodigosPropios();
		localStorage.setItem(CLAVE_MIS_PEDIDOS, JSON.stringify([codigo, ...previos.filter((anterior) => anterior !== codigo)].slice(0, 10)));
	} catch (error) {
		console.warn("El pedido se ha creado, pero no se pudo recordar su código en este dispositivo", error);
	}
}

export const METODOS_PAGO: { id: MetodoPago; nombre: string }[] = [
	{ id: "efectivo", nombre: "Efectivo" },
	{ id: "tarjeta", nombre: "Tarjeta" },
	{ id: "bizum", nombre: "Bizum" },
	{ id: "otro", nombre: "Otro" },
];

export const NOMBRES_ESTADO: Record<EstadoPedido, string> = {
	nuevo: "Recibido", preparando: "Preparando", listo: "Listo", entregado: "Entregado", cancelado: "Cancelado",
};

export function nombreMetodo(metodo: MetodoPago) {
	return METODOS_PAGO.find((opcion) => opcion.id === metodo)!.nombre;
}

export function esEventoCuenta(datos: unknown): datos is EventoCuenta {
	if (typeof datos !== "object" || datos === null) return false;
	return "id" in datos && typeof datos.id === "string" && /^[1-9]\d*$/.test(datos.id)
		&& "tipo" in datos && typeof datos.tipo === "string" && ["cuenta.actualizada", "cuenta.cobrada", "cuenta.anulada"].includes(datos.tipo)
		&& "mesa_numero" in datos && typeof datos.mesa_numero === "number" && Number.isInteger(datos.mesa_numero) && datos.mesa_numero > 0
		&& "estado" in datos && typeof datos.estado === "string" && ["abierta", "cobrada", "anulada"].includes(datos.estado)
		&& "total" in datos && typeof datos.total === "number" && Number.isFinite(datos.total) && datos.total >= 0
		&& "metodo_pago" in datos && (datos.metodo_pago === null || METODOS_PAGO.some((metodo) => metodo.id === datos.metodo_pago))
		&& "cerrada_at" in datos && (datos.cerrada_at === null || typeof datos.cerrada_at === "string" && Number.isFinite(Date.parse(datos.cerrada_at)));
}
