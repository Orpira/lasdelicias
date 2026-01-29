const features = [
	{
		title: "Desayunos memorables",
		desc: "Pan fresco, café aromático y arepas deliciosas. La amabilidad del personal hará tu experiencia aún más especial.",
		icon: "🥐",
	},
	{
		title: "Variedad y calidad",
		desc: "Dulces, palmeras espectaculares (Ferrero Roche, Huesito, Nutella) y opciones sin gluten.",
		icon: "🍰",
	},
	{
		title: "Servicio impecable",
		desc: "Ambiente distendido y trato cercano. Siéntete como en casa, ya sea que disfrutes allí mismo o lleves tus dulces a casa.",
		icon: "🤝",
	},
];

export default function Home() {
	return (
		<main className="font-sans bg-gradient-radial from-yellow-100 via-yellow-300 to-pink-100 text-[#3e2723] min-h-screen">
			{/* Hero Section */}
			<section
				className="flex flex-col items-center justify-center px-4 py-12 sm:py-20 relative overflow-hidden"
				style={{
					background:
						"radial-gradient(circle at 50% 30%, #fffbe6 60%, #ffe082 80%, #f8bbd0 100%)",
				}}
			>
				<div className="absolute inset-0 pointer-events-none z-0">
					{/* Círculo cálido principal */}
					<div className="w-[32rem] h-[32rem] bg-yellow-300 rounded-full blur-3xl opacity-50 absolute -top-40 -left-40 animate-fade-slow"></div>
					{/* Círculo rosado decorativo */}
					<div className="w-96 h-96 bg-pink-200 rounded-full blur-2xl opacity-30 absolute -bottom-32 -right-32 animate-fade-slow"></div>
					{/* SVG decorativo de trigo */}
					<svg
						className="absolute left-8 top-8 opacity-20 w-32 h-32"
						viewBox="0 0 64 64"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							d="M32 8C32 8 36 24 32 40C28 56 32 56 32 56"
							stroke="#eab308"
							strokeWidth="3"
							strokeLinecap="round"
						/>
						<path
							d="M32 16C32 16 34 24 32 32C30 40 32 40 32 40"
							stroke="#f59e42"
							strokeWidth="2"
							strokeLinecap="round"
						/>
					</svg>
				</div>

				<span className="mt-0 font-pacifico text-2xl sm:text-xl font-extrabold text-center z-10 drop-shadow-lg text-red-800">
					Cafetería ~ Panadería <br />
				</span>
				<span className="mt-0 font-pacifico text-6xl sm:text-4xl font-extrabold text-center z-10 drop-shadow-lg text-red-800">
					Las Delicias
				</span>

				<div className="relative z-10 mt-8 mb-6">
					<img
						src="/portada.webp"
						alt="Panadería Las Delicias"
						className="w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl rounded-3xl shadow-xl object-cover border-4 border-yellow-400 aspect-video"
						style={{ height: "auto" }}
					/>
					{/* 	<div className="absolute top-2 left-2 bg-white/80 text-pink-600 px-3 py-1 rounded-full text-xs font-bold shadow">
						¡Nuevo!
					</div> */}
				</div>
				<p className="max-w-xl mx-auto text-lg sm:text-xl mt-5 mb-2 text-center z-10">
					Situada en Calle Ayala, 28, Las Delicias es reconocida por su ambiente
					acogedor, productos frescos y atención al cliente excepcional. ¡El
					lugar perfecto para desayunar o merendar en el centro de Málaga!
				</p>
				<a
					href="tel:633272668"
					className="inline-block bg-pink-600 text-white px-8 py-3 rounded-xl font-bold no-underline mt-6 shadow-lg hover:bg-pink-700 transition text-lg z-10"
				>
					Llamar: 633 27 26 68
				</a>
			</section>

			{/* Features Section */}
			<section className="flex flex-wrap justify-center gap-8 px-4 pt-8 pb-12">
				{features.map((f) => (
					<div
						key={f.title}
						className="flex flex-col items-center justify-center bg-white rounded-2xl shadow-lg p-8 max-w-xs w-full hover:scale-105 transition-transform border border-pink-100"
					>
						<div className="text-5xl mb-4 animate-bounce">{f.icon}</div>
						<h3 className="text-pink-600 text-xl sm:text-2xl font-bold mb-2 text-center">
							{f.title}
						</h3>
						<p className="text-center text-base sm:text-lg text-gray-700">
							{f.desc}
						</p>
					</div>
				))}
			</section>

			{/* Call to Action & Map */}
			<section className="text-center px-4 py-10 sm:py-16 bg-gradient-to-r from-yellow-100 via-pink-100 to-white">
				<h3 className="mt-8 text-3xl sm:text-4xl font-bold text-pink-600 drop-shadow mb-4">
					¡Un lugar para repetir!
				</h3>
				<p className="max-w-lg mx-auto text-lg sm:text-xl mt-4 mb-6 text-gray-700">
					Quienes han visitado Las Delicias siempre recomiendan volver. Si estás
					en Málaga, haz una parada y disfruta de todo lo que tenemos para
					ofrecerte.
				</p>
				<div className="mt-6 flex justify-center">
					<iframe
						src="https://maps.google.com/maps?q=Panader%C3%ADa%20Confiter%C3%ADa%20Obrador%20Las%20Delicias%2C%20Calle%20Ayala%2C%2028%2C%20Distrito%20Centro%2C%2029002%20M%C3%A1laga&amp;output=embed"
						width="100%"
						height="300"
						className="rounded-2xl border-0 max-w-xl w-full shadow-lg"
						allowFullScreen
						loading="lazy"
						title="Mapa Las Delicias Málaga"
					></iframe>
				</div>
			</section>
		</main>
	);
}
