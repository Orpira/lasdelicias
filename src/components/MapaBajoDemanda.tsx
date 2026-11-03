import { useState } from "react";
import { MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { enlaceMapa } from "../lib/negocio";

export default function MapaBajoDemanda({ direccion }: { direccion: string }) {
	const [visible, setVisible] = useState(false);

	return (
		<div className="relative w-full h-80 md:h-auto md:min-h-[20rem] rounded-2xl overflow-hidden bg-merengue">
			{visible ? (
				<iframe
					src={`https://maps.google.com/maps?q=${encodeURIComponent(`Las Delicias, ${direccion}`)}&output=embed`}
					className="absolute inset-0 w-full h-full border-0"
					title={`Mapa de Las Delicias en ${direccion}`}
					loading="lazy"
					referrerPolicy="no-referrer"
				/>
			) : (
				<div className="h-full flex flex-col items-center justify-center gap-3 p-5 text-center text-tinta">
					<MapPin className="w-8 h-8 shrink-0 text-delicias" aria-hidden="true" />
					<p className="font-semibold line-clamp-2" title={direccion}>{direccion}</p>
					<p className="max-w-sm text-sm text-tinta/70">
						Al cargar el mapa, Google puede instalar cookies. Más información en la{" "}
						<Link to="/cookies" className="font-semibold text-delicias underline underline-offset-4">política de cookies</Link>.
					</p>
					<div className="flex flex-wrap items-center justify-center gap-4">
						<button type="button" onClick={() => setVisible(true)}
							className="bg-delicias text-white font-bold px-6 py-3 rounded-xl hover:bg-delicias-oscuro transition-colors">
							Ver mapa
						</button>
						<a href={enlaceMapa(direccion)} target="_blank" rel="noopener noreferrer"
							className="font-bold text-delicias underline underline-offset-4 hover:text-delicias-oscuro">
							Cómo llegar
						</a>
					</div>
				</div>
			)}
		</div>
	);
}
