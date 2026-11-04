import { useEffect, useState } from "react";
import { Eye, Hand, ReceiptText } from "lucide-react";
import { api, escuchar, euros } from "../lib/api";
import { etiquetaMesa } from "../lib/mesa";
import { esEventoCuenta, NOMBRES_ESTADO } from "../lib/cuentas";
import type { CuentaDetalle } from "../types/producto";
import Modal from "./Modal";

// Botones para que el cliente sentado llame al personal o pida la cuenta
export default function BarraMesa({ mesa, nombre, token }: { mesa: number; nombre: string | null; token: string }) {
	const [aviso, setAviso] = useState("");
	const [enviando, setEnviando] = useState(false);
	const [abierta, setAbierta] = useState(false);
	const [cuenta, setCuenta] = useState<CuentaDetalle | null>(null);
	const [cargando, setCargando] = useState(false);
	const [error, setError] = useState("");
	const [reintento, setReintento] = useState(0);

	useEffect(() => {
		if (!abierta) return;
		let vigente = true;
		let consulta = 0;
		async function cargar() {
			const actual = ++consulta;
			setCargando(true);
			try {
				const datos = await api<CuentaDetalle | null>(`/mesas/qr/${token}/cuenta`);
				if (vigente && actual === consulta) { setCuenta(datos); setError(""); }
			} catch (fallo) {
				if (vigente && actual === consulta) {
					setCuenta(null);
					setError(fallo instanceof Error ? fallo.message : "No se pudo cargar la cuenta");
				}
			} finally {
				if (vigente && actual === consulta) setCargando(false);
			}
		}
		void cargar();
		const cerrar = escuchar(`/mesas/qr/${token}/stream`, (evento, datos) => {
			if (evento === "cuenta" && esEventoCuenta(datos)) void cargar();
		}, { alCambiarConexion: (conectado) => { if (conectado) void cargar(); } });
		return () => { vigente = false; cerrar(); };
	}, [abierta, token, reintento]);

	async function llamar(motivo: "atencion" | "cuenta") {
		setEnviando(true);
		try {
			await api(`/mesas/qr/${token}/llamar`, { metodo: "POST", cuerpo: { motivo } });
			setAviso(motivo === "cuenta" ? "Te llevamos la cuenta enseguida." : "Avisado: vamos a tu mesa.");
		} catch (e) {
			setAviso(e instanceof Error ? e.message : "No se ha podido avisar. Pídelo en la barra.");
		} finally {
			setEnviando(false);
			setTimeout(() => setAviso(""), 6000);
		}
	}

	return (
		<div className="mb-6 rounded-2xl bg-merengue p-4 flex flex-wrap items-center gap-3">
			<p className="font-bold text-delicias-profundo mr-auto">Estás en {etiquetaMesa(mesa, nombre)}</p>
			<button disabled={enviando} onClick={() => llamar("atencion")}
				className="h-11 px-4 rounded-full bg-white text-delicias font-bold flex items-center gap-2 hover:bg-delicias-claro disabled:opacity-50">
				<Hand className="w-4 h-4" aria-hidden="true" /> Llamar al personal
			</button>
			<button disabled={enviando} onClick={() => llamar("cuenta")}
				className="h-11 px-4 rounded-full bg-white text-delicias font-bold flex items-center gap-2 hover:bg-delicias-claro disabled:opacity-50">
				<ReceiptText className="w-4 h-4" aria-hidden="true" /> Pedir la cuenta
			</button>
			<button onClick={() => setAbierta(true)}
				className="h-11 px-4 rounded-full bg-delicias text-white font-bold flex items-center gap-2 hover:bg-delicias-oscuro">
				<Eye className="w-4 h-4" aria-hidden="true" /> Ver mi cuenta
			</button>
			{aviso && !abierta && <p className="w-full text-sm font-semibold text-delicias-profundo" role="status">{aviso}</p>}
			{abierta && <Modal titulo={`Cuenta de ${etiquetaMesa(mesa, nombre)}`} alCerrar={() => setAbierta(false)}>
				{cargando && <p role="status" className="mb-3 text-sm text-tinta/70">Actualizando tu cuenta…</p>}
				{error && <p role="alert" className="mb-4 text-red-700">{error}.{" "}
					<button onClick={() => setReintento((anterior) => anterior + 1)} className="font-bold underline">Volver a intentar</button>
				</p>}
				{!cargando && !error && !cuenta && <p>Todavía no has pedido nada en esta mesa.</p>}
				{cuenta && <>
					<ul className="divide-y divide-delicias/10">
						{cuenta.pedidos.map((pedido, indice) => <li key={`${pedido.numero_dia}-${indice}`} className="py-3">
							<div className="flex flex-wrap justify-between gap-2 font-bold">
								<span>Pedido #{pedido.numero_dia}</span>
								<span className={pedido.estado === "cancelado" ? "text-red-700" : "text-delicias"}>{NOMBRES_ESTADO[pedido.estado]}</span>
							</div>
							<ul className={`mt-2 space-y-1 ${pedido.estado === "cancelado" ? "text-tinta/50 line-through" : ""}`}>
								{pedido.items.map((articulo, posicion) => <li key={posicion} className="flex justify-between gap-3">
									<span className="min-w-0 break-words">{articulo.cantidad} × {articulo.nombre}</span><span className="shrink-0">{euros(articulo.cantidad * articulo.precio_unitario)}</span>
								</li>)}
							</ul>
						</li>)}
					</ul>
					<p className="my-4 flex justify-between gap-4 rounded-xl bg-merengue p-4 text-2xl font-extrabold">
						<span>Total</span><span className="text-delicias">{euros(cuenta.total)}</span>
					</p>
					<p className="mb-4 text-sm text-tinta/70">El pago se realiza en la caja del local.</p>
					<button disabled={enviando} onClick={() => llamar("cuenta")}
						className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-delicias px-4 py-3 font-bold text-white hover:bg-delicias-oscuro disabled:opacity-50">
						<ReceiptText className="h-5 w-5" aria-hidden="true" /> Pedir la cuenta
					</button>
				</>}
				{aviso && <p role="status" className="mt-4 font-semibold text-delicias-profundo">{aviso}</p>}
			</Modal>}
		</div>
	);
}
