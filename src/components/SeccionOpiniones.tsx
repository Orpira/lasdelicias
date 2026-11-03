// Opiniones de clientes en la portada: media, varias al azar y formulario para opinar
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { Estrellas, FormularioOpinion, TarjetaOpinion, type Opinion } from "./Opiniones";

interface Resumen {
	total: number;
	media: number | null;
	opiniones: Opinion[];
}

export default function SeccionOpiniones({ resenasExternas }: { resenasExternas: { sitio: string; url: string }[] }) {
	const [datos, setDatos] = useState<Resumen | null>(null);
	const [formulario, setFormulario] = useState(false);

	const cargar = useCallback(() => {
		api<Resumen>("/opiniones?n=3").then(setDatos).catch(() => setDatos({ total: 0, media: null, opiniones: [] }));
	}, []);
	useEffect(cargar, [cargar]);

	const hay = (datos?.total ?? 0) > 0;

	return (
		<section className="bg-merengue" aria-labelledby="titulo-opiniones">
			<div className="max-w-6xl mx-auto px-5 py-16">
				<div className="flex flex-wrap items-end justify-between gap-6 mb-8">
					<div>
						<h2 id="titulo-opiniones" className="text-3xl sm:text-4xl font-extrabold tracking-titular">Lo que dicen de nosotros</h2>
						{hay && datos?.media != null && (
							<p className="mt-2 flex items-center gap-2 text-lg">
								<span className="font-extrabold text-delicias tabular-nums">{String(datos.media).replace(".", ",")}</span>
								<Estrellas valor={datos.media} className="w-5 h-5" />
								<span className="text-tinta/65">{datos.total} {datos.total === 1 ? "opinión" : "opiniones"}</span>
							</p>
						)}
					</div>
					<div className="flex flex-wrap gap-3">
						<button onClick={() => setFormulario((f) => !f)} aria-expanded={formulario}
							className="bg-delicias text-white font-bold px-5 py-3 rounded-xl hover:bg-delicias-oscuro transition-colors">
							{formulario ? "Cerrar" : "Deja tu opinión"}
						</button>
						{resenasExternas.map((r) => (
							<a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer"
								className="inline-flex items-center gap-2 font-bold px-5 py-3 rounded-xl border-2 border-delicias/25 text-delicias hover:border-delicias bg-white transition-colors">
								Danos tu opinión en {r.sitio} <ExternalLink className="w-4 h-4" aria-hidden="true" />
							</a>
						))}
					</div>
				</div>

				{formulario && (
					<div className="mb-8 max-w-xl p-6 rounded-2xl bg-white border border-delicias/15">
						<FormularioOpinion />
					</div>
				)}

				{datos === null ? (
					<div className="grid md:grid-cols-3 gap-5">
						{[0, 1, 2].map((i) => <div key={i} className="h-44 rounded-2xl bg-white/70 animate-pulse" />)}
					</div>
				) : hay ? (
					<>
						<div className="grid md:grid-cols-3 gap-5">
							{datos.opiniones.map((o) => <TarjetaOpinion key={o.id} opinion={o} />)}
						</div>
						{datos.total > 3 && (
							<button onClick={cargar} className="mt-6 inline-flex items-center gap-2 font-bold text-delicias hover:text-delicias-profundo">
								<RefreshCw className="w-4 h-4" aria-hidden="true" /> Ver otras opiniones
							</button>
						)}
					</>
				) : (
					!formulario && (
						<p className="text-lg text-tinta/70">
							Todavía no hay opiniones publicadas. Si ya nos conoces, ¿nos dejas la primera?
						</p>
					)
				)}
			</div>
		</section>
	);
}
