import { useEffect, useState, type FormEvent } from "react";
import { api, ErrorApi, euros } from "../../lib/api";
import { NOMBRES_ESTADO } from "../../lib/cuentas";
import { etiquetaMesa } from "../../lib/mesa";
import type { Cuenta, CuentaDetalle, MetodoPago } from "../../types/producto";
import Modal from "../Modal";
import BotonesCobro from "./BotonesCobro";

export default function CuentaCobro({ id, actualizacion, esAdmin, alCerrar, alCambiar, alCaducar }: {
	id: string;
	actualizacion: Cuenta | undefined;
	esAdmin: boolean;
	alCerrar: () => void;
	alCambiar: () => Promise<void>;
	alCaducar: () => void;
}) {
	const [cuenta, setCuenta] = useState<CuentaDetalle | null>(null);
	const [error, setError] = useState("");
	const [cargando, setCargando] = useState(true);
	const [guardando, setGuardando] = useState(false);
	const [anulando, setAnulando] = useState(false);
	const [motivo, setMotivo] = useState("");
	const [reintento, setReintento] = useState(0);

	useEffect(() => {
		let vigente = true;
		setCargando(true);
		api<CuentaDetalle>(`/admin/cuentas/${id}`, { auth: true })
			.then((datos) => { if (vigente) { setCuenta(datos); setError(""); } })
			.catch((fallo) => {
				if (!vigente) return;
				if (fallo instanceof ErrorApi && fallo.status === 401) alCaducar();
				else { setCuenta(null); setError(fallo.message); }
			})
			.finally(() => { if (vigente) setCargando(false); });
		return () => { vigente = false; };
	}, [id, actualizacion, reintento, alCaducar]);

	async function cobrar(metodo: MetodoPago) {
		if (!cuenta) { setError("Espera a que se cargue la cuenta antes de cobrar"); return; }
		let forzar = false;
		if (cuenta.pedidos_sin_entregar > 0) {
			forzar = window.confirm(`Hay ${cuenta.pedidos_sin_entregar} pedidos sin entregar. ¿Marcarlos como entregados y registrar el cobro de toda la cuenta?`);
			if (!forzar) return;
		}
		setGuardando(true);
		setError("");
		try {
			const registrar = (confirmado: boolean) => api<CuentaDetalle>(`/admin/cuentas/${id}/cobrar`, {
				metodo: "POST", auth: true, cuerpo: { metodo_pago: metodo, forzar: confirmado },
			});
			try {
				await registrar(forzar);
			} catch (fallo) {
				if (!forzar && fallo instanceof ErrorApi && fallo.status === 409 && /^Hay \d+ pedidos sin entregar$/.test(fallo.message)) {
					if (!window.confirm(`${fallo.message}. ¿Marcarlos como entregados y registrar el cobro?`)) return;
					await registrar(true);
				} else throw fallo;
			}
			await alCambiar();
			alCerrar();
		} catch (fallo) {
			if (fallo instanceof ErrorApi && fallo.status === 401) alCaducar();
			else setError(fallo instanceof Error ? fallo.message : "No se pudo registrar el cobro");
		} finally {
			setGuardando(false);
		}
	}

	async function anular(evento: FormEvent) {
		evento.preventDefault();
		if (!motivo.trim()) { setError("Indica el motivo de la anulación"); return; }
		setGuardando(true);
		setError("");
		try {
			await api(`/admin/cuentas/${id}/anular`, { metodo: "POST", auth: true, cuerpo: { motivo: motivo.trim() } });
			await alCambiar();
			alCerrar();
		} catch (fallo) {
			if (fallo instanceof ErrorApi && fallo.status === 401) alCaducar();
			else setError(fallo instanceof Error ? fallo.message : "No se pudo anular la cuenta");
		} finally {
			setGuardando(false);
		}
	}

	return (
		<Modal titulo={cuenta ? `Cuenta · ${etiquetaMesa(cuenta.mesa_numero, cuenta.mesa_nombre, { conNumero: true })}` : "Cuenta de mesa"}
			alCerrar={alCerrar} bloqueado={guardando}>
			{cargando && <p role="status" className="mb-3 text-sm text-tinta/70">Actualizando la cuenta…</p>}
			{error && <p role="alert" className="mb-4 text-red-700">{error}.{" "}
				{!cuenta && <button onClick={() => setReintento((anterior) => anterior + 1)} className="font-bold underline">Volver a intentar</button>}
			</p>}
			{cuenta && <>
				<ul className="divide-y divide-delicias/10">
					{cuenta.pedidos.map((pedido, indice) => (
						<li key={`${pedido.numero_dia}-${indice}`} className="py-3">
							<div className="mb-2 flex flex-wrap justify-between gap-2 font-bold">
								<span>Pedido #{pedido.numero_dia}</span>
								<span className={pedido.estado === "cancelado" ? "text-red-700" : "text-delicias"}>{NOMBRES_ESTADO[pedido.estado]}</span>
							</div>
							<ul className={pedido.estado === "cancelado" ? "space-y-1 text-tinta/50 line-through" : "space-y-1"}>
								{pedido.items.map((articulo, posicion) => (
									<li key={posicion} className="flex justify-between gap-3">
										<span className="min-w-0 break-words">{articulo.cantidad} × {articulo.nombre}</span>
										<span className="shrink-0">{euros(articulo.cantidad * articulo.precio_unitario)}</span>
									</li>
								))}
							</ul>
						</li>
					))}
				</ul>
				<p className="my-4 flex flex-wrap justify-between gap-3 rounded-xl bg-merengue p-4 text-3xl font-extrabold">
					<span>Total</span><span className="text-delicias">{euros(cuenta.total)}</span>
				</p>
				{cuenta.estado === "abierta" ? <>
					{cuenta.pedidos_sin_entregar > 0 && <p className="mb-4 font-semibold text-orange-800">
						{cuenta.pedidos_sin_entregar} {cuenta.pedidos_sin_entregar === 1 ? "pedido" : "pedidos"} sin entregar. Se pedirá confirmación antes de cobrarlos.
					</p>}
					<p className="mb-4 text-sm text-tinta/70">Registra el dinero recibido en caja. La app no realiza el pago.</p>
					<BotonesCobro alCobrar={cobrar} bloqueado={guardando || cargando || anulando} titulo="Cobrar cuenta" />
					{esAdmin && !anulando && <button onClick={() => setAnulando(true)} disabled={guardando}
						className="mt-5 min-h-[44px] rounded-lg border border-red-300 px-4 font-semibold text-red-700 disabled:opacity-50">Anular cuenta</button>}
					{esAdmin && anulando && <form onSubmit={anular} className="mt-5 space-y-3 rounded-xl border border-red-200 p-4">
						<label className="block font-semibold">Motivo de la anulación
							<textarea required maxLength={300} value={motivo} onChange={(evento) => setMotivo(evento.target.value)}
								className="mt-2 block w-full rounded-lg border bg-white p-3" rows={3} disabled={guardando} />
						</label>
						<p className="text-sm text-tinta/70">Los pedidos permanecerán sin pagar. Esta acción no registra ningún cobro.</p>
						<div className="flex flex-wrap gap-3">
							<button disabled={guardando} className="min-h-[44px] rounded-lg bg-red-700 px-4 font-bold text-white disabled:opacity-50">Confirmar anulación</button>
							<button type="button" onClick={() => setAnulando(false)} disabled={guardando} className="min-h-[44px] rounded-lg bg-gray-100 px-4 font-semibold">Volver al cobro</button>
						</div>
					</form>}
				</> : <p role="status" className="font-semibold">Esta cuenta ya está {cuenta.estado}.</p>}
				{guardando && <p role="status" className="mt-4 font-semibold text-delicias">Guardando el cierre de la cuenta…</p>}
			</>}
		</Modal>
	);
}
