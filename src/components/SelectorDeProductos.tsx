import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase/firebase";
import type { Producto } from "../types/producto";

interface SelectorProps {
	onSeleccionar: (items: ProductoConCantidad[]) => void;
}

export interface ProductoConCantidad extends Producto {
	cantidad: number;
}

const categorias = ["Desayunos", "Almuerzos", "Pastelería", "Bebidas"];

export default function SelectorDeProductos({ onSeleccionar }: SelectorProps) {
	const [productos, setProductos] = useState<ProductoConCantidad[]>([]);
	const [abierto, setAbierto] = useState<Record<string, boolean>>({});
	const [menuAbierto, setMenuAbierto] = useState(false);

	useEffect(() => {
		const fetchData = async () => {
			const querySnapshot = await getDocs(collection(db, "productos"));
			const data = querySnapshot.docs.map((doc) => ({
				...(doc.data() as Omit<Producto, "id">),
				id: doc.id,
				cantidad: 0,
			}));
			setProductos(data);
			setAbierto(
				categorias.reduce((acc, cat) => {
					acc[cat] = false;
					return acc;
				}, {} as Record<string, boolean>)
			);
		};
		fetchData();
	}, []);

	const actualizarCantidad = (id: string, delta: number) => {
		setProductos((prev) =>
			prev.map((p) =>
				p.id === id ? { ...p, cantidad: Math.max(p.cantidad + delta, 0) } : p
			)
		);
	};

	const productosSeleccionados = productos.filter((p) => p.cantidad > 0);

	return (
		<div className="max-w-screen-xl mx-auto p-4">
			<h2 className="text-2xl font-bold mb-4">Selecciona tus productos 🍞</h2>

			{/* Menú hamburguesa para categorías */}
			<div className="md:hidden mb-4">
				<button
					onClick={() => setMenuAbierto((prev) => !prev)}
					className="bg-pink-600 text-white px-4 py-2 rounded shadow flex items-center gap-2 w-full"
				>
					{menuAbierto ? "Cerrar menú" : "Abrir menú"}{" "}
					<span>{menuAbierto ? "✖" : "☰"}</span>
				</button>
				{menuAbierto && (
					<div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex flex-col items-start justify-start pt-20 w-screen h-screen">
						<div className="w-full px-4">
							{categorias.map((cat) => (
								<button
									key={cat}
									onClick={() =>
										setAbierto((prev) => ({ ...prev, [cat]: !prev[cat] }))
									}
									className={`w-full text-left bg-pink-200 px-6 py-4 font-semibold rounded mb-3 text-lg ${
										abierto[cat] ? "border-2 border-pink-600" : ""
									}`}
								>
									{cat} {abierto[cat] ? "▲" : "▼"}
								</button>
							))}
						</div>
						<button
							onClick={() => setMenuAbierto(false)}
							className="mt-6 ml-4 text-pink-600 font-bold text-xl"
						>
							Cerrar ✖
						</button>
					</div>
				)}
			</div>

			{/* Categorías en desktop */}
			<div className="hidden md:block">
				{categorias.map((cat) => {
					const productosCat = productos.filter((p) => p.categoria === cat);
					const esAbierto = abierto[cat];
					return (
						<div key={cat} className="mb-4">
							<button
								onClick={() =>
									setAbierto((prev) => ({ ...prev, [cat]: !prev[cat] }))
								}
								className="w-full text-left bg-pink-200 px-4 py-2 font-semibold rounded"
							>
								{cat} {esAbierto ? "▲" : "▼"}
							</button>
							{esAbierto && (
								<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-2 pb-2">
									{productosCat.map((p) => (
										<div
											key={p.id}
											className="border p-3 rounded shadow bg-white flex flex-col"
										>
											<img
												src={p.imagen}
												alt={p.nombre}
												className="h-32 w-full object-cover mb-2 rounded"
											/>
											<h3 className="text-lg font-bold">{p.nombre}</h3>
											<p className="text-sm text-gray-600">{p.descripcion}</p>
											<p className="font-semibold text-pink-600">
												€ {p.precio.toFixed(2)}
											</p>
											<div className="flex items-center gap-2 mt-2">
												<button
													onClick={() => actualizarCantidad(p.id, -1)}
													className="px-2 bg-gray-200 rounded"
												>
													−
												</button>
												<span>{p.cantidad}</span>
												<button
													onClick={() => actualizarCantidad(p.id, 1)}
													className="px-2 bg-gray-200 rounded"
												>
													+
												</button>
											</div>
										</div>
									))}
								</div>
							)}
						</div>
					);
				})}
			</div>

			{productosSeleccionados.length > 0 && (
				<div className="text-center mt-6">
					<button
						onClick={() => onSeleccionar(productosSeleccionados)}
						className="bg-pink-600 text-white px-6 py-2 rounded hover:bg-pink-700 transition"
					>
						Continuar pedido →
					</button>
				</div>
			)}
		</div>
	);
}
