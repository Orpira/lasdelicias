import type { Pedido } from "../types/producto";

export function estaProgramado(pedido: Pick<Pedido, "atender_desde">, ahora: number) {
	return pedido.atender_desde !== null && Date.parse(pedido.atender_desde) > ahora;
}

export function diaApertura(iso: string, conFecha = false) {
	return new Intl.DateTimeFormat("es-ES", {
		timeZone: "Europe/Madrid", weekday: "long",
		...(conFecha ? { day: "numeric", month: "long" } : {}),
	}).format(new Date(iso));
}

export function avisosDeApertura(
	pedidos: Pick<Pedido, "codigo" | "estado" | "atender_desde">[],
	ahora: number,
	pendientes: Set<string>,
) {
	let avisos = 0;
	const presentes = new Set(pedidos.map((pedido) => pedido.codigo));
	for (const codigo of pendientes) if (!presentes.has(codigo)) pendientes.delete(codigo);
	for (const pedido of pedidos) {
		if (pedido.estado !== "nuevo") pendientes.delete(pedido.codigo);
		else if (estaProgramado(pedido, ahora)) pendientes.add(pedido.codigo);
		else if (pendientes.delete(pedido.codigo)) avisos++;
	}
	return avisos;
}
