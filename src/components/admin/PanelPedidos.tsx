// Panel de barra (KDS): pedidos en tiempo real y llamadas desde las mesas
import { useState } from "react";
import { AlertTriangle, ReceiptText } from "lucide-react";
import { api, ErrorApi, euros, hora } from "../../lib/api";
import { COLORES_PEDIDO, minutosDesde, porLlegada, useAhora, usePantallaEncendida, usePedidosEnVivo } from "../../lib/pedidosEnVivo";
import type { EstadoPedido, LlamadaMesa, MetodoPago, Pedido, PedidoPendienteCobro } from "../../types/producto";
import { etiquetaMesa } from "../../lib/mesa";
import CuentaCobro from "./CuentaCobro";
import BotonesCobro from "./BotonesCobro";

const COLUMNAS: { estado: EstadoPedido; titulo: string; color: string }[] = [
	{ estado: "nuevo", titulo: "Nuevos", color: "border-red-500" },
	{ estado: "preparando", titulo: "Preparando", color: "border-orange-500" },
	{ estado: "listo", titulo: "Listos", color: "border-green-500" },
];

const SIGUIENTE: Partial<Record<EstadoPedido, { estado: EstadoPedido; texto: string }>> = {
	nuevo: { estado: "preparando", texto: "Empezar" },
	preparando: { estado: "listo", texto: "Listo ✓" },
	listo: { estado: "entregado", texto: "Entregado" },
};

