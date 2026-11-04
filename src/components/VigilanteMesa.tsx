import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, escuchar } from "../lib/api";
import { useCarrito } from "../lib/carrito";
import { esEventoCuenta, leerCodigosPropios } from "../lib/cuentas";
import type { EventoCuenta, Pedido } from "../types/producto";

export default function VigilanteMesa({ activo }: { activo: boolean }) {
	const { mesa, mesaToken, mesaDesde, cuentas, registrarPedido, fijarMesa, vaciar } = useCarrito();
	const navegar = useNavigate();
	const [cierres, setCierres] = useState<EventoCuenta[]>([]);
	const agradecidas = useRef(new Set<string>());
	const desvinculadas = useRef(new Set<string>());
	const cuentaPropia = cuentas.filter((cuenta) => cuenta.mesaNumero === mesa && cuenta.caduca > Date.now())
		.sort((a, b) => b.caduca - a.caduca)[0]?.id;

	useEffect(() => {
		if (!activo || mesa === null || !mesaToken || mesaDesde === null) return;
		const desde = mesaDesde;
		let cancelado = false;
		let cerrar: (() => void) | undefined;
		let conectadoAntes = false;
		async function recuperarPedidos() {
			try {
				const resultados = await Promise.allSettled(leerCodigosPropios().map(async (codigo) => {
					const pedido = await api<Pedido>(`/pedidos/${codigo}`);
					if (!cancelado && pedido.mesa_numero === mesa) registrarPedido(pedido);
				}));
				for (const resultado of resultados) {
					if (resultado.status === "rejected") console.warn("No se pudo recuperar uno de los pedidos de este dispositivo", resultado.reason);
				}
			} catch (error) {
				console.warn("No se pudieron recuperar las cuentas de los pedidos anteriores de este dispositivo", error);
			}
		}
		const parametros = new URLSearchParams({ desde: new Date(desde).toISOString() });
		if (cuentaPropia) parametros.set("cuenta", cuentaPropia);
		async function iniciar() {
			await recuperarPedidos();
			if (cancelado) return;
			cerrar = escuchar(`/mesas/qr/${mesaToken}/stream?${parametros}`, (evento, datos) => {
				if (evento !== "cuenta") return;
				if (!esEventoCuenta(datos)) {
					console.warn("Se recibió un evento de cuenta con un formato no válido");
					return;
				}
				if (datos.tipo === "cuenta.actualizada" || datos.mesa_numero !== mesa
					|| !datos.cerrada_at || Date.parse(datos.cerrada_at) < desde) return;
				setCierres((anteriores) => [...anteriores.filter((cierre) => cierre.id !== datos.id), datos]);
			}, { alCambiarConexion: (conectado) => {
				if (!conectado) return;
				if (conectadoAntes) void recuperarPedidos();
				conectadoAntes = true;
			} });
		}
		void iniciar();
		return () => { cancelado = true; cerrar?.(); };
	}, [activo, mesa, mesaToken, mesaDesde, cuentaPropia, registrarPedido]);

	useEffect(() => {
		if (!activo) return;
		const propio = cierres.find((cierre) => cierre.tipo === "cuenta.cobrada"
			&& !agradecidas.current.has(cierre.id)
			&& cuentas.some((cuenta) => cuenta.id === cierre.id && cuenta.caduca > Date.now())
			&& cierre.cerrada_at !== null
			&& (mesa === null || (cierre.mesa_numero === mesa && mesaDesde !== null && Date.parse(cierre.cerrada_at) >= mesaDesde)));
		if (propio) {
			agradecidas.current.add(propio.id);
			fijarMesa(null);
			vaciar();
			navegar(`/gracias/${propio.id}`, { replace: true });
		} else if (mesa !== null && mesaDesde !== null) {
			const ajeno = cierres.find((cierre) => !desvinculadas.current.has(cierre.id) && cierre.mesa_numero === mesa
				&& cierre.cerrada_at !== null && Date.parse(cierre.cerrada_at) >= mesaDesde);
			if (ajeno) {
				desvinculadas.current.add(ajeno.id);
				fijarMesa(null);
			}
		}
	}, [activo, cierres, cuentas, mesa, mesaDesde, fijarMesa, vaciar, navegar]);

	return null;
}
