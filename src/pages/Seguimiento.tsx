// /pedido/:codigo — el cliente ve en tiempo real cómo va su pedido
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { BellRing, ChefHat, ClipboardCheck, Croissant } from "lucide-react";
import { FormularioOpinion } from "../components/Opiniones";
import GraciasPorLaVisita from "../components/GraciasPorLaVisita";
import { api, escuchar, euros, hora } from "../lib/api";
import type { EstadoPedido, Pedido } from "../types/producto";
import { etiquetaMesa } from "../lib/mesa";
import { useAhora } from "../lib/pedidosEnVivo";
import { diaApertura, estaProgramado } from "../lib/programados";

const PASOS: { estado: EstadoPedido; titulo: string; Icono: typeof ClipboardCheck }[] = [
	{ estado: "nuevo", titulo: "Recibido", Icono: ClipboardCheck },
	{ estado: "preparando", titulo: "Preparando", Icono: ChefHat },
	{ estado: "listo", titulo: "Listo", Icono: BellRing },
	{ estado: "entregado", titulo: "Entregado", Icono: Croissant },
];

function mensaje(p: Pedido, programado: boolean) {
	if (programado && p.atender_desde) {
		return `Hemos recibido tu pedido. Estamos cerrados ahora mismo: lo prepararemos el ${diaApertura(p.atender_desde, true)} a partir de las ${hora(p.atender_desde)}. Te avisaremos cuando esté listo.`;
	}
	switch (p.estado) {
		case "nuevo":
			return "Hemos recibido tu pedido.";
		case "preparando":
			return "Lo estamos preparando ahora mismo.";
		case "listo":
			return p.tipo === "mesa" ? "¡Ya va camino de tu mesa!" : "¡Tu pedido está listo! Pasa a recogerlo por la barra.";
		case "entregado":
			return "¡Que aproveche! Gracias por venir a Las Delicias.";
		case "cancelado":
			return "Este pedido se ha cancelado. Si es un error, pregunta en la barra.";
	}
}

export default function Seguimiento() {
	const { codigo = "" } = useParams();
	const [pedido, setPedido] = useState<Pedido | null>(null);
	const [opinada, setOpinada] = useState(true);
	const [error, setError] = useState("");
	const ahora = useAhora();

	useEffect(() => {
		let vigente = true;
		let recibido = false;
		setPedido(null);
		setError("");
		setOpinada(true);
		const actualizar = (datos: Pedido) => {
			recibido = true;
			setError("");
			setPedido((anterior) => anterior?.codigo === datos.codigo && (anterior.pagado_at && !datos.pagado_at
				|| Date.parse(anterior.updated_at) > Date.parse(datos.updated_at)) ? anterior : datos);
		};
		api<Pedido & { opinada: boolean }>(`/pedidos/${codigo}`)
			.then(({ opinada: yaOpinada, ...p }) => {
				if (!vigente) return;
				actualizar(p);
				setOpinada(yaOpinada);
			})
			.catch((e) => { if (vigente && !recibido) setError(e.message); });
		const cerrar = escuchar(`/pedidos/${codigo}/stream`, (evento, datos) => {
			if (evento === "pedido" && vigente) actualizar(datos as Pedido);
		});
		return () => { vigente = false; cerrar(); };
	}, [codigo]);

	// Aviso con vibración al pasar a "listo" (en móviles que lo permiten)
	useEffect(() => {
		if (pedido?.estado === "listo" && "vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
	}, [pedido?.estado]);

	if (error) return <p className="text-center text-gray-600 py-24">{error}</p>;
	if (!pedido) return <p className="text-center text-gray-500 py-24">Cargando tu pedido…</p>;

	const programado = pedido.fuera_horario && pedido.estado !== "cancelado" && !pedido.pagado_at && estaProgramado(pedido, ahora);
	const indice = programado ? 0 : PASOS.findIndex((p) => p.estado === pedido.estado);

	return (
		<div className="max-w-xl mx-auto px-4 py-8 text-tinta">
			<div className="text-center mb-6">
				<p className="text-tinta/60 font-semibold">Tu número de pedido</p>
				<p className="text-7xl font-extrabold tracking-titular text-delicias">#{pedido.numero_dia}</p>
				<p className="text-gray-600 mt-1">
					{pedido.nombre_cliente}
					{pedido.tipo === "mesa" && pedido.mesa_numero ? ` · ${etiquetaMesa(pedido.mesa_numero, pedido.mesa_nombre)}` : ""}
					{pedido.hora_recogida ? ` · Recoger a las ${hora(pedido.hora_recogida)}` : ""}
				</p>
			</div>

			<div className={`rounded-2xl p-5 mb-6 text-center text-lg font-semibold ${
				pedido.estado === "listo" ? "bg-green-100 text-green-800 animate-pulse"
				: pedido.estado === "cancelado" ? "bg-gray-100 text-gray-600"
				: "bg-delicias-claro text-delicias"}`} role="status" aria-live="polite">
				{mensaje(pedido, programado)}
			</div>

			{pedido.estado !== "cancelado" && (
				<ol className="grid grid-cols-4 gap-2 mb-8">
					{PASOS.map((paso, i) => (
						<li key={paso.estado} className={`text-center rounded-xl py-3 ${i <= indice ? "bg-delicias text-white" : "bg-merengue text-delicias/40"}`}>
							<paso.Icono className="w-6 h-6 mx-auto" aria-hidden="true" />
							<div className="text-xs font-semibold mt-1">{paso.titulo}</div>
						</li>
					))}
				</ol>
			)}

			{pedido.pagado_at && <p className="mb-6 rounded-xl bg-green-50 p-3 text-center font-bold text-green-800" role="status">Pagado · ¡Gracias!</p>}
			{pedido.estado === "entregado" && pedido.pagado_at && pedido.tipo !== "mesa" && pedido.metodo_pago ? (
				<GraciasPorLaVisita pedidos={[pedido]} total={pedido.total} metodo={pedido.metodo_pago}
					pedidoParaValorar={{ codigo: pedido.codigo, nombre_cliente: pedido.nombre_cliente, opinada }} />
			) : <>
			<ul className="bg-white rounded-2xl border border-delicias/15 divide-y">
				{pedido.items.map((it, i) => (
					<li key={i} className="flex justify-between p-3">
						<span>{it.cantidad} × {it.nombre}</span>
						<span>{euros(it.precio_unitario * it.cantidad)}</span>
					</li>
				))}
				<li className="flex justify-between p-3 font-bold">
					<span>Total</span>
					<span className="text-delicias">{euros(pedido.total)}</span>
				</li>
			</ul>
			{pedido.notas && <p className="mt-3 text-sm text-gray-600">📝 {pedido.notas}</p>}

			{(pedido.estado === "listo" || pedido.estado === "entregado") && !opinada && (
				<section className="mt-8 p-6 rounded-2xl bg-merengue" aria-labelledby="titulo-valorar">
					<h2 id="titulo-valorar" className="text-2xl font-extrabold tracking-titular mb-1">¿Qué tal todo?</h2>
					<p className="text-tinta/70 mb-4">Tu opinión nos ayuda a mejorar y a que otros nos conozcan.</p>
					<FormularioOpinion key={pedido.codigo} pedidoCodigo={pedido.codigo} nombreInicial={pedido.nombre_cliente} />
				</section>
			)}

			<p className="text-center text-sm text-gray-500 mt-6">
				Puedes dejar esta página abierta: se actualiza sola.
			</p>
			<div className="text-center mt-4">
				<Link to="/menu" className="text-delicias font-semibold underline">Volver a la carta</Link>
			</div>
			</>}
		</div>
	);
}
