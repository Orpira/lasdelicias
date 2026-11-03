import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Minus, Plus } from "lucide-react";
import { euros } from "../lib/api";
import { useCarrito } from "../lib/carrito";
import { useProductos } from "../lib/productos";
import { CATEGORIAS, type Categoria, type Producto } from "../types/producto";
import BarraMesa from "./BarraMesa";
import Etiqueta from "./Etiqueta";

const esCategoria = (c: string | null): c is Categoria => CATEGORIAS.some((x) => x.nombre === c);

export default function Menu() {
	const { productos, error } = useProductos();
	const [params, setParams] = useSearchParams();
	const carrito = useCarrito();
	const desdeUrl = params.get("categoria");
	const [categoria, setCategoriaEstado] = useState<Categoria>(esCategoria(desdeUrl) ? desdeUrl : "Desayunos");

	const setCategoria = (c: Categoria) => {
		setCategoriaEstado(c);
		setParams({ categoria: c }, { replace: true });
	};

	const barra = useRef<HTMLDivElement>(null);
	useEffect(() => {
		barra.current
			?.querySelector('[aria-selected="true"]')
			?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
	}, [categoria]);

	const visibles = useMemo(
		() => (productos ?? []).filter((p) => p.categoria === categoria),
		[productos, categoria],
	);

	return (
		<div className={`text-tinta ${carrito.unidades > 0 ? "pb-28" : "pb-12"}`}>
			<div className="bg-merengue">
				<div className="max-w-6xl mx-auto px-5 pt-10 pb-6">
					<h1 className="text-4xl sm:text-5xl font-extrabold tracking-titular">La carta</h1>
					<p className="mt-2 text-lg text-tinta/70">
						{carrito.mesa
							? `Pide desde la mesa ${carrito.mesa} y te lo llevamos.`
							: "Elige lo que te apetezca: para tomar aquí o para recoger sin esperar."}
					</p>
				</div>
			</div>

			{/* Categorías: fijas al hacer scroll */}
			<div className="sticky top-16 z-40 bg-white/95 backdrop-blur border-b border-delicias/10">
				<div ref={barra} className="max-w-6xl mx-auto px-5 flex gap-2 overflow-x-auto sin-scrollbar py-3" role="tablist" aria-label="Categorías">
					{CATEGORIAS.map((c) => (
						<button
							key={c.nombre}
							role="tab"
							aria-selected={categoria === c.nombre}
							onClick={() => setCategoria(c.nombre)}
							className={`shrink-0 px-4 py-2 rounded-full font-semibold transition-colors ${
								categoria === c.nombre ? "bg-delicias text-white" : "bg-merengue text-delicias-profundo hover:bg-delicias-claro"
							}`}
						>
							{c.nombre}
						</button>
					))}
				</div>
			</div>

			<div className="max-w-6xl mx-auto px-5 pt-6">
				{carrito.mesa && carrito.mesaToken && <BarraMesa mesa={carrito.mesa} token={carrito.mesaToken} />}

				{error && (
					<p className="p-4 rounded-xl bg-red-50 text-red-700">No se ha podido cargar la carta. Comprueba tu conexión y recarga la página.</p>
				)}
				{productos === null && !error && (
					<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-2">
						{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-28 rounded-2xl bg-merengue animate-pulse" />)}
					</div>
				)}

				<ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8">
					{visibles.map((p, i) => (
						<FilaProducto key={p.id} producto={p} giro={i} />
					))}
				</ul>
			</div>

			{carrito.unidades > 0 && (
				<div className="fixed bottom-4 inset-x-4 z-40 flex justify-center">
					<Link
						to="/pedido"
						className="w-full max-w-md flex items-center justify-between gap-4 bg-delicias text-white px-6 py-4 rounded-2xl shadow-lg hover:bg-delicias-oscuro transition-colors"
					>
						<span className="font-semibold">
							{carrito.unidades} {carrito.unidades === 1 ? "producto" : "productos"} · {euros(carrito.total)}
						</span>
						<span className="font-bold">Revisar pedido</span>
					</Link>
				</div>
			)}
		</div>
	);
}

function FilaProducto({ producto: p, giro }: { producto: Producto; giro: number }) {
	const carrito = useCarrito();
	const cantidad = carrito.cantidadDe(p.id);

	return (
		<li className={`flex gap-4 py-5 border-b border-delicias/10 ${p.disponible ? "" : "opacity-55"}`}>
			{/* Sin foto: fila de texto limpia (la foto se sube desde el panel) */}
			{p.imagen_url && (
				<div className="relative shrink-0">
					<img src={p.imagen_url} alt="" loading="lazy" className="w-28 h-28 object-cover rounded-xl" />
					{p.disponible && <Etiqueta precio={p.precio} giro={giro} className="absolute -bottom-2 -right-2 text-lg" />}
				</div>
			)}

			<div className="flex-1 min-w-0 flex flex-col">
				<h3 className="font-bold leading-snug">{p.nombre}</h3>
				<p className="text-sm text-tinta/65 leading-snug mt-0.5">{p.descripcion}</p>
				<div className="flex flex-wrap gap-1.5 mt-1.5 text-xs font-semibold">
					{p.disponible && p.quedan != null && <span className="text-delicias">¡Últimas {p.quedan}!</span>}
					{p.sin_gluten && <span className="text-green-700">Sin gluten</span>}
					{p.alergenos.length > 0 && <span className="text-tinta/55">Contiene: {p.alergenos.join(", ")}</span>}
				</div>

				<div className="mt-auto pt-2 flex items-center justify-between gap-3">
					<span className={`font-bold tabular-nums ${p.imagen_url ? "sr-only" : "text-delicias"}`}>{euros(p.precio)}</span>
					{!p.disponible ? (
						<span className="ml-auto text-sm font-semibold text-tinta/60">Agotado por hoy</span>
					) : cantidad === 0 ? (
						<button
							onClick={() => carrito.cambiar(p, 1)}
							className="ml-auto h-10 px-4 rounded-full bg-delicias text-white font-bold hover:bg-delicias-oscuro transition-colors"
						>
							Añadir
						</button>
					) : (
						<div className="ml-auto flex items-center rounded-full bg-merengue">
							<button onClick={() => carrito.cambiar(p, -1)} aria-label={`Quitar un ${p.nombre}`}
								className="w-10 h-10 flex items-center justify-center text-delicias">
								<Minus className="w-4 h-4" />
							</button>
							<span className="w-6 text-center font-bold text-delicias tabular-nums" aria-live="polite">{cantidad}</span>
							<button onClick={() => carrito.cambiar(p, 1)} aria-label={`Añadir otro ${p.nombre}`}
								className="w-10 h-10 flex items-center justify-center text-delicias">
								<Plus className="w-4 h-4" />
							</button>
						</div>
					)}
				</div>
			</div>
		</li>
	);
}
