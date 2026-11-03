// Destino del QR de cada mesa: /m/<código secreto>
// - Asocia este móvil a la mesa (la mesa sale del código, no de lo que escriba el cliente)
// - Si el móvil tiene pedidos en curso en otra mesa, pregunta si se ha cambiado
import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Armchair, ArrowLeftRight } from "lucide-react";
import { api } from "../lib/api";
import { useCarrito } from "../lib/carrito";
import { idDispositivo } from "../lib/dispositivo";

interface RespuestaMesa {
	numero: number;
	nombre: string;
	pedidos_en_otra_mesa: { codigo: string; numero_dia: number; mesa_numero: number }[];
}

export default function MesaQr() {
	const { token = "" } = useParams();
	const { fijarMesa } = useCarrito();
	const [mesa, setMesa] = useState<RespuestaMesa | null>(null);
	const [estado, setEstado] = useState<"comprobando" | "preguntar" | "listo" | "error">("comprobando");
	const [error, setError] = useState("");
	const [enviando, setEnviando] = useState(false);

	useEffect(() => {
		api<RespuestaMesa>(`/mesas/qr/${encodeURIComponent(token)}?dispositivo=${idDispositivo()}`)
			.then((m) => {
				setMesa(m);
				fijarMesa({ numero: m.numero, token });
				setEstado(m.pedidos_en_otra_mesa.length > 0 ? "preguntar" : "listo");
			})
			.catch((e) => {
				setError(e.message);
				setEstado("error");
			});
	}, [token, fijarMesa]);

	async function confirmarCambio() {
		setEnviando(true);
		try {
			await api(`/mesas/qr/${encodeURIComponent(token)}/cambio`, {
				metodo: "POST",
				cuerpo: { dispositivo: idDispositivo() },
			});
			setEstado("listo");
		} catch (e) {
			setError(e instanceof Error ? e.message : "No se pudo avisar del cambio");
		} finally {
			setEnviando(false);
		}
	}

	if (estado === "listo") return <Navigate to="/menu" replace />;
	if (estado === "comprobando") return <p className="text-center text-gray-600 py-24">Preparando tu mesa…</p>;
	if (estado === "error") {
		return (
			<div className="max-w-md mx-auto text-center py-24 px-4">
				<Armchair className="w-12 h-12 mx-auto mb-4 text-delicias/50" aria-hidden="true" />
				<p className="text-gray-700">{error || "Este código de mesa no es válido."}</p>
				<p className="text-gray-500 mt-2">Pide ayuda al personal.</p>
			</div>
		);
	}

	const previos = mesa!.pedidos_en_otra_mesa;
	const mesaAnterior = previos[0].mesa_numero;
	return (
		<div className="max-w-md mx-auto py-16 px-4 text-center text-tinta">
			<ArrowLeftRight className="w-12 h-12 mx-auto mb-4 text-delicias" aria-hidden="true" />
			<h1 className="text-3xl font-extrabold tracking-titular mb-3">¿Te has cambiado a la mesa {mesa!.numero}?</h1>
			<p className="text-gray-600 mb-8">
				Tienes {previos.length === 1 ? "un pedido en curso" : `${previos.length} pedidos en curso`} (
				{previos.map((p) => `#${p.numero_dia}`).join(", ")}) en la <b>mesa {mesaAnterior}</b>.
			</p>
			{error && <p className="text-red-600 mb-4" role="alert">{error}</p>}
			<div className="flex flex-col gap-3">
				<button onClick={confirmarCambio} disabled={enviando}
					className="py-4 rounded-xl bg-delicias text-white font-bold text-lg hover:bg-delicias-oscuro disabled:opacity-60">
					Sí, llevadlo a la mesa {mesa!.numero}
				</button>
				<button onClick={() => setEstado("listo")}
					className="py-4 rounded-xl bg-white border-2 border-gray-200 font-semibold">
					No, sigue en la mesa {mesaAnterior}
				</button>
			</div>
			<p className="text-xs text-gray-500 mt-6">Avisaremos al personal para que no haya confusiones con la entrega.</p>
		</div>
	);
}
