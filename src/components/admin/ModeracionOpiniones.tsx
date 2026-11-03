// Moderación de opiniones: nada se publica sin que alguien de administración lo apruebe
import { useCallback, useEffect, useState } from "react";
import { BadgeCheck } from "lucide-react";
import { api } from "../../lib/api";
import { Estrellas } from "../Opiniones";

type Estado = "pendiente" | "publicada" | "oculta";

interface OpinionPanel {
	id: string;
	nombre: string;
	puntuacion: number;
	comentario: string;
	verificada: boolean;
	estado: Estado;
	pedido_codigo: string | null;
	created_at: string;
}

const FILTROS: { id: Estado; texto: string }[] = [
	{ id: "pendiente", texto: "Por revisar" },
	{ id: "publicada", texto: "Publicadas" },
	{ id: "oculta", texto: "Ocultas" },
];

export default function ModeracionOpiniones() {
	const [filtro, setFiltro] = useState<Estado>("pendiente");
	const [opiniones, setOpiniones] = useState<OpinionPanel[]>([]);
	const [cuentas, setCuentas] = useState<Partial<Record<Estado, number>>>({});
	const [error, setError] = useState("");

	const cargar = useCallback(() => {
		api<{ opiniones: OpinionPanel[]; cuentas: Partial<Record<Estado, number>> }>(`/admin/opiniones?estado=${filtro}`, { auth: true })
			.then((r) => {
				setOpiniones(r.opiniones);
				setCuentas(r.cuentas);
			})
			.catch((e) => setError(e.message));
	}, [filtro]);
	useEffect(cargar, [cargar]);

	async function cambiar(o: OpinionPanel, estado: "publicada" | "oculta") {
		setOpiniones((prev) => prev.filter((x) => x.id !== o.id));
		try {
			await api(`/admin/opiniones/${o.id}`, { metodo: "PATCH", cuerpo: { estado }, auth: true });
		} catch (e) {
			setError(e instanceof Error ? e.message : "No se pudo actualizar");
		}
		cargar();
	}

	return (
		<div className="max-w-4xl mx-auto p-4">
			<div className="flex flex-wrap items-center gap-2 mb-4">
				{FILTROS.map((f) => (
					<button key={f.id} onClick={() => setFiltro(f.id)}
						className={`px-4 py-2 rounded-full font-semibold ${filtro === f.id ? "bg-delicias text-white" : "bg-white"}`}>
						{f.texto} <span className="opacity-70 tabular-nums">{cuentas[f.id] ?? 0}</span>
					</button>
				))}
				<button onClick={cargar} className="ml-auto text-sm px-3 py-2 rounded-lg bg-white">Actualizar</button>
			</div>
			{error && <p className="mb-3 text-red-600" role="alert">{error}</p>}

			{opiniones.length === 0 ? (
				<p className="p-8 text-center text-gray-500 bg-white rounded-2xl">
					{filtro === "pendiente" ? "No hay opiniones por revisar." : "No hay opiniones en esta lista."}
				</p>
			) : (
				<ul className="flex flex-col gap-3">
					{opiniones.map((o) => (
						<li key={o.id} className="bg-white rounded-2xl p-5 shadow-sm">
							<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
								<Estrellas valor={o.puntuacion} />
								<span className="font-bold">{o.nombre}</span>
								{o.verificada && (
									<span className="inline-flex items-center gap-1 text-sm text-green-700 font-semibold">
										<BadgeCheck className="w-4 h-4" aria-hidden="true" /> Pedido verificado
									</span>
								)}
								<span className="ml-auto text-sm text-gray-500">
									{new Date(o.created_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" })}
								</span>
							</div>
							<p className="mt-2 text-lg">{o.comentario || <span className="text-gray-400">Sin comentario</span>}</p>
							<div className="mt-3 flex gap-2">
								{o.estado !== "publicada" && (
									<button onClick={() => cambiar(o, "publicada")} className="px-4 py-2 rounded-lg bg-delicias text-white font-bold">
										Publicar
									</button>
								)}
								{o.estado !== "oculta" && (
									<button onClick={() => cambiar(o, "oculta")} className="px-4 py-2 rounded-lg bg-gray-100 font-semibold">
										{o.estado === "publicada" ? "Retirar" : "No publicar"}
									</button>
								)}
							</div>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
