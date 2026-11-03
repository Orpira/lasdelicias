import { Link } from "react-router-dom";
import IconoMarca from "../components/IconoMarca";
import SeccionOpiniones from "../components/SeccionOpiniones";
import { useCarrito } from "../lib/carrito";
import { DIAS, enlaceMapa, estadoHoy, telefonoLegible, useNegocio } from "../lib/negocio";
import { useProductos } from "../lib/productos";
import { euros } from "../lib/api";

const PASOS = [
	{ titulo: "Elige", texto: "Escanea el QR de tu mesa o abre la carta desde casa." },
	{ titulo: "Pide", texto: "Para tomar aquí o para recoger a la hora que te venga bien." },
	{ titulo: "Te avisamos", texto: "Sigues tu pedido en directo y sabes cuándo está listo." },
];

export default function Home() {
	const negocio = useNegocio();
	const { productos } = useProductos();
	const carrito = useCarrito();

	const estado = negocio ? estadoHoy(negocio.horario) : null;
	const vitrina = (productos ?? []).filter((p) => p.disponible && p.imagen_url && p.categoria === "Pastelería");
	const menuHoy = (productos ?? []).filter((p) => p.disponible && p.categoria === "Comida casera");
	const whatsapp = negocio?.whatsapp.replace(/\D/g, "");

	return (
		<main className="text-tinta">
			{/* Portada: el rótulo granate y la vitrina */}
			<section className="bg-delicias text-white overflow-hidden">
				<div className="max-w-6xl mx-auto px-5 pt-10 pb-14 md:py-20 grid md:grid-cols-[1.05fr_1fr] gap-10 md:gap-14 items-center">
					<div>
						{estado && (
							<p className="inline-flex items-center gap-2 text-sm font-semibold bg-white/10 rounded-full px-3 py-1 mb-6">
								<span className={`w-2 h-2 rounded-full ${estado.abierto ? "bg-[#7CF0A6]" : "bg-white/50"}`} />
								{estado.texto}
							</p>
						)}
						<h1 className="text-[2.6rem] leading-[1.02] sm:text-6xl font-extrabold tracking-titular">
							Pan, pasteles y comida casera en Calle Ayala
						</h1>
						<p className="mt-5 text-lg sm:text-xl text-white/85 max-w-[34rem]">
							Pide desde el móvil, en la mesa o para recoger, y te avisamos cuando esté listo. A cinco minutos andando de María Zambrano.
						</p>
						<div className="mt-8 flex flex-wrap gap-3">
							<Link to="/menu"
								className="bg-white text-delicias-profundo font-bold text-lg px-6 py-3.5 rounded-xl hover:bg-merengue transition-colors">
								{carrito.mesa ? `Pedir en la mesa ${carrito.mesa}` : "Ver la carta y pedir"}
							</Link>
							{negocio && (
								<a href={enlaceMapa(negocio.direccion)} target="_blank" rel="noopener noreferrer"
									className="font-bold text-lg px-6 py-3.5 rounded-xl border-2 border-white/40 hover:border-white transition-colors">
									Cómo llegar
								</a>
							)}
						</div>
					</div>

					<img src="/demo/vitrina-dulces.webp" alt="La vitrina de Las Delicias con suizos, pasteles de naranja y tartas"
						className="w-full aspect-[4/3] object-cover rounded-2xl" />
				</div>
			</section>

			{/* Hoy en la vitrina: productos reales con su precio */}
			<section className="max-w-6xl mx-auto px-5 pt-16 pb-12">
				<div className="flex items-end justify-between gap-4 mb-6">
					<div>
						<h2 className="text-3xl sm:text-4xl font-extrabold tracking-titular">Hoy en la vitrina</h2>
						<p className="text-tinta/70 mt-1">Hecho en nuestro obrador. Añádelo y lo tendrás listo al llegar.</p>
					</div>
					<Link to="/menu?categoria=Pastelería" className="hidden sm:inline font-bold text-delicias hover:text-delicias-profundo whitespace-nowrap">
						Toda la pastelería
					</Link>
				</div>
				<div className="flex gap-5 overflow-x-auto sin-scrollbar snap-x pb-4 -mx-5 px-5">
					{productos === null &&
						Array.from({ length: 4 }, (_, i) => <div key={i} className="shrink-0 w-56 h-72 rounded-2xl bg-merengue animate-pulse" />)}
					{vitrina.map((p) => {
						const cantidad = carrito.cantidadDe(p.id);
						return (
							<article key={p.id} className="snap-start shrink-0 w-56">
								<div className="relative">
									<img src={p.imagen_url} alt={p.nombre} loading="lazy" className="w-56 h-56 object-cover rounded-2xl" />
									<button
										onClick={() => carrito.cambiar(p, 1)}
										aria-label={`Añadir ${p.nombre}`}
										className="absolute bottom-3 right-3 h-11 min-w-11 px-3 rounded-full bg-white text-delicias font-extrabold text-lg shadow-md hover:bg-merengue">
										{cantidad > 0 ? `${cantidad} en tu pedido` : "+"}
									</button>
								</div>
								<div className="mt-3 flex items-baseline justify-between gap-3">
									<h3 className="font-bold leading-snug">{p.nombre}</h3>
									<span className="font-bold text-delicias tabular-nums whitespace-nowrap">{euros(p.precio)}</span>
								</div>
								<p className="text-sm text-tinta/65 leading-snug">{p.descripcion}</p>
							</article>
						);
					})}
				</div>
			</section>

			{/* Comida casera para llevar */}
			<section className="bg-merengue">
				<div className="max-w-6xl mx-auto px-5 py-16 grid md:grid-cols-2 gap-10 items-center">
					<img src="/demo/comida-casera.webp" alt="Albóndigas, ensaladilla, arroz y tortitas en la vitrina de comida casera"
						className="w-full aspect-[5/4] object-cover rounded-2xl order-last md:order-first" loading="lazy" />
					<div>
						<h2 className="text-3xl sm:text-4xl font-extrabold tracking-titular">Comida casera para llevar</h2>
						<p className="mt-3 text-lg text-tinta/75 max-w-[32rem]">
							Cada día cocinamos guisos, albóndigas, arroces y ensaladilla. Encárgalo para la hora que quieras y recógelo sin hacer cola.
						</p>
						{menuHoy.length > 0 && (
							<ul className="mt-6 divide-y divide-delicias/15 border-y border-delicias/15">
								{menuHoy.slice(0, 6).map((p) => (
									<li key={p.id} className="flex items-baseline justify-between gap-4 py-2.5">
										<span className="font-semibold">{p.nombre}</span>
										<span className="font-bold text-delicias tabular-nums">{euros(p.precio)}</span>
									</li>
								))}
							</ul>
						)}
						<Link to="/menu?categoria=Comida casera"
							className="inline-block mt-7 bg-delicias text-white font-bold text-lg px-6 py-3.5 rounded-xl hover:bg-delicias-oscuro transition-colors">
							Encargar comida
						</Link>
					</div>
				</div>
			</section>

			{/* Cómo pedir: es una secuencia real, por eso numerada */}
			<section className="max-w-6xl mx-auto px-5 py-16">
				<h2 className="text-3xl sm:text-4xl font-extrabold tracking-titular mb-8">Pedir es así de fácil</h2>
				<ol className="grid sm:grid-cols-3 gap-8">
					{PASOS.map((p, i) => (
						<li key={p.titulo} className="flex gap-4">
							<span className="shrink-0 w-11 h-11 rounded-full border-2 border-delicias text-delicias font-extrabold text-lg flex items-center justify-center">
								{i + 1}
							</span>
							<div>
								<h3 className="font-bold text-lg">{p.titulo}</h3>
								<p className="text-tinta/70">{p.texto}</p>
							</div>
						</li>
					))}
				</ol>
			</section>

			{/* Sabores de casa y encargos */}
			<section className="max-w-6xl mx-auto px-5 pb-16">
				<div className="grid md:grid-cols-[1fr_1.2fr] rounded-2xl overflow-hidden bg-delicias-profundo text-white">
					<img src="/demo/bunuelos-natilla.webp" alt="Buñuelos con natilla" loading="lazy"
						className="w-full h-64 md:h-full object-cover" />
					<div className="p-8 sm:p-10 self-center">
						<h2 className="text-3xl font-extrabold tracking-titular">Arepas, buñuelos y tartas por encargo</h2>
						<p className="mt-3 text-white/80 text-lg max-w-[30rem]">
							Recetas de casa todo el año y especiales en fiestas. Para cumpleaños y celebraciones, encarga tu tarta con unos días de antelación.
						</p>
						{whatsapp && (
							<a href={`https://wa.me/${whatsapp}?text=${encodeURIComponent("¡Hola! Quiero encargar una tarta para el día ")}`}
								target="_blank" rel="noopener noreferrer"
								className="inline-block mt-6 bg-white text-delicias-profundo font-bold px-6 py-3.5 rounded-xl hover:bg-merengue transition-colors">
								Encargar por WhatsApp
							</a>
						)}
					</div>
				</div>
			</section>

			<SeccionOpiniones resenasExternas={negocio?.resenas_externas ?? []} />

			{/* Visítanos */}
			<section className="border-t border-delicias/10">
				<div className="max-w-6xl mx-auto px-5 py-16 grid md:grid-cols-2 gap-10">
					<div>
						<h2 className="text-3xl sm:text-4xl font-extrabold tracking-titular">Visítanos</h2>
						{negocio ? (
							<>
								<p className="mt-4 text-xl font-semibold">{negocio.direccion}</p>
								{negocio.referencia && <p className="text-tinta/70">{negocio.referencia}</p>}
								<p className="mt-4 text-tinta/75">{negocio.servicios.join(", ")}.</p>

								<table className="mt-6 text-sm w-full max-w-xs">
									<caption className="text-left font-bold text-base mb-2">Horario</caption>
									<tbody>
										{DIAS.map((d) => (
											<tr key={d.clave} className="border-b border-delicias/10 last:border-0">
												<td className="py-1.5">{d.nombre}</td>
												<td className={`py-1.5 text-right tabular-nums ${negocio.horario[d.clave] ? "font-semibold" : "text-tinta/50"}`}>
													{negocio.horario[d.clave] ?? "Consúltanos"}
												</td>
											</tr>
										))}
									</tbody>
								</table>

								<div className="mt-7 flex flex-wrap gap-3">
									<a href={`tel:${negocio.telefono}`}
										className="bg-delicias text-white font-bold px-5 py-3 rounded-xl hover:bg-delicias-oscuro transition-colors">
										Llamar al {telefonoLegible(negocio.telefono)}
									</a>
									{whatsapp && (
										<a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer"
											aria-label="Escríbenos por WhatsApp" title="WhatsApp"
											className="w-12 h-12 rounded-xl border-2 border-delicias/25 text-delicias hover:border-delicias flex items-center justify-center transition-colors">
											<IconoMarca marca="whatsapp" />
										</a>
									)}
									{negocio.instagram && (
										<a href={`https://instagram.com/${negocio.instagram}`} target="_blank" rel="noopener noreferrer"
											aria-label="Las Delicias en Instagram" title="Instagram"
											className="w-12 h-12 rounded-xl border-2 border-delicias/25 text-delicias hover:border-delicias flex items-center justify-center transition-colors">
											<IconoMarca marca="instagram" />
										</a>
									)}
								</div>
							</>
						) : (
							<p className="mt-4 text-tinta/60">Cargando información…</p>
						)}
					</div>
					<iframe
						src="https://maps.google.com/maps?q=Calle%20Ayala%2C%2028%2C%2029002%20M%C3%A1laga&output=embed"
						className="w-full min-h-80 rounded-2xl border-0"
						loading="lazy"
						title="Mapa de Las Delicias en Calle Ayala, 28, Málaga"
					/>
				</div>
			</section>
		</main>
	);
}
