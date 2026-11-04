import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, euros, hora } from "../lib/api";
import { useCarrito } from "../lib/carrito";
import type { Pedido as TPedido } from "../types/producto";
import { ShoppingBag } from "lucide-react";
import { ErrorApi } from "../lib/api";
import { idDispositivo } from "../lib/dispositivo";
import { etiquetaMesa } from "../lib/mesa";
import { recordarPedido } from "../lib/cuentas";
import { useEstadoHorario } from "../lib/horario";
import { diaApertura } from "../lib/programados";

const CLAVE_CLIENTE = "delicias.cliente";

function leerDatosCliente(): { nombre: string; telefono: string } | null {
	try {
		const guardado = localStorage.getItem(CLAVE_CLIENTE);
		if (guardado === null) return null;
		const datos: unknown = JSON.parse(guardado);
		if (typeof datos !== "object" || datos === null || Array.isArray(datos)) {
			throw new Error("Formato de datos del cliente no válido");
		}
		const nombre = "nombre" in datos ? datos.nombre : "";
		const telefono = "telefono" in datos ? datos.telefono : "";
		if (typeof nombre !== "string" || typeof telefono !== "string") {
			throw new Error("Formato de datos del cliente no válido");
		}
		return { nombre, telefono };
	} catch (error) {
		console.warn("No se pudieron leer los datos recordados del cliente", error);
		return null;
	}
}

