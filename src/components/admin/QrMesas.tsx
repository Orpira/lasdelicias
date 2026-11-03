// Hoja imprimible con el QR de cada mesa. Cada QR lleva un código secreto (/m/<token>),
// así nadie puede pedir "a otra mesa" cambiando un número en la URL.
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api } from "../../lib/api";

interface Mesa {
	numero: number;
	nombre: string;
	token: string;
}

async function conQr(m: Mesa) {
	const url = `${window.location.origin}/m/${m.token}`;
	const qr = await QRCode.toDataURL(url, { width: 480, margin: 1, color: { dark: "#9E0034" } });
	return { ...m, url, qr };
}

export default function QrMesas() {
	const [mesas, setMesas] = useState<Awaited<ReturnType<typeof conQr>>[]>([]);
	const [aviso, setAviso] = useState("");

	useEffect(() => {
		api<Mesa[]>("/admin/mesas", { auth: true }).then(async (lista) => setMesas(await Promise.all(lista.map(conQr))));
	}, []);

	async function regenerar(numero: number) {
		if (!window.confirm(`¿Generar un QR nuevo para la mesa ${numero}? El QR impreso actual dejará de funcionar y habrá que imprimir el nuevo.`)) return;
		const m = await api<Mesa>(`/admin/mesas/${numero}/regenerar`, { metodo: "POST", auth: true });
		const nueva = await conQr(m);
		setMesas((prev) => prev.map((x) => (x.numero === numero ? nueva : x)));
		setAviso(`Mesa ${numero}: QR nuevo listo. Imprímelo y sustituye el anterior.`);
	}

	return (
		<div className="max-w-5xl mx-auto p-4">
			<div className="flex flex-wrap items-center justify-between gap-3 mb-4 print:hidden">
				<p className="text-gray-600">
					Imprime la hoja y coloca cada tarjeta en su mesa. Cada QR identifica su mesa con un código secreto.
				</p>
				<button onClick={() => window.print()} className="px-4 py-2 rounded-lg bg-delicias text-white font-bold">Imprimir</button>
			</div>
			{aviso && <p className="mb-4 p-3 rounded-lg bg-green-100 text-green-800 print:hidden">{aviso}</p>}
			<div className="grid grid-cols-2 md:grid-cols-4 gap-4 print:grid-cols-2">
				{mesas.map((m) => (
					<div key={m.numero} className="bg-white rounded-2xl border-2 border-delicias p-4 text-center break-inside-avoid">
						<img src="/logo-las-delicias.webp" alt="" className="w-28 mx-auto rounded mb-2" />
						<img src={m.qr} alt={`QR de la mesa ${m.numero}`} className="w-full max-w-[180px] mx-auto" />
						<p className="text-2xl font-black text-delicias mt-2">Mesa {m.numero}</p>
						<p className="text-sm text-gray-600">Escanea, pide y te lo llevamos</p>
						<button onClick={() => regenerar(m.numero)} className="mt-2 text-xs text-gray-500 underline print:hidden">
							Generar QR nuevo
						</button>
					</div>
				))}
			</div>
		</div>
	);
}
