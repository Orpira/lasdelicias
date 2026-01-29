import { useState } from "react";
import type { ProductoConCantidad } from "./SelectorDeProductos";

interface FormularioProps {
	pedido: ProductoConCantidad[];
	onFinalizado: () => void;
}

export default function FormularioCliente({
	pedido,
	onFinalizado,
}: FormularioProps) {
	const [nombre, setNombre] = useState("");
	const [telefono, setTelefono] = useState("");
	const [enviado, setEnviado] = useState(false);

	const total = pedido.reduce((acc, p) => acc + p.precio * p.cantidad, 0);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!nombre || !telefono) return alert("Completa los datos");
		// Aquí podrías guardar en Firestore o enviar por SMS
		console.log("Pedido enviado:", { nombre, telefono, pedido });
		setEnviado(true);
		onFinalizado();
	};

	if (enviado)
		return (
			<p className="text-green-600 font-bold">¡Pedido enviado con éxito!</p>
		);

	return (
		<div className="max-w-xl mx-auto p-4 bg-white shadow rounded mt-8">
			<h2 className="text-xl font-bold mb-4">Completa tu pedido</h2>
			<ul className="text-sm mb-4">
				{pedido.map((p) => (
					<li key={p.id}>
						{p.nombre} × {p.cantidad} = € {(p.precio * p.cantidad).toFixed(2)}
					</li>
				))}
				<li className="mt-2 font-bold">Total: € {total.toFixed(2)}</li>
			</ul>
			<form onSubmit={handleSubmit} className="flex flex-col gap-3">
				<input
					type="text"
					placeholder="Tu nombre"
					value={nombre}
					onChange={(e) => setNombre(e.target.value)}
					className="border p-2 rounded"
				/>
				<input
					type="tel"
					placeholder="Tu teléfono"
					value={telefono}
					onChange={(e) => setTelefono(e.target.value)}
					className="border p-2 rounded"
				/>
				<button
					type="submit"
					className="bg-green-600 text-white py-2 rounded hover:bg-green-700 transition"
				>
					Enviar pedido
				</button>
			</form>
		</div>
	);
}
