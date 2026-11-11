import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import GraciasPorLaVisita, { type PedidoParaValorar } from "../components/GraciasPorLaVisita";
import { api } from "../lib/api";
import { useCarrito } from "../lib/carrito";
import { etiquetaMesa } from "../lib/mesa";
import type { CuentaDetalle, Pedido } from "../types/producto";

export default function Gracias() {
	const { cuentaId = "" } = useParams();
	const { cuentas } = useCarrito();
	const [cuenta, setCuenta] = useState<CuentaDetalle | null>(null);
	const [error, setError] = useState("");
	const [valoracion, setValoracion] = useState<PedidoParaValorar | null>(null);
	const [errorValoracion, setErrorValoracion] = useState("");
	const [comprobando, setComprobando] = useState(false);
	const [reintento, setReintento] = useState(0);
	const codigos = cuentas.find((guardada) => guardada.id === cuentaId && guardada.caduca > Date.now())
		?.pedidos.slice().sort((a, b) => b.creadoEn - a.creadoEn).map((pedido) => pedido.codigo).join(",") ?? "";

	useEffect(() => {
		let vigente = true;
		setCuenta(null);
		setError("");
		api<CuentaDetalle>(`/cuentas/${encodeURIComponent(cuentaId)}/resumen`, { cabeceras: { "X-Pedido-Codigo": codigos.split(",")[0] ?? "" } })
			.then((datos) => { if (vigente) setCuenta(datos); })
			.catch((fallo) => { if (vigente) setError(fallo.message); });
		return () => { vigente = false; };
	}, [cuentaId, codigos]);

	useEffect(() => {
		let vigente = true;
		setValoracion(null);
		setErrorValoracion("");
		if (!codigos) { setComprobando(false); return; }
		setComprobando(true);
		async function comprobar() {
			try {
				for (const codigo of codigos.split(",")) {
					const pedido = await api<Pedido & { opinada: boolean }>(`/pedidos/${codigo}`);
					if (pedido.cuenta_id === cuentaId && pedido.pagado_at && pedido.estado !== "cancelado") {
						if (vigente) setValoracion({ codigo, nombre_cliente: pedido.nombre_cliente, opinada: pedido.opinada });
						break;
					}
				}
			} catch (fallo) {
				if (vigente) setErrorValoracion(fallo instanceof Error ? fallo.message : "No se pudo comprobar la valoración");
			} finally {
				if (vigente) setComprobando(false);
			}
		}
		void comprobar();
		return () => { vigente = false; };
	}, [cuentaId, codigos, reintento]);

	if (error) return (
		<div className="mx-auto max-w-xl px-5 py-16 text-center">
			<h1 className="mb-3 text-2xl font-bold">No podemos mostrar esta cuenta</h1>
			<p role="alert">{error}</p>
			<p className="mt-3 text-sm text-tinta/70">El resumen solo está disponible durante las 24 horas siguientes al cobro.</p>
			<Link to="/menu" className="mt-5 inline-block font-semibold text-delicias underline">Volver a la carta</Link>
		</div>
	);
	if (!cuenta) return <p className="py-24 text-center text-tinta/70" role="status">Cargando el resumen de tu visita…</p>;
	if (!cuenta.metodo_pago) return <p className="py-24 text-center text-red-700" role="alert">No se ha podido confirmar el método de cobro de esta cuenta.</p>;
	return (
		<div className="mx-auto max-w-xl px-5 py-10">
			<GraciasPorLaVisita pedidos={cuenta.pedidos} total={cuenta.total} metodo={cuenta.metodo_pago}
				mesa={etiquetaMesa(cuenta.mesa_numero, cuenta.mesa_nombre)} pedidoParaValorar={valoracion} />
			{comprobando && <p role="status" className="mt-4 text-center text-sm text-tinta/70">Comprobando tu valoración…</p>}
			{errorValoracion && <p role="alert" className="mt-4 text-sm text-red-700">
				No se pudo comprobar si ya has valorado: {errorValoracion}.{" "}
				<button onClick={() => setReintento((anterior) => anterior + 1)} className="font-bold underline">Volver a intentar</button>
			</p>}
		</div>
	);
}
