import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, euros } from "../lib/api";
import { useCarrito } from "../lib/carrito";
import { CATEGORIAS, type Categoria, type Producto } from "../types/producto";
import BarraMesa from "./BarraMesa";

export default function Menu() {
	const [productos, setProductos] = useState<Producto[]>([]);
	const [cargando, setCargando] = useState(true);
	const [error, setError] = useState("");
	const [categoriaActiva, setCategoriaActiva] = useState<Categoria>("Desayunos");
	const carrito = useCarrito();

	useEffect(() => {
		api<Producto[]>("/productos")
			.then(setProductos)
			.catch((e) => setError(e.message))
			.finally(() => setCargando(false));
	}, []);

	const emojiDe = (cat: Categoria) => CATEGORIAS.find((c) => c.nombre === cat)?.emoji ?? "🍞";
	const visibles = productos.filter((p) => p.categoria === categoriaActiva);

	return (
		<div className={`min-h-screen bg-white px-4 py-8 font-sans text-gray-800 ${carrito.unidades > 0 ? "pb-40" : "pb-8"}`}>
			<h1 className="text-4xl font-bold text-center mb-2 text-delicias">Nuestra carta</h1>
			<p className="text-center text-gray-500 mb-8">
				{carrito.mesa ? `Pide desde la mesa ${carrito.mesa} y te lo llevamos` : "Elige, encarga y recoge sin esperar"}
			</p>

			{carrito.mesa && carrito.mesaToken && <BarraMesa mesa={carrito.mesa} token={carrito.mesaToken} />}

			<div className="flex flex-wrap justify-center gap-3 mb-8">
				{CATEGORIAS.map((cat) => (
					<button
						key={cat.nombre}
						onClick={() => setCategoriaActiva(cat.nombre)}
						className={`px-5 py-2 rounded-full font-semibold text-lg shadow transition-all flex items-center gap-2 border-2 ${
							categoriaActiva === cat.nombre
								? "bg-delicias text-white border-delicias scale-105"
								: "bg-white border-delicias-claro text-delicias hover:bg-delicias-claro"
						}`}
					>
						<span className="text-2xl">{cat.emoji}</span>
						{cat.nombre}
					</button>
				))}
			</div>

			{cargando && <p className="text-center text-gray-500">Cargando la carta…</p>}
			{error && <p className="text-center text-red-600">{error}</p>}

			<div className="max-w-6xl mx-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
				{visibles.map((p) => {
					const cantidad = carrito.cantidadDe(p.id);
					return (
						<article
							key={p.id}
							className={`border rounded-xl p-4 shadow-sm bg-white flex flex-col transition ${
								cantidad > 0 ? "ring-2 ring-delicias" : ""
							} ${p.disponible ? "" : "opacity-60"}`}
						>
							{p.imagen_url ? (
								<img src={p.imagen_url} alt={p.nombre} className="w-full h-36 object-cover rounded-lg mb-3" loading="lazy" />
							) : (
								<div className="w-full h-36 rounded-lg mb-3 bg-delicias-claro flex items-center justify-center text-5xl">
									{emojiDe(p.categoria)}
								</div>
							)}
							<div className="flex items-start justify-between gap-2">
								<h3 className="text-lg font-bold">{p.nombre}</h3>
								<span className="text-lg font-semibold text-delicias whitespace-nowrap">{euros(p.precio)}</span>
							</div>
							<p className="text-sm text-gray-600 flex-1">{p.descripcion}</p>
							<div className="flex flex-wrap gap-1 mt-2 text-xs">
								{p.disponible && p.quedan != null && (
									<span className="px-2 py-0.5 rounded-full bg-delicias-claro text-delicias font-semibold">¡Últimas {p.quedan}!</span>
								)}
								{p.sin_gluten && <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800">Sin gluten</span>}
								{p.alergenos.map((a) => (
									<span key={a} className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">{a}</span>
								))}
							</div>

							<div className="mt-3">
								{!p.disponible ? (
									<span className="block text-center py-2 rounded-lg bg-gray-100 text-gray-500 font-semibold">Agotado</span>
								) : cantidad === 0 ? (
									<button
										onClick={() => carrito.cambiar(p, 1)}
										className="w-full py-2 rounded-lg bg-delicias text-white font-bold hover:bg-delicias-oscuro transition"
									>
										Añadir
									</button>
								) : (
									<div className="flex items-center justify-between rounded-lg bg-delicias-claro">
										<button onClick={() => carrito.cambiar(p, -1)} className="px-4 py-2 text-xl font-bold text-delicias" aria-label={`Quitar un ${p.nombre}`}>−</button>
										<span className="font-bold text-delicias">{cantidad}</span>
										<button onClick={() => carrito.cambiar(p, 1)} className="px-4 py-2 text-xl font-bold text-delicias" aria-label={`Añadir otro ${p.nombre}`}>+</button>
									</div>
								)}
							</div>
						</article>
					);
				})}
			</div>

			{carrito.unidades > 0 && (
				<div className="fixed bottom-4 inset-x-4 z-40 flex justify-center">
					<Link
						to="/pedido"
						className="w-full max-w-md flex items-center justify-between gap-4 bg-delicias text-white px-6 py-4 rounded-2xl shadow-xl hover:bg-delicias-oscuro transition"
					>
						<span className="font-semibold">
							{carrito.unidades} {carrito.unidades === 1 ? "producto" : "productos"} · {euros(carrito.total)}
						</span>
						<span className="font-bold">Ver pedido →</span>
					</Link>
				</div>
			)}
		</div>
	);
}
