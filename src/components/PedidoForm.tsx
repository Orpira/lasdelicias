import { useState } from "react";
import SelectorDeProductos from "./SelectorDeProductos";
import type { ProductoConCantidad } from "./SelectorDeProductos";
import FormularioCliente from "./FormularioCliente";

export default function PedidoForm() {
	const [pedido, setPedido] = useState<ProductoConCantidad[] | null>(null);

	return (
		<div className="min-h-screen bg-gray-100 px-4 py-8">
			{!pedido ? (
				<SelectorDeProductos onSeleccionar={setPedido} />
			) : (
				<FormularioCliente
					pedido={pedido}
					onFinalizado={() => setPedido(null)}
				/>
			)}
		</div>
	);
}
