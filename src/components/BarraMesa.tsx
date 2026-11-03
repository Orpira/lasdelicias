import { useState } from "react";
import { Hand, ReceiptText } from "lucide-react";
import { api } from "../lib/api";

// Botones para que el cliente sentado llame al personal o pida la cuenta
export default function BarraMesa({ mesa, token }: { mesa: number; token: string }) {
	const [aviso, setAviso] = useState("");
	const [enviando, setEnviando] = useState(false);

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
			<p className="font-bold text-delicias-profundo mr-auto">Estás en la mesa {mesa}</p>
			<button disabled={enviando} onClick={() => llamar("atencion")}
				className="h-11 px-4 rounded-full bg-white text-delicias font-bold flex items-center gap-2 hover:bg-delicias-claro disabled:opacity-50">
				<Hand className="w-4 h-4" aria-hidden="true" /> Llamar al personal
			</button>
			<button disabled={enviando} onClick={() => llamar("cuenta")}
				className="h-11 px-4 rounded-full bg-white text-delicias font-bold flex items-center gap-2 hover:bg-delicias-claro disabled:opacity-50">
				<ReceiptText className="w-4 h-4" aria-hidden="true" /> Pedir la cuenta
			</button>
			{aviso && <p className="w-full text-sm font-semibold text-delicias-profundo" role="status">{aviso}</p>}
		</div>
	);
}
