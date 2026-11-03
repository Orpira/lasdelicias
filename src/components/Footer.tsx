import IconoMarca from "./IconoMarca";
import { enlaceMapa, telefonoLegible, useNegocio } from "../lib/negocio";

export default function Footer() {
	const negocio = useNegocio();
	const whatsapp = negocio?.whatsapp.replace(/\D/g, "");

	return (
		<footer className="bg-delicias text-white">
			<div className="max-w-6xl mx-auto px-5 py-10 grid gap-8 sm:grid-cols-[auto_1fr_auto] sm:items-center">
				<img src="/logo-las-delicias.webp" alt="Cafetería ~ Panadería Las Delicias" className="w-40 rounded-lg" />

				{negocio && (
					<div className="text-white/85 leading-relaxed">
						<a href={enlaceMapa(negocio.direccion)} target="_blank" rel="noopener noreferrer" className="block hover:text-white">
							{negocio.direccion}
						</a>
						<a href={`tel:${negocio.telefono}`} className="block hover:text-white">
							{telefonoLegible(negocio.telefono)}
						</a>
					</div>
				)}

				{negocio && (
					<div className="flex gap-3">
						{whatsapp && (
							<a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer"
								aria-label="Escríbenos por WhatsApp" title="WhatsApp"
								className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
								<IconoMarca marca="whatsapp" className="w-5 h-5" />
							</a>
						)}
						{negocio.instagram && (
							<a href={`https://instagram.com/${negocio.instagram}`} target="_blank" rel="noopener noreferrer"
								aria-label="Las Delicias en Instagram" title="Instagram"
								className="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
								<IconoMarca marca="instagram" className="w-5 h-5" />
							</a>
						)}
					</div>
				)}
			</div>
			<div className="border-t border-white/15">
				<div className="max-w-6xl mx-auto px-5 py-4 flex flex-wrap justify-between gap-2 text-sm text-white/60">
					<span>© {new Date().getFullYear()} {negocio?.nombre ?? "Las Delicias"}</span>
					{/* En otra pestaña: el panel queda abierto aparte y la web sigue en esta */}
					<a href="/admin" target="_blank" rel="noopener" className="hover:text-white">Acceso del personal</a>
				</div>
			</div>
		</footer>
	);
}
