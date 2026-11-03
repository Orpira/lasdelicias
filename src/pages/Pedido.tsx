import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, euros } from "../lib/api";
import { useCarrito } from "../lib/carrito";
import type { Pedido as TPedido } from "../types/producto";
import { ShoppingBag } from "lucide-react";
import { ErrorApi } from "../lib/api";
import { idDispositivo } from "../lib/dispositivo";
import { etiquetaMesa } from "../lib/mesa";

const CLAVE_MIS_PEDIDOS = "delicias.misPedidos";

function recordarPedido(codigo: string) {
	try {
		const previos: string[] = JSON.parse(localStorage.getItem(CLAVE_MIS_PEDIDOS) ?? "[]");
		localStorage.setItem(CLAVE_MIS_PEDIDOS, JSON.stringify([codigo, ...previos.filter((c) => c !== codigo)].slice(0, 10)));
	} catch {
		/* ignorar */
	}
}

function leerDatosCliente() {
	try {
		return JSON.parse(localStorage.getItem("delicias.cliente") ?? "{}") as { nombre?: string; telefono?: string };
	} catch {
		return {};
	}
}

export default function Pedido() {
	const carrito = useCarrito();
	const navigate = useNavigate();
	const guardado = leerDatosCliente();

	const [tipo, setTipo] = useState<"mesa" | "recoger">(carrito.mesa ? "mesa" : "recoger");
	const [nombre, setNombre] = useState(guardado.nombre ?? "");
	const [telefono, setTelefono] = useState(guardado.telefono ?? "");
	const [cuando, setCuando] = useState<"ya" | "hora">("ya");
	const [horaElegida, setHoraElegida] = useState("");
	const [notas, setNotas] = useState("");
	const [enviando, setEnviando] = useState(false);
	const [error, setError] = useState("");

	if (carrito.lineas.length === 0) {
		return (
			<div className="max-w-xl mx-auto text-center py-24 px-5 text-tinta">
				<ShoppingBag className="w-12 h-12 mx-auto mb-4 text-delicias/50" aria-hidden="true" />
				<h1 className="text-3xl font-extrabold tracking-titular mb-2">Tu pedido está vacío</h1>
				<p className="mb-6">Añade algo de la carta para empezar.</p>
				<Link to="/menu" className="inline-block bg-delicias text-white px-6 py-3 rounded-xl font-bold hover:bg-delicias-oscuro">
					Ver la carta
				</Link>
			</div>
		);
	}

	async function enviar(e: FormEvent) {
		e.preventDefault();
		setError("");

		let hora_recogida: string | undefined;
		if (tipo === "recoger" && cuando === "hora") {
			if (!horaElegida) return setError("Elige la hora de recogida");
			const [h, m] = horaElegida.split(":").map(Number);
			const fecha = new Date();
			fecha.setHours(h, m, 0, 0);
			if (fecha.getTime() < Date.now()) return setError("Esa hora ya ha pasado");
			hora_recogida = fecha.toISOString();
		}

		setEnviando(true);
		try {
			const pedido = await api<TPedido>("/pedidos", {
				metodo: "POST",
				cuerpo: {
					items: carrito.lineas.map((l) => ({ producto_id: l.producto.id, cantidad: l.cantidad })),
					nombre,
					telefono: telefono.trim() || undefined,
					tipo,
					mesa_token: tipo === "mesa" ? carrito.mesaToken : undefined,
					dispositivo: idDispositivo(),
					hora_recogida,
					notas: notas.trim() || undefined,
				},
			});
			try {
				localStorage.setItem("delicias.cliente", JSON.stringify({ nombre, telefono }));
			} catch {
				/* ignorar */
			}
			recordarPedido(pedido.codigo);
			carrito.vaciar();
			navigate(`/pedido/${pedido.codigo}`, { replace: true });
		} catch (err) {
			// QR regenerado o caducado: hay que volver a escanear
			if (err instanceof ErrorApi && err.status === 409 && tipo === "mesa") {
				carrito.fijarMesa(null);
				setTipo("recoger");
			}
			setError(err instanceof Error ? err.message : "No se pudo enviar el pedido");
		} finally {
			setEnviando(false);
		}
	}

	return (
		<div className="max-w-xl mx-auto px-5 py-10 text-tinta">
			<h1 className="text-4xl font-extrabold tracking-titular mb-6">Tu pedido</h1>

			<ul className="bg-white rounded-2xl border border-delicias/15 divide-y mb-6">
				{carrito.lineas.map(({ producto, cantidad }) => (
					<li key={producto.id} className="flex items-center gap-3 p-4">
						<div className="flex-1">
							<p className="font-semibold">{producto.nombre}</p>
							<p className="text-sm text-gray-500">{euros(producto.precio)} / ud.</p>
						</div>
						<div className="flex items-center rounded-lg bg-delicias-claro">
							<button type="button" onClick={() => carrito.cambiar(producto, -1)} className="px-3 py-1 text-lg font-bold text-delicias" aria-label="Quitar uno">−</button>
							<span className="w-6 text-center font-bold text-delicias">{cantidad}</span>
							<button type="button" onClick={() => carrito.cambiar(producto, 1)} className="px-3 py-1 text-lg font-bold text-delicias" aria-label="Añadir uno">+</button>
						</div>
						<span className="w-20 text-right font-semibold">{euros(producto.precio * cantidad)}</span>
					</li>
				))}
				<li className="flex justify-between p-4 text-lg font-bold">
					<span>Total</span>
					<span className="text-delicias">{euros(carrito.total)}</span>
				</li>
			</ul>

			<form onSubmit={enviar} className="bg-white rounded-2xl border border-delicias/15 p-5 flex flex-col gap-4">
				{carrito.mesa && (
					<div className="grid grid-cols-2 gap-2">
						<button type="button" onClick={() => setTipo("mesa")}
							className={`py-3 rounded-xl font-semibold border-2 ${tipo === "mesa" ? "border-delicias bg-delicias-claro text-delicias" : "border-gray-200"}`}>
							Tomar en {etiquetaMesa(carrito.mesa, carrito.mesaNombre)}
						</button>
						<button type="button" onClick={() => setTipo("recoger")}
							className={`py-3 rounded-xl font-semibold border-2 ${tipo === "recoger" ? "border-delicias bg-delicias-claro text-delicias" : "border-gray-200"}`}>
							Para llevar
						</button>
					</div>
				)}

				<label className="flex flex-col gap-1">
					<span className="text-sm font-semibold">Nombre</span>
					<input value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={60}
						className="border rounded-lg px-3 py-2 bg-white" autoComplete="given-name" />
				</label>

				<label className="flex flex-col gap-1">
					<span className="text-sm font-semibold">
						Teléfono {tipo === "mesa" && <span className="font-normal text-gray-500">(opcional)</span>}
					</span>
					<input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} required={tipo === "recoger"}
						className="border rounded-lg px-3 py-2 bg-white" autoComplete="tel" placeholder="600 123 456" />
				</label>

				{tipo === "recoger" && (
					<fieldset className="flex flex-col gap-2">
						<legend className="text-sm font-semibold mb-1">¿Cuándo lo recoges?</legend>
						<label className="flex items-center gap-2">
							<input type="radio" checked={cuando === "ya"} onChange={() => setCuando("ya")} />
							Lo antes posible
						</label>
						<label className="flex items-center gap-2">
							<input type="radio" checked={cuando === "hora"} onChange={() => setCuando("hora")} />
							A una hora:
							<input type="time" value={horaElegida} onChange={(e) => { setHoraElegida(e.target.value); setCuando("hora"); }}
								className="border rounded-lg px-2 py-1 bg-white" />
						</label>
					</fieldset>
				)}

				<label className="flex flex-col gap-1">
					<span className="text-sm font-semibold">Notas <span className="font-normal text-gray-500">(opcional)</span></span>
					<textarea value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={300} rows={2}
						placeholder="Sin azúcar, café con leche de avena…" className="border rounded-lg px-3 py-2 bg-white" />
				</label>

				<p className="text-xs text-gray-500">
					Usaremos tu nombre y teléfono solo para preparar este pedido y avisarte cuando esté listo.
				</p>

				{error && <p className="text-red-600 font-semibold" role="alert">{error}</p>}

				<button type="submit" disabled={enviando}
					className="py-4 rounded-xl bg-delicias text-white text-lg font-bold hover:bg-delicias-oscuro disabled:opacity-60 transition">
					{enviando ? "Enviando…" : `Enviar pedido · ${euros(carrito.total)}`}
				</button>
				<p className="text-xs text-center text-gray-500">Pagas en el local al recoger o en la mesa.</p>
			</form>
		</div>
	);
}
