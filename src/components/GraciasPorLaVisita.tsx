import { CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { euros } from "../lib/api";
import { nombreMetodo } from "../lib/cuentas";
import { useNegocio } from "../lib/negocio";
import type { MetodoPago, PedidoCuenta } from "../types/producto";
import IconoMarca from "./IconoMarca";
import { FormularioOpinion } from "./Opiniones";

export interface PedidoParaValorar {
	codigo: string;
	nombre_cliente: string;
	opinada: boolean;
}

export default function GraciasPorLaVisita({ pedidos, total, metodo, mesa, pedidoParaValorar }: {
	pedidos: PedidoCuenta[];
	total: number;
	metodo: MetodoPago;
	mesa?: string;
	pedidoParaValorar?: PedidoParaValorar | null;
}) {
	const [errorNegocio, setErrorNegocio] = useState("");
	const negocio = useNegocio(setErrorNegocio);
	const whatsapp = negocio?.whatsapp.replace(/\D/g, "");
	return (
		<div className="text-tinta">
			<header className="mb-6 text-center">
				<CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-green-600" aria-hidden="true" />
				<h1 className="text-4xl font-extrabold tracking-titular">¡Gracias por tu visita!</h1>
				{mesa && <p className="mt-2 break-words text-tinta/70">{mesa}</p>}
				<p className="mt-3 font-semibold text-green-800">Pagado · {nombreMetodo(metodo)}</p>
				<p className="mt-2 text-sm text-tinta/70">Cobro registrado en la caja del local. La web no procesa pagos.</p>
			</header>
			<section className="overflow-hidden rounded-2xl border border-delicias/20" aria-label="Resumen de lo pagado">
				{pedidos.filter((pedido) => pedido.estado !== "cancelado").map((pedido, indice) => (
					<div key={`${pedido.numero_dia}-${indice}`} className="border-b border-delicias/10 p-4">
						<h2 className="mb-2 font-bold">Pedido #{pedido.numero_dia}</h2>
						<ul className="space-y-2">
							{pedido.items.map((articulo, posicion) => (
								<li key={posicion} className="flex justify-between gap-4">
									<span className="min-w-0 break-words">{articulo.cantidad} × {articulo.nombre}</span>
									<span className="shrink-0">{euros(articulo.cantidad * articulo.precio_unitario)}</span>
								</li>
							))}
						</ul>
					</div>
				))}
				<p className="flex justify-between gap-4 bg-merengue p-4 text-xl font-extrabold">
					<span>Total pagado</span><span className="text-delicias">{euros(total)}</span>
				</p>
			</section>
			{pedidoParaValorar && !pedidoParaValorar.opinada && (
				<section className="mt-8 rounded-2xl bg-merengue p-6" aria-labelledby="titulo-valorar">
					<h2 id="titulo-valorar" className="mb-1 text-2xl font-extrabold tracking-titular">¿Qué tal todo?</h2>
					<p className="mb-4 text-tinta/70">Tu opinión nos ayuda a mejorar y a que otros nos conozcan.</p>
					<FormularioOpinion key={pedidoParaValorar.codigo} pedidoCodigo={pedidoParaValorar.codigo} nombreInicial={pedidoParaValorar.nombre_cliente} />
				</section>
			)}
			<div className="mt-7 flex flex-wrap items-center justify-center gap-3">
				{negocio?.instagram && (
					<a href={`https://instagram.com/${negocio.instagram}`} target="_blank" rel="noopener noreferrer"
						aria-label="Las Delicias en Instagram" className="flex h-11 w-11 items-center justify-center rounded-full bg-merengue text-delicias hover:bg-delicias-claro">
						<IconoMarca marca="instagram" className="h-5 w-5" />
					</a>
				)}
				{whatsapp && (
					<a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer"
						aria-label="Escríbenos por WhatsApp" className="flex h-11 w-11 items-center justify-center rounded-full bg-merengue text-delicias hover:bg-delicias-claro">
						<IconoMarca marca="whatsapp" className="h-5 w-5" />
					</a>
				)}
			</div>
			{errorNegocio && <p role="alert" className="mt-3 text-center text-sm text-red-700">No se pudieron cargar las redes del negocio: {errorNegocio}</p>}
			<div className="mt-6 text-center">
				<Link to="/menu" className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-delicias px-6 py-3 font-bold text-white hover:bg-delicias-oscuro">Volver a la carta</Link>
			</div>
		</div>
	);
}
