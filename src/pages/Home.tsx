import { Link } from "react-router-dom";
import { DIAS, telefonoLegible, useNegocio } from "../lib/negocio";
import { useCarrito } from "../lib/carrito";

const destacados = [
	{ img: "/demo/comida-casera.webp", titulo: "Comida casera para llevar", texto: "El menú de hoy: albóndigas, guisos, arroces, ensaladilla… recién hecho cada día." },
	{ img: "/demo/vitrina-dulces.webp", titulo: "Pastelería del obrador", texto: "Palmeras rellenas, suizos, éclairs, tartas de queso, de manzana y por encargo." },
	{ img: "/demo/cafe-con-leche.webp", titulo: "Café y desayunos", texto: "Café, tostadas, arepas y bollería recién hecha desde primera hora." },
	{ img: "/demo/bunuelos-natilla.webp", titulo: "Sabores de casa", texto: "Natilla con buñuelos y otras recetas tradicionales en temporada." },
];

const comoFunciona = [
	{ icono: "📱", titulo: "Pide desde el móvil", texto: "Escanea el QR de tu mesa o entra en la carta y elige." },
	{ icono: "👩‍🍳", titulo: "Lo preparamos", texto: "Tu pedido llega al momento a la barra, sin colas." },
	{ icono: "🔔", titulo: "Te avisamos", texto: "Sigue el estado en directo y recoge cuando esté listo." },
];

export default function Home() {
	const negocio = useNegocio();
	const { mesa } = useCarrito();
	const whatsapp = negocio?.whatsapp.replace(/\D/g, "");

	return (
		<main className="font-sans text-[#3e2723] bg-[#fffaf5]">
			{/* Portada */}
			<section className="relative overflow-hidden">
				<div className="absolute inset-0 bg-gradient-to-b from-delicias-claro via-[#fffaf5] to-[#fffaf5]" />
				<div className="relative max-w-6xl mx-auto px-4 py-10 sm:py-16 grid md:grid-cols-2 gap-10 items-center">
					<div className="text-center md:text-left">
						<img src="/logo-las-delicias.webp" alt="Cafetería ~ Panadería Las Delicias"
							className="w-72 sm:w-80 mx-auto md:mx-0 rounded-2xl shadow-lg" />
						<p className="text-lg sm:text-xl mt-6 text-gray-700">
							{negocio?.descripcion ?? "Panadería, pastelería, cafetería y obrador artesano en el centro de Málaga."}
						</p>
						<div className="flex flex-wrap gap-3 mt-8 justify-center md:justify-start">
							<Link to="/menu" className="bg-delicias text-white px-7 py-3 rounded-xl font-bold shadow-lg hover:bg-delicias-oscuro transition text-lg">
								{mesa ? `Pedir en la mesa ${mesa}` : "Pedir ahora"}
							</Link>
							{negocio && (
								<a href={`tel:${negocio.telefono}`} className="bg-white text-delicias border-2 border-delicias px-7 py-3 rounded-xl font-bold hover:bg-delicias-claro transition text-lg">
									Llamar · {telefonoLegible(negocio.telefono)}
								</a>
							)}
						</div>
					</div>
					<div className="grid grid-cols-2 gap-3">
						<img src="/demo/local.webp" alt="Interior del local" className="row-span-2 w-full h-full object-cover rounded-2xl shadow-md" />
						<img src="/demo/cafe-y-bizcocho.webp" alt="Café con bizcocho casero" className="w-full aspect-square object-cover rounded-2xl shadow-md" />
						<img src="/demo/vitrina.webp" alt="Vitrina de tartas" className="w-full aspect-square object-cover rounded-2xl shadow-md" />
					</div>
				</div>
			</section>

			{/* Cómo funciona */}
			<section className="max-w-6xl mx-auto px-4 py-12">
				<h2 className="text-3xl font-bold text-center text-delicias mb-8">Pide sin esperar</h2>
				<div className="grid sm:grid-cols-3 gap-6">
					{comoFunciona.map((p) => (
						<div key={p.titulo} className="bg-white rounded-2xl shadow p-6 text-center border border-delicias-claro">
							<div className="text-4xl mb-3">{p.icono}</div>
							<h3 className="font-bold text-lg mb-1">{p.titulo}</h3>
							<p className="text-gray-600">{p.texto}</p>
						</div>
					))}
				</div>
			</section>

			{/* Destacados */}
			<section className="max-w-6xl mx-auto px-4 pb-12">
				<h2 className="text-3xl font-bold text-center text-delicias mb-8">Del obrador a tu mesa</h2>
				<div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
					{destacados.map((d) => (
						<article key={d.titulo} className="bg-white rounded-2xl shadow overflow-hidden">
							<img src={d.img} alt={d.titulo} className="w-full h-48 object-cover" loading="lazy" />
							<div className="p-5">
								<h3 className="font-bold text-lg text-delicias">{d.titulo}</h3>
								<p className="text-gray-600">{d.texto}</p>
							</div>
						</article>
					))}
				</div>
			</section>

			{/* Información y contacto */}
			<section className="bg-white border-t border-delicias-claro">
				<div className="max-w-6xl mx-auto px-4 py-12 grid md:grid-cols-2 gap-10">
					<div>
						<h2 className="text-3xl font-bold text-delicias mb-4">Visítanos</h2>
						{negocio ? (
							<>
								<p className="text-lg font-semibold">{negocio.direccion}</p>
								{negocio.referencia && <p className="text-gray-600 mb-4">{negocio.referencia}</p>}
								<div className="flex flex-wrap gap-2 mb-6">
									{negocio.servicios.map((s) => (
										<span key={s} className="px-3 py-1 rounded-full bg-delicias-claro text-delicias text-sm font-semibold">{s}</span>
									))}
								</div>
								<h3 className="font-bold mb-2">Horario</h3>
								<table className="text-sm mb-6">
									<tbody>
										{DIAS.map((d) => (
											<tr key={d.clave}>
												<td className="pr-6 py-0.5">{d.nombre}</td>
												<td className={negocio.horario[d.clave] ? "font-semibold" : "text-gray-400"}>
													{negocio.horario[d.clave] ?? "Consultar"}
												</td>
											</tr>
										))}
									</tbody>
								</table>
								<div className="flex flex-wrap gap-3">
									{whatsapp && (
										<a href={`https://wa.me/${whatsapp}?text=${encodeURIComponent("¡Hola! Quiero hacer un pedido a domicilio:")}`}
											target="_blank" rel="noopener noreferrer"
											className="bg-[#25D366] text-white px-5 py-2.5 rounded-xl font-bold hover:brightness-95">
											Pedido a domicilio por WhatsApp
										</a>
									)}
									{negocio.instagram && (
										<a href={`https://instagram.com/${negocio.instagram}`} target="_blank" rel="noopener noreferrer"
											className="bg-gradient-to-r from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white px-5 py-2.5 rounded-xl font-bold hover:brightness-95">
											@{negocio.instagram}
										</a>
									)}
								</div>
							</>
						) : (
							<p className="text-gray-500">Cargando información…</p>
						)}
					</div>
					<iframe
						src="https://maps.google.com/maps?q=Calle%20Ayala%2C%2028%2C%2029002%20M%C3%A1laga&output=embed"
						className="w-full h-80 md:h-full min-h-72 rounded-2xl border-0 shadow"
						loading="lazy"
						title="Mapa de Las Delicias en Málaga"
					/>
				</div>
			</section>
		</main>
	);
}