export default function Pedido() {
	const carrito = useCarrito();
	const navigate = useNavigate();
	const [guardado] = useState(leerDatosCliente);
	const { estado: horario, error: errorHorario, cargando: cargandoHorario, recargar: recargarHorario } = useEstadoHorario(true);

	const [eleccionTipo, setTipo] = useState<"mesa" | "recoger">(carrito.mesa ? "mesa" : "recoger");
	const tipo = horario?.abierto === false ? "recoger" : eleccionTipo;
	const [nombre, setNombre] = useState(guardado?.nombre ?? "");
	const [telefono, setTelefono] = useState(guardado?.telefono ?? "");
	const [recordarDatos, setRecordarDatos] = useState(guardado !== null);
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
		if (!horario) return setError("No se pudo comprobar el horario. Pulsa Reintentar antes de enviar el pedido.");
		if (!horario.abierto && !horario.siguiente_apertura) return setError("Ahora mismo no tenemos horario de apertura previsto. Llámanos para hacer tu pedido.");

		let hora_recogida: string | undefined;
		if (tipo === "recoger" && cuando === "hora") {
			if (!horaElegida) return setError("Elige la hora de recogida");
			if (!horario.recogida?.opciones.some((opcion) => opcion.instante === horaElegida) || Date.parse(horaElegida) < Date.now()) {
				return setError("Esa hora ya no está disponible. Elige otra hora de recogida.");
			}
			hora_recogida = horaElegida;
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
				if (recordarDatos) localStorage.setItem(CLAVE_CLIENTE, JSON.stringify({ nombre, telefono }));
				else localStorage.removeItem(CLAVE_CLIENTE);
			} catch (error) {
				console.warn("El pedido se ha enviado, pero no se pudieron actualizar los datos recordados del cliente", error);
			}
			recordarPedido(pedido.codigo);
			carrito.registrarPedido(pedido);
			if (pedido.tipo === "mesa" && pedido.mesa_numero !== null && carrito.mesaToken && carrito.mesaDesde !== null) {
				carrito.confirmarMesaDelPedido({
					numero: pedido.mesa_numero, nombre: pedido.mesa_nombre ?? null, token: carrito.mesaToken, desde: carrito.mesaDesde,
				});
			}
			carrito.vaciar();
			navigate(`/pedido/${pedido.codigo}`, { replace: true });
		} catch (err) {
			if (err instanceof ErrorApi && err.status === 409 && tipo === "mesa") {
				if (err.message.startsWith("El código de esta mesa")) {
					carrito.fijarMesa(null);
					setTipo("recoger");
				} else if (err.message.startsWith("El local está cerrado")) setTipo("recoger");
				recargarHorario();
			}
			setError(err instanceof Error ? err.message : "No se pudo enviar el pedido");
		} finally {
			setEnviando(false);
		}
	}

	return (
		<div className="max-w-xl mx-auto px-5 py-10 text-tinta">
			<h1 className="text-4xl font-extrabold tracking-titular mb-6">Tu pedido</h1>
			{cargandoHorario && !horario && <p role="status" className="mb-5">Consultando el horario…</p>}
			{errorHorario && <p role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-red-700">{errorHorario} <button type="button" onClick={recargarHorario} className="font-bold underline">Reintentar</button></p>}
			{horario && !horario.abierto && <div role="status" className="mb-6 rounded-2xl border border-delicias/20 bg-merengue p-5 text-delicias">
				<p className="font-bold">{horario.siguiente_apertura
					? `Ahora estamos cerrados. Recibiremos tu pedido y lo prepararemos el ${diaApertura(horario.siguiente_apertura)} a partir de las ${hora(horario.siguiente_apertura)}.`
					: "Ahora mismo no tenemos horario de apertura previsto. Llámanos para hacer tu pedido."}</p>
			</div>}

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
				{carrito.mesa && horario?.abierto && (
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

				<label className="flex items-start gap-3 text-sm text-tinta/80">
					<input type="checkbox" checked={recordarDatos} onChange={(e) => setRecordarDatos(e.target.checked)}
						className="mt-0.5 w-5 h-5 shrink-0 accent-delicias" />
					<span>Recordar mi nombre y teléfono en este dispositivo</span>
				</label>

				{tipo === "recoger" && (
					<fieldset className="flex flex-col gap-2">
						<legend className="text-sm font-semibold mb-1">¿Cuándo lo recoges?</legend>
						<label className="flex items-center gap-2">
							<input type="radio" checked={cuando === "ya"} onChange={() => setCuando("ya")} />
							{horario && !horario.abierto && horario.siguiente_apertura
								? `En cuanto abramos (${diaApertura(horario.siguiente_apertura)} a las ${hora(horario.siguiente_apertura)})`
								: "Lo antes posible"}
						</label>
						<label className="flex items-center gap-2">
							<input type="radio" checked={cuando === "hora"} onChange={() => setCuando("hora")} />
							A una hora:
							<select aria-label="Hora de recogida" value={horaElegida} disabled={!horario?.recogida?.opciones.length}
								onChange={(e) => { setHoraElegida(e.target.value); setCuando("hora"); }}
								className="min-w-0 border rounded-lg px-2 py-1 bg-white">
								<option value="">Elige una hora</option>
								{horario?.recogida?.opciones.map((opcion) => <option key={opcion.instante} value={opcion.instante}>{opcion.hora}</option>)}
							</select>
						</label>
						{horario?.recogida && <p className="text-xs text-tinta/70">Horas del {diaApertura(`${horario.recogida.fecha}T12:00:00Z`, true)}, en Madrid.</p>}
					</fieldset>
				)}

				<label className="flex flex-col gap-1">
					<span className="text-sm font-semibold">Notas <span className="font-normal text-gray-500">(opcional)</span></span>
					<textarea value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={300} rows={2}
						placeholder="Sin azúcar, café con leche de avena…" className="border rounded-lg px-3 py-2 bg-white" />
				</label>

				<p className="text-xs text-gray-500">
					Usaremos tu nombre y teléfono solo para preparar este pedido y avisarte cuando esté listo.{" "}
					<Link to="/privacidad" target="_blank" rel="noopener noreferrer"
						className="font-semibold text-delicias underline underline-offset-2">Política de privacidad</Link>.
				</p>

				{error && <p className="text-red-600 font-semibold" role="alert">{error}</p>}

				<button type="submit" disabled={enviando || cargandoHorario || !horario || !horario.abierto && !horario.siguiente_apertura}
					className="py-4 rounded-xl bg-delicias text-white text-lg font-bold hover:bg-delicias-oscuro disabled:opacity-60 transition">
					{enviando ? "Enviando…" : `Enviar pedido · ${euros(carrito.total)}`}
				</button>
				<p className="text-xs text-center text-gray-500">Pagas en la caja del local. La web no procesa pagos.</p>
			</form>
		</div>
	);
}
