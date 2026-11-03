// Mesas: hoja imprimible de QR y gestión (añadir, renombrar, desactivar, regenerar código).
// Cada QR lleva un código secreto (/m/<token>), así nadie puede pedir "a otra mesa"
// cambiando un número en la URL.
import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { api } from "../../lib/api";
import { etiquetaMesa } from "../../lib/mesa";

interface Mesa {
	numero: number;
	nombre: string;
	token: string;
	activa: boolean;
	pedidos_en_curso: number;
}
type MesaConQr = Mesa & { url: string; qr: string };

async function conQr(m: Mesa): Promise<MesaConQr> {
	const url = `${window.location.origin}/m/${m.token}`;
	const qr = m.activa ? await QRCode.toDataURL(url, { width: 480, margin: 1, color: { dark: "#9E0034" } }) : "";
	return { ...m, url, qr };
}

export default function QrMesas({ esAdmin }: { esAdmin: boolean }) {
	const [mesas, setMesas] = useState<MesaConQr[]>([]);
	const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
	const [nuevoNombre, setNuevoNombre] = useState("");
	const [ocupado, setOcupado] = useState(false);

	const cargar = () =>
		api<Mesa[]>("/admin/mesas", { auth: true })
			.then(async (lista) => setMesas(await Promise.all(lista.map(conQr))))
			.catch((e) => setAviso({ tipo: "error", texto: e.message }));

	useEffect(() => {
		cargar();
	}, []);

	async function accion(fn: () => Promise<unknown>, textoOk: string) {
		setOcupado(true);
		setAviso(null);
		try {
			await fn();
			setAviso({ tipo: "ok", texto: textoOk });
			await cargar();
		} catch (e) {
			setAviso({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo completar" });
		} finally {
			setOcupado(false);
		}
	}

	function anadir(e: FormEvent) {
		e.preventDefault();
		const nombre = nuevoNombre.trim();
		accion(async () => {
			const m = await api<Mesa>("/admin/mesas", { metodo: "POST", cuerpo: nombre ? { nombre } : {}, auth: true });
			setNuevoNombre("");
			return m;
		}, "Mesa añadida. Imprime su QR y colócalo en la mesa.");
	}

	function renombrar(m: Mesa) {
		const nombre = window.prompt(`Nombre para ${etiquetaMesa(m.numero, m.nombre, { conNumero: true })} (p. ej. "Terraza 2"):`, m.nombre)?.trim();
		if (!nombre || nombre === m.nombre) return;
		accion(() => api(`/admin/mesas/${m.numero}`, { metodo: "PATCH", cuerpo: { nombre }, auth: true }), "Nombre actualizado.");
	}

	function cambiarActiva(m: Mesa, activa: boolean) {
		const etiqueta = etiquetaMesa(m.numero, m.nombre, { conNumero: true });
		if (!activa && !window.confirm(`¿Desactivar ${etiqueta}? Su QR dejará de funcionar hasta que la reactives.`)) return;
		accion(
			() => api(`/admin/mesas/${m.numero}`, { metodo: "PATCH", cuerpo: { activa }, auth: true }),
			activa ? `${etiqueta} reactivada: su QR anterior vuelve a funcionar.` : `${etiqueta} desactivada.`,
		);
	}

	function regenerar(m: Mesa) {
		const etiqueta = etiquetaMesa(m.numero, m.nombre, { conNumero: true });
		if (!window.confirm(`¿Generar un QR nuevo para ${etiqueta}? El QR impreso actual dejará de funcionar y habrá que imprimir el nuevo.`)) return;
		accion(
			() => api(`/admin/mesas/${m.numero}/regenerar`, { metodo: "POST", auth: true }),
			`${etiqueta}: QR nuevo listo. Imprímelo y sustituye el anterior.`,
		);
	}

	const activas = mesas.filter((m) => m.activa);
	const inactivas = mesas.filter((m) => !m.activa);

	return (
		<div className="max-w-5xl mx-auto p-4">
			<div className="flex flex-wrap items-center gap-3 mb-4 print:hidden">
				<p className="text-gray-600 flex-1 min-w-64">
					{activas.length} mesas activas. Imprime la hoja y coloca cada tarjeta en su mesa: al escanearla, el pedido llega a la barra con su nombre y número.
				</p>
				<button onClick={() => window.print()} className="px-4 py-2 rounded-lg bg-delicias text-white font-bold">
					Imprimir
				</button>
			</div>

			{esAdmin && (
				<form onSubmit={anadir} className="mb-4 p-3 rounded-xl bg-white shadow-sm flex flex-wrap items-center gap-2 print:hidden">
					<span className="font-semibold">Añadir mesa</span>
					<input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} maxLength={40}
						placeholder="Nombre opcional (p. ej. Terraza 1)" className="border rounded-lg px-3 py-2 bg-white flex-1 min-w-48" />
					<button disabled={ocupado} className="px-4 py-2 rounded-lg bg-gray-800 text-white font-bold disabled:opacity-50">
						+ Añadir
					</button>
				</form>
			)}

			{aviso && (
				<p className={`mb-4 p-3 rounded-lg print:hidden ${aviso.tipo === "ok" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`} role="status">
					{aviso.texto}
				</p>
			)}

			<div className="grid grid-cols-2 md:grid-cols-4 gap-4 print:grid-cols-2">
				{activas.map((m) => (
					<div key={m.numero} className="bg-white rounded-2xl border-2 border-delicias p-4 text-center break-inside-avoid flex flex-col">
						<img src="/logo-las-delicias.webp" alt="" className="w-28 mx-auto rounded mb-2" />
						<img src={m.qr} alt={`QR de ${etiquetaMesa(m.numero, m.nombre, { conNumero: true })}`} className="w-full max-w-[180px] mx-auto" />
						<p className="text-2xl font-black text-delicias mt-2">{etiquetaMesa(m.numero, m.nombre, { conNumero: true })}</p>
						<p className="text-sm text-gray-600">Escanea, pide y te lo llevamos</p>

						<div className="mt-3 pt-3 border-t flex flex-col gap-1 text-xs print:hidden">
							{m.pedidos_en_curso > 0 && (
								<span className="text-amber-700 font-semibold">{m.pedidos_en_curso} pedido(s) en curso</span>
							)}
							<div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
								{esAdmin && <button onClick={() => renombrar(m)} disabled={ocupado} className="text-gray-600 underline">Renombrar</button>}
								<button onClick={() => regenerar(m)} disabled={ocupado} className="text-gray-600 underline">QR nuevo</button>
								{esAdmin && <button onClick={() => cambiarActiva(m, false)} disabled={ocupado} className="text-red-700 underline">Desactivar</button>}
							</div>
						</div>
					</div>
				))}
			</div>

			{esAdmin && inactivas.length > 0 && (
				<section className="mt-8 print:hidden">
					<h2 className="font-bold mb-2 text-gray-700">Mesas desactivadas</h2>
					<ul className="bg-white rounded-xl shadow-sm divide-y">
						{inactivas.map((m) => (
							<li key={m.numero} className="flex items-center gap-3 p-3">
								<span className="flex-1">
									<b>{etiquetaMesa(m.numero, m.nombre, { conNumero: true })}</b>
								</span>
								<button onClick={() => cambiarActiva(m, true)} disabled={ocupado}
									className="px-3 py-1.5 rounded-lg bg-gray-100 font-semibold">
									Reactivar
								</button>
							</li>
						))}
					</ul>
				</section>
			)}
		</div>
	);
}
