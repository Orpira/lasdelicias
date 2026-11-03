import { useState } from "react";
import { api } from "../lib/api";

// Botones para que el cliente sentado llame al personal o pida la cuenta
export default function BarraMesa({ mesa, token }: { mesa: number; token: string }) {
	const [aviso, setAviso] = useState("");
	const [enviando, setEnviando] = useState(false);

	async function llamar(motivo: "atencion" | "cuenta") {
		setEnviando(true);
		try {
			await api(`/mesas/qr/${token}/llamar`, { metodo: "POST", cuerpo: { motivo } });
			setAviso(motivo === "cuenta" ? "Te llevamos la cuenta enseguida 🧾" : "Ya vamos a tu mesa 🙋");
		} catch (e) {
			setAviso(e instanceof Error ? e.message : "No se pudo avisar");
		} finally {
			setEnviando(false);
			setTimeout(() => setAviso(""), 6000);
		}
	}

	return (
		<div className="max-w-xl mx-auto mb-8 rounded-2xl border-2 border-delicias-claro bg-white p-4 shadow-sm">
			<p className="text-center font-semibold text-delicias mb-3">Mesa {mesa}</p>
			<div className="grid grid-cols-2 gap-3">
				<button
					disabled={enviando}
					onClick={() => llamar("atencion")}
					className="py-3 rounded-xl bg-delicias-claro text-delicias font-bold hover:brightness-95 disabled:opacity-50"
				>
					🙋 Llamar al personal
				</button>
				<button
					disabled={enviando}
					onClick={() => llamar("cuenta")}
					className="py-3 rounded-xl bg-delicias-claro text-delicias font-bold hover:brightness-95 disabled:opacity-50"
				>
					🧾 Pedir la cuenta
				</button>
			</div>
			{aviso && <p className="text-center text-sm mt-3 text-gray-700" role="status">{aviso}</p>}
		</div>
	);
}