export default function PanelPedidos({ alCaducar, esAdmin }: { alCaducar: () => void; esAdmin: boolean }) {
	const { pedidos, llamadas, cuentas, pendientes, recargarCobros, actualizarPedido, conectado, error, setError, mover, atender, avisosStock, descartarAvisoStock } =
		usePedidosEnVivo(alCaducar, true);
	const [cuentaAbierta, setCuentaAbierta] = useState<string | null>(null);
	const [mostrarPendientes, setMostrarPendientes] = useState(false);
	const [cobrando, setCobrando] = useState<string | null>(null);
	const ahora = useAhora();
	usePantallaEncendida();

	function abrirLlamada(llamada: LlamadaMesa) {
		if (llamada.motivo === "atencion") { void atender(llamada); return; }
		const cuenta = cuentas.find((abierta) => abierta.mesa_numero === llamada.mesa_numero);
		if (cuenta) setCuentaAbierta(cuenta.id);
		else if (window.confirm("Esta mesa no tiene una cuenta abierta. ¿Marcar la llamada como atendida?")) void atender(llamada);
	}

	async function cobrarPedido(pedido: Pedido | PedidoPendienteCobro, metodo: MetodoPago) {
		if (!pedido.id) { setError("No se puede cobrar un pedido sin identificador"); return; }
		setCobrando(pedido.id);
		setError("");
		try {
			const cobrado = await api<Pedido>(`/admin/pedidos/${pedido.id}/cobrar`, {
				metodo: "POST", auth: true, cuerpo: { metodo_pago: metodo },
			});
			actualizarPedido(cobrado);
			await recargarCobros();
		} catch (fallo) {
			if (fallo instanceof ErrorApi && fallo.status === 401) alCaducar();
			else setError(fallo instanceof Error ? fallo.message : "No se pudo registrar el cobro");
		} finally {
			setCobrando(null);
		}
	}

	return (
		<div className="max-w-[1600px] mx-auto p-4">
			<div className="flex items-center gap-3 mb-4">
				<span className={`inline-flex items-center gap-2 text-sm font-semibold ${conectado ? "text-green-700" : "text-red-600"}`}>
					<span className={`w-2.5 h-2.5 rounded-full ${conectado ? "bg-green-500" : "bg-red-500 animate-pulse"}`} />
					{conectado ? "En directo" : "Reconectando…"}
				</span>
				{error && (
					<button onClick={() => setError("")} className="text-sm text-red-600 underline" role="alert">{error} (cerrar)</button>
				)}
			</div>

			{avisosStock.length > 0 && (
				<div className="flex flex-wrap gap-2 mb-4">
					{avisosStock.map((a) => (
						<button key={a.id} onClick={() => descartarAvisoStock(a.id)}
							className={`px-4 py-2 rounded-xl font-semibold shadow ${a.tipo === "stock.agotado" ? "bg-red-600 text-white" : "bg-orange-100 text-orange-900"}`}>
							📦 {a.nombre}: {a.tipo === "stock.agotado" ? "agotado" : `quedan ${a.stock}`} — reponer ✕
						</button>
					))}
				</div>
			)}

			<section className="mb-5 rounded-2xl border border-delicias/15 bg-merengue p-4" aria-labelledby="mesas-abiertas">
				<h2 id="mesas-abiertas" className="mb-3 flex items-center gap-2 text-xl font-extrabold text-tinta">
					<ReceiptText className="h-5 w-5 text-delicias" aria-hidden="true" /> Mesas abiertas
				</h2>
				{pendientes === null ? <p role="status" className="text-sm text-tinta/70">Cargando las cuentas…</p>
					: cuentas.length === 0 ? <p className="text-sm text-tinta/70">No hay mesas con cuenta abierta.</p>
						: <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
							{cuentas.map((cuenta) => <button key={cuenta.id} onClick={() => setCuentaAbierta(cuenta.id)}
								className="min-w-0 rounded-xl border border-delicias/20 bg-white p-4 text-left shadow-sm transition-colors hover:border-delicias">
								<span className="block break-words font-bold text-delicias">{etiquetaMesa(cuenta.mesa_numero, cuenta.mesa_nombre, { conNumero: true })}</span>
								<span className="my-1 block text-2xl font-extrabold">{euros(cuenta.total)}</span>
								<span className="block text-sm">{cuenta.numero_pedidos} {cuenta.numero_pedidos === 1 ? "pedido" : "pedidos"} · <b>{cuenta.pedidos_sin_entregar} sin entregar</b></span>
								<span className="mt-1 block text-sm text-tinta/70">Abierta hace {minutosDesde(cuenta.abierta_at, ahora)} min</span>
								{cuenta.de_dias_anteriores && <span className="mt-2 block text-sm font-bold text-orange-800">De un día anterior</span>}
							</button>)}
						</div>}
			</section>

			{pendientes !== null && pendientes.total > 0 && (
				<section className="mb-5 rounded-2xl border border-orange-300 bg-orange-50 p-4">
					<button onClick={() => setMostrarPendientes((anterior) => !anterior)} aria-expanded={mostrarPendientes} aria-controls="pendientes-cobro"
						className="flex min-h-[44px] items-center gap-2 font-bold text-orange-900">
						<AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" /> Pendiente de cobro ({pendientes.total})
					</button>
					{mostrarPendientes && <div id="pendientes-cobro" className="mt-3 space-y-3">
						{pendientes.cuentas.map((cuenta) => <button key={cuenta.id} onClick={() => setCuentaAbierta(cuenta.id)}
							className="flex w-full flex-wrap justify-between gap-2 rounded-xl bg-white p-4 text-left font-semibold">
							<span className="min-w-0 break-words">{etiquetaMesa(cuenta.mesa_numero, cuenta.mesa_nombre, { conNumero: true })} · cuenta de un día anterior</span><span>{euros(cuenta.total)} · Abrir cuenta</span>
						</button>)}
						{pendientes.pedidos.map((pedido) => <div key={pedido.id} className="rounded-xl bg-white p-4">
							<p className="mb-1 font-bold">Pedido #{pedido.numero_dia} · {pedido.nombre_cliente} · {euros(pedido.total)}</p>
							<p className="mb-3 text-sm text-tinta/70">{pedido.tipo === "whatsapp" ? "WhatsApp" : "Para llevar"} · entregado sin cobrar</p>
							<BotonesCobro alCobrar={(metodo) => cobrarPedido(pedido, metodo)} bloqueado={cobrando !== null} titulo={`Cobrar pedido #${pedido.numero_dia}`} />
						</div>)}
					</div>}
				</section>
			)}
			{cobrando && <p role="status" className="mb-4 font-semibold text-delicias">Registrando el cobro del pedido…</p>}

			{llamadas.length > 0 && (
				<div className="flex flex-wrap gap-3 mb-4">
					{llamadas.map((l) => (
						<button key={l.id} onClick={() => abrirLlamada(l)} disabled={l.motivo === "cuenta" && pendientes === null}
							className="animate-pulse px-5 py-3 rounded-xl bg-amber-400 text-amber-950 font-bold shadow disabled:opacity-50">
							{l.motivo === "cuenta" ? "🧾" : "🙋"} {etiquetaMesa(l.mesa_numero, l.mesa_nombre, { conNumero: true })} · {l.motivo === "cuenta" ? "pide la cuenta" : "llama"} · {hora(l.created_at)} — {l.motivo === "cuenta" ? "abrir cuenta" : "atendida ✓"}
						</button>
					))}
				</div>
			)}

			<div className="grid md:grid-cols-3 gap-4">
				{COLUMNAS.map((col) => {
					const lista = pedidos.filter((p) => p.estado === col.estado).sort(porLlegada);
					return (
						<section key={col.estado} className="bg-white/60 rounded-2xl p-3 min-h-[60vh]">
							<h2 className={`font-bold text-lg mb-3 flex justify-between border-b-2 pb-2 ${col.color}`}>
								{col.titulo} <span className="text-gray-500">{lista.length}</span>
							</h2>
							<div className="flex flex-col gap-3">
								{lista.map((p) => {
									const min = minutosDesde(p.created_at, ahora);
									const siguiente = SIGUIENTE[p.estado];
									const etiquetaActual = p.mesa_numero !== null ? etiquetaMesa(p.mesa_numero, p.mesa_nombre, { conNumero: true }) : null;
									const etiquetaAnterior = p.mesa_anterior !== null ? etiquetaMesa(p.mesa_anterior, null, { conNumero: true }) : null;
									return (
										<article key={p.id} className={`animacion-estado-pedido rounded-xl shadow border-l-8 ${COLORES_PEDIDO[p.estado]} p-4 transition-colors duration-500`}>
											<div className="flex items-start justify-between gap-2">
												<p className="text-3xl font-black">#{p.numero_dia}</p>
												<div className="text-right text-sm">
													<p className={`font-bold ${min >= 15 && p.estado !== "listo" ? "text-red-600" : "text-gray-500"}`}>hace {min} min</p>
													<p className="text-gray-500">{euros(p.total)}</p>
												</div>
											</div>
											<p className="font-semibold mt-1">
												{p.tipo === "mesa" && etiquetaActual && <span className="px-2 py-0.5 rounded bg-delicias-claro text-delicias mr-2">🪑 {etiquetaActual}</span>}
												{p.tipo === "recoger" && <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 mr-2">🛍️ {p.hora_recogida ? `Recoge ${hora(p.hora_recogida)}` : "Para llevar"}</span>}
												{p.tipo === "whatsapp" && <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 mr-2">💬 WhatsApp{p.hora_recogida ? ` · ${hora(p.hora_recogida)}` : ""}</span>}
												{p.nombre_cliente}
											</p>
											<ul className="mt-2 text-lg">
												{p.items.map((it, i) => (
													<li key={i}><b>{it.cantidad}×</b> {it.nombre}</li>
												))}
											</ul>
											{etiquetaAnterior && etiquetaActual && (
												<p className={`mt-2 p-2 rounded text-sm font-bold ${p.cambio_mesa === "detectado" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>
													{p.cambio_mesa === "detectado"
														? `⚠ Este móvil tiene otro pedido en ${etiquetaAnterior}. Confirma ${etiquetaActual} antes de servir.`
														: `🔄 Se cambió de ${etiquetaAnterior} a ${etiquetaActual}`}
												</p>
											)}
											{p.notas && <p className="mt-2 p-2 rounded bg-yellow-50 text-sm">📝 {p.notas}</p>}
											{p.estado === "listo" && p.tipo !== "mesa" && <div className="mt-4">
												<BotonesCobro alCobrar={(metodo) => cobrarPedido(p, metodo)} bloqueado={cobrando !== null} titulo="Entregado y cobrado" />
											</div>}
											<div className="flex gap-2 mt-3">
												{siguiente && !(p.estado === "listo" && p.tipo !== "mesa") && (
													<button onClick={() => mover(p, siguiente.estado)}
														className="flex-1 py-3 rounded-lg bg-delicias text-white font-bold text-lg hover:bg-delicias-oscuro">
														{siguiente.texto}
													</button>
												)}
												{p.estado === "listo" && p.tipo !== "mesa" && <button onClick={() => mover(p, "entregado")} disabled={cobrando !== null}
													className="min-h-[44px] flex-1 rounded-lg border border-gray-300 px-3 py-2 font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50">
													Entregado sin cobrar
												</button>}
												{(p.estado === "nuevo" || p.estado === "preparando") && (
													<button onClick={() => window.confirm(`¿Cancelar el pedido #${p.numero_dia}?`) && mover(p, "cancelado")}
														className="px-3 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200" title="Cancelar">✕</button>
												)}
											</div>
										</article>
									);
								})}
							</div>
						</section>
					);
				})}
			</div>
			{cuentaAbierta && <CuentaCobro key={cuentaAbierta} id={cuentaAbierta}
				actualizacion={cuentas.find((cuenta) => cuenta.id === cuentaAbierta)} esAdmin={esAdmin}
				alCerrar={() => setCuentaAbierta(null)} alCambiar={recargarCobros} alCaducar={alCaducar} />}
		</div>
	);
}
