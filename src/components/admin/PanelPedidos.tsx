// Panel de barra (KDS): pedidos en tiempo real y llamadas desde las mesas
import { euros, hora } from "../../lib/api";
import { minutosDesde, porLlegada, useAhora, usePantallaEncendida, usePedidosEnVivo } from "../../lib/pedidosEnVivo";
import type { EstadoPedido } from "../../types/producto";
import { etiquetaMesa } from "../../lib/mesa";

const COLUMNAS: { estado: EstadoPedido; titulo: string; color: string }[] = [
	{ estado: "nuevo", titulo: "Nuevos", color: "border-delicias" },
	{ estado: "preparando", titulo: "Preparando", color: "border-amber-400" },
	{ estado: "listo", titulo: "Listos", color: "border-green-500" },
];

const SIGUIENTE: Partial<Record<EstadoPedido, { estado: EstadoPedido; texto: string }>> = {
	nuevo: { estado: "preparando", texto: "Empezar" },
	preparando: { estado: "listo", texto: "Listo ✓" },
	listo: { estado: "entregado", texto: "Entregado" },
};

export default function PanelPedidos({ alCaducar }: { alCaducar: () => void }) {
	const { pedidos, llamadas, conectado, error, setError, mover, atender, avisosStock, descartarAvisoStock } =
		usePedidosEnVivo(alCaducar);
	const ahora = useAhora();
	usePantallaEncendida();

	return (
		<div className="max-w-[1600px] mx-auto p-4">
			<div className="flex items-center gap-3 mb-4">
				<span className={`inline-flex items-center gap-2 text-sm font-semibold ${conectado ? "text-green-700" : "text-red-600"}`}>
					<span className={`w-2.5 h-2.5 rounded-full ${conectado ? "bg-green-500" : "bg-red-500 animate-pulse"}`} />
					{conectado ? "En directo" : "Reconectando…"}
				</span>
				{error && (
					<button onClick={() => setError("")} className="text-sm text-red-600 underline">{error} (cerrar)</button>
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

			{llamadas.length > 0 && (
				<div className="flex flex-wrap gap-3 mb-4">
					{llamadas.map((l) => (
						<button key={l.id} onClick={() => atender(l)}
							className="animate-pulse px-5 py-3 rounded-xl bg-amber-400 text-amber-950 font-bold shadow">
							{l.motivo === "cuenta" ? "🧾" : "🙋"} {etiquetaMesa(l.mesa_numero, l.mesa_nombre, { conNumero: true })} · {l.motivo === "cuenta" ? "pide la cuenta" : "llama"} · {hora(l.created_at)} — atendida ✓
						</button>
					))}
				</div>
			)}

			<div className="grid md:grid-cols-3 gap-4">
				{COLUMNAS.map((col) => {
					const lista = pedidos.filter((p) => p.estado === col.estado).sort(porLlegada);
					return (
						<section key={col.estado} className="bg-white/60 rounded-2xl p-3 min-h-[60vh]">
							<h2 className="font-bold text-lg mb-3 flex justify-between">
								{col.titulo} <span className="text-gray-500">{lista.length}</span>
							</h2>
							<div className="flex flex-col gap-3">
								{lista.map((p) => {
									const min = minutosDesde(p.created_at, ahora);
									const siguiente = SIGUIENTE[p.estado];
									const etiquetaActual = p.mesa_numero !== null ? etiquetaMesa(p.mesa_numero, p.mesa_nombre, { conNumero: true }) : null;
									const etiquetaAnterior = p.mesa_anterior !== null ? etiquetaMesa(p.mesa_anterior, null, { conNumero: true }) : null;
									return (
										<article key={p.id} className={`bg-white rounded-xl shadow border-l-8 ${col.color} p-4`}>
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
											<div className="flex gap-2 mt-3">
												{siguiente && (
													<button onClick={() => mover(p, siguiente.estado)}
														className="flex-1 py-3 rounded-lg bg-delicias text-white font-bold text-lg hover:bg-delicias-oscuro">
														{siguiente.texto}
													</button>
												)}
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
		</div>
	);
}
