import { useEffect, useState } from "react";
import AdminProductos from "./AdminProductos";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase/firebase";

interface Producto {
	id: string;
	nombre: string;
	descripcion: string;
	precio: number;
	categoria: "Desayunos" | "Almuerzos" | "Pastelería" | "Bebidas";
	valoracion: number;
	imagen: string;
}

export default function Menu() {
	const [productos, setProductos] = useState<Producto[]>([]);
	const [carrito, setCarrito] = useState<
		{ producto: Producto; cantidad: number }[]
	>([]);
	const categorias = [
		{ nombre: "Desayunos", emoji: "🥐" },
		{ nombre: "Almuerzos", emoji: "🍽️" },
		{ nombre: "Pastelería", emoji: "🧁" },
		{ nombre: "Bebidas", emoji: "☕" },
	];

	const [categoriaActiva, setCategoriaActiva] = useState<string>(
		categorias[0].nombre
	);
	const [adminMode, setAdminMode] = useState(false);

	useEffect(() => {
		const fetchData = async () => {
			const querySnapshot = await getDocs(collection(db, "productos"));
			const data: Producto[] = querySnapshot.docs.map((doc) => ({
				id: doc.id,
				...doc.data(),
			})) as Producto[];
			setProductos(data);
		};
		fetchData();
	}, []);

	const renderEstrellas = (cantidad: number) => "⭐".repeat(cantidad);

	const paddingBottom = carrito.length > 0 ? "pb-56" : "pb-8";
	return (
		<div
			className={`min-h-screen bg-white px-4 py-8 font-sans ${paddingBottom}`}
		>
			<h1 className="text-4xl font-bold text-center mb-10">
				Menú de Las Delicias
			</h1>
			<div className="flex justify-center mb-8">
				<button
					className="bg-pink-100 text-pink-700 px-5 py-2 rounded-full font-bold shadow hover:bg-pink-200 transition"
					onClick={() => setAdminMode((prev) => !prev)}
				>
					{adminMode ? "Volver al menú" : "Administrar productos"}
				</button>
			</div>
			{adminMode ? (
				<AdminProductos />
			) : (
				<>
					<div className="flex flex-wrap justify-center gap-4 mb-10">
						{categorias.map((cat) => (
							<button
								key={cat.nombre}
								onClick={() => setCategoriaActiva(cat.nombre)}
								className={`px-5 py-2 rounded-full font-semibold text-lg shadow transition-all duration-300 flex items-center gap-2 border-2
	  ${
			categoriaActiva === cat.nombre
				? "bg-yellow-100 border-yellow-400 scale-105"
				: "bg-white border-pink-200 hover:bg-pink-50"
		}`}
								style={{
									outline:
										categoriaActiva === cat.nombre
											? "2px solid #f59e42"
											: "none",
								}}
							>
								<span className="text-2xl">{cat.emoji}</span>
								<span
									className={
										categoriaActiva === cat.nombre
											? "text-gray-800"
											: "text-pink-600"
									}
								>
									{cat.nombre}
								</span>
							</button>
						))}
					</div>
					{categorias.map((cat) => (
						<section
							key={cat.nombre}
							className={`mb-12 transition-all duration-500 ease-in-out ${
								categoriaActiva === cat.nombre
									? "opacity-100 scale-100"
									: "opacity-0 scale-95 h-0 overflow-hidden"
							}`}
						>
							<h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
								<span className="text-2xl">{cat.emoji}</span>
								{cat.nombre}
							</h2>
							<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
								{productos
									.filter((p) => p.categoria === cat.nombre)
									.map((p) => {
										const seleccionado = carrito.some(
											(item) => item.producto.id === p.id
										);
										const cantidadActual = 1;
										return (
											<div
												key={p.id}
												className={`border rounded-lg p-4 shadow hover:shadow-md transition relative ${
													seleccionado ? "ring-2 ring-pink-400" : ""
												}`}
											>
												<img
													src={p.imagen}
													alt={p.nombre}
													className="w-full h-32 object-cover rounded mb-3"
												/>
												<h3 className="text-xl font-bold mb-1">{p.nombre}</h3>
												<p className="text-sm text-gray-600 mb-1">
													{p.descripcion}
												</p>
												<p className="text-lg font-semibold text-pink-600 mb-1">
													€ {p.precio.toFixed(2)}
												</p>
												<p className="text-yellow-500">
													{renderEstrellas(p.valoracion)}
												</p>
												<div className="flex items-center gap-2 mt-2"></div>
												<button
													className={`absolute top-2 right-2 px-3 py-1 rounded-full text-xs font-bold transition-all duration-200 shadow ${
														seleccionado
															? "bg-pink-600 text-white"
															: "bg-yellow-100 text-pink-600 hover:bg-pink-100"
													}`}
													onClick={() => {
														if (seleccionado) {
															setCarrito(
																carrito.filter(
																	(item) => item.producto.id !== p.id
																)
															);
														} else {
															setCarrito([
																...carrito,
																{ producto: p, cantidad: cantidadActual },
															]);
														}
													}}
												>
													{seleccionado ? "Quitar" : "Pedir"}
												</button>
											</div>
										);
									})}
							</div>
						</section>
					))}
					{/* Carrito de pedido a domicilio */}
					{carrito.length > 0 && (
						<div className="fixed bottom-6 right-6 bg-white border-2 border-pink-300 rounded-2xl shadow-lg p-6 z-50 flex flex-col items-center gap-4 animate-fade-in min-w-[320px] max-w-xs w-[350px] h-[480px]">
							<h4 className="text-lg font-bold mb-2 text-pink-600 flex items-center gap-2 justify-center">
								<span>🚚</span>
								Pedido a domicilio
							</h4>
							<ul
								className="mb-2 w-full flex flex-col items-center overflow-y-auto scrollbar-thin scrollbar-thumb-pink-300 scrollbar-track-pink-100"
								style={{ maxHeight: "220px" }}
							>
								{carrito.map((item, idx) => (
									<li
										key={item.producto.id}
										className="text-sm text-gray-700 mb-2 flex flex-col items-center w-full"
									>
										<span className="font-bold text-center w-full">
											{idx + 1}. {item.producto.nombre}
										</span>
										<div className="flex items-center justify-center gap-2 mt-1">
											<input
												type="number"
												min={1}
												value={item.cantidad}
												onChange={(e) => {
													const nuevaCantidad = Math.max(
														1,
														Number(e.target.value)
													);
													setCarrito(
														carrito.map((i) =>
															i.producto.id === item.producto.id
																? { ...i, cantidad: nuevaCantidad }
																: i
														)
													);
												}}
												className="w-12 px-2 py-1 border rounded text-center text-sm"
											/>
											<span className="text-pink-600">x{item.cantidad}</span>
											<span className="text-pink-600">
												€ {(item.producto.precio * item.cantidad).toFixed(2)}
											</span>
											<button
												className="ml-2 px-2 py-0.5 rounded bg-pink-100 text-xs text-pink-700 hover:bg-pink-200"
												onClick={() =>
													setCarrito(
														carrito.filter(
															(i) => i.producto.id !== item.producto.id
														)
													)
												}
											>
												Quitar
											</button>
										</div>
									</li>
								))}
							</ul>
							<div className="font-bold text-yellow-700 mb-2 text-center text-xl w-full">
								Total: €{" "}
								{carrito
									.reduce(
										(acc, item) => acc + item.producto.precio * item.cantidad,
										0
									)
									.toFixed(2)}
							</div>
							<div className="flex w-full gap-2 mt-2">
								<button
									className="bg-gray-200 text-pink-700 px-4 py-2 rounded-xl font-bold shadow hover:bg-gray-300 transition text-base w-full text-center"
									onClick={() => setCarrito([])}
								>
									Cancelar pedido
								</button>
								<a
									href={`https://wa.me/34633272668?text=Hola! Quiero pedir a domicilio:%0A${carrito
										.map(
											(p) =>
												`- ${p.producto.nombre} x${p.cantidad} (€${(
													p.producto.precio * p.cantidad
												).toFixed(2)})`
										)
										.join("%0A")}`}
									target="_blank"
									rel="noopener noreferrer"
									className="bg-pink-600 text-white px-6 py-2 rounded-xl font-bold shadow hover:bg-pink-700 transition text-base w-full text-center"
								>
									Pedir por WhatsApp
								</a>
							</div>
						</div>
					)}
				</>
			)}
		</div>
	);
}
