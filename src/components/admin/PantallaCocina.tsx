// Pantalla de cocina para tablet: comandas por orden de llegada, filtradas por puesto.
// Cada línea se tacha al tocarla; "Listo" avisa a barra y al cliente.
import { useEffect, useMemo, useState } from "react";
import { hora } from "../../lib/api";
import { minutosDesde, porLlegada, useAhora, usePantallaEncendida, usePedidosEnVivo } from "../../lib/pedidosEnVivo";
import type { Categoria, LineaPedido, Pedido } from "../../types/producto";
import { etiquetaMesa } from "../../lib/mesa";

type Puesto = "todo" | "cocina" | "barra" | "pasteleria";

const PUESTOS: { id: Puesto; texto: string; categorias: Categoria[] | null }[] = [
	{ id: "todo", texto: "Todo", categorias: null },
	{ id: "cocina", texto: "🍳 Cocina", categorias: ["Comida casera", "Almuerzos", "Desayunos"] },
	{ id: "barra", texto: "☕ Barra", categorias: ["Bebidas"] },
	{ id: "pasteleria", texto: "🧁 Pastelería", categorias: ["Pastelería"] },
];

const CLAVE_PUESTO = "delicias.cocina.puesto";
const CLAVE_HECHOS = "delicias.cocina.hechos";

function leer<T>(clave: string, porDefecto: T): T {
	try {
		return JSON.parse(localStorage.getItem(clave) ?? "null") ?? porDefecto;
	} catch {
		return porDefecto;
	}
}
function guardar(clave: string, valor: unknown) {
	try {
		localStorage.setItem(clave, JSON.stringify(valor));
	} catch {
		/* ignorar */
	}
}

function colorTiempo(min: number) {
	if (min < 5) return "bg-green-600";
	if (min < 10) return "bg-amber-500";
	return "bg-red-600 animate-pulse";
}

export default function PantallaCocina({ alCaducar }: { alCaducar: () => void }) {
	const { pedidos, conectado, error, setError, mover } = usePedidosEnVivo(alCaducar);
	const ahora = useAhora(15_000);
	usePantallaEncendida();

	const [puesto, setPuesto] = useState<Puesto>(() => leer<Puesto>(CLAVE_PUESTO, "todo"));
	// Líneas tachadas: "idPedido:índice" (se conservan si se recarga la tablet)
	const [hechos, setHechos] = useState<Record<string, true>>(() => leer(CLAVE_HECHOS, {}));

	useEffect(() => guardar(CLAVE_PUESTO, puesto), [puesto]);
	useEffect(() => guardar(CLAVE_HECHOS, hechos), [hechos]);

	const categorias = PUESTOS.find((p) => p.id === puesto)!.categorias;
	const deEstePuesto = (it: LineaPedido) => !categorias || (it.categoria != null && categorias.includes(it.categoria));

	// Comandas pendientes de este puesto, por orden de llegada
	const comandas = useMemo(
		() =>
			pedidos
				.filter((p) => p.estado === "nuevo" || p.estado === "preparando")
				.map((p) => ({ pedido: p, lineas: p.items.map((it, i) => ({ it, i })).filter(({ it }) => deEstePuesto(it)) }))
				.filter((c) => c.lineas.length > 0)
				.sort((a, b) => porLlegada(a.pedido, b.pedido)),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[pedidos, puesto],
	);

	// Resumen de producción: cuánto hay que preparar de cada cosa (sin lo ya tachado)
	const resumen = useMemo(() => {
		const total = new Map<string, number>();
		for (const { pedido, lineas } of comandas) {
			for (const { it, i } of lineas) {
				if (hechos[`${pedido.id}:${i}`]) continue;
				total.set(it.nombre, (total.get(it.nombre) ?? 0) + it.cantidad);
			}
		}
		return [...total.entries()].sort((a, b) => b[1] - a[1]);
	}, [comandas, hechos]);

	function alternar(pedido: Pedido, i: number) {
		const clave = `${pedido.id}:${i}`;
		setHechos((prev) => {
			const nuevo = { ...prev };
			if (nuevo[clave]) delete nuevo[clave];
			else nuevo[clave] = true;
			return nuevo;
		});
		// Al empezar a tachar, el pedido pasa a "preparando" (el cliente lo ve)
		if (pedido.estado === "nuevo") mover(pedido, "preparando");
	}

	function terminar(pedido: Pedido) {
		mover(pedido, "listo");
		setHechos((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(`${pedido.id}:`))) as Record<string, true>);
	}

	function pantallaCompleta() {
		if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
		else document.documentElement.requestFullscreen?.().catch(() => {});
	}

	return (
		<div className="min-h-[calc(100vh-64px)] bg-gray-900 text-white p-3 flex flex-col gap-3">
			{/* Barra superior: puesto, estado, pantalla completa */}
			<div className="flex flex-wrap items-center gap-2">
				{PUESTOS.map((p) => (
					<button key={p.id} onClick={() => setPuesto(p.id)}
						className={`px-4 py-2 rounded-lg font-bold text-lg ${puesto === p.id ? "bg-white text-gray-900" : "bg-gray-700 text-gray-200"}`}>
						{p.texto}
					</button>
				))}
				<span className={`ml-auto flex items-center gap-2 font-semibold ${conectado ? "text-green-400" : "text-red-400"}`}>
					<span className={`w-3 h-3 rounded-full ${conectado ? "bg-green-400" : "bg-red-500 animate-pulse"}`} />
					{conectado ? "En directo" : "Reconectando…"}
				</span>
				<span className="text-2xl font-black tabular-nums">{hora(new Date(ahora).toISOString())}</span>
				<button onClick={pantallaCompleta} className="px-3 py-2 rounded-lg bg-gray-700" title="Pantalla completa">⛶</button>
			</div>

			{error && <button onClick={() => setError("")} className="text-left text-red-300 underline">{error}</button>}

			{/* Resumen de producción */}
			{resumen.length > 0 && (
				<div className="flex flex-wrap gap-2">
					{resumen.map(([nombre, n]) => (
						<span key={nombre} className="px-3 py-1.5 rounded-full bg-gray-700 text-lg">
							<b className="text-amber-300">{n}×</b> {nombre}
						</span>
					))}
				</div>
			)}

			{/* Comandas en fila, por orden de llegada */}
			{comandas.length === 0 ? (
				<div className="flex-1 flex items-center justify-center text-3xl text-gray-500">Sin comandas pendientes 👌</div>
			) : (
				<div className="flex-1 flex gap-3 overflow-x-auto pb-2 snap-x">
					{comandas.map(({ pedido, lineas }, pos) => {
						const min = minutosDesde(pedido.created_at, ahora);
						const todasHechas = lineas.every(({ i }) => hechos[`${pedido.id}:${i}`]);
						return (
							<article key={pedido.id} className="snap-start shrink-0 w-72 bg-white text-gray-900 rounded-xl flex flex-col overflow-hidden">
								<header className={`${colorTiempo(min)} text-white px-3 py-2 flex items-center justify-between`}>
									<span className="text-sm font-bold opacity-90">{pos + 1}.º</span>
									<span className="text-3xl font-black">#{pedido.numero_dia}</span>
									<span className="text-lg font-bold tabular-nums">{min}′</span>
								</header>
								<div className="px-3 py-2 border-b text-lg font-bold">
									{pedido.tipo === "mesa" && pedido.mesa_numero !== null && `🪑 ${etiquetaMesa(pedido.mesa_numero, pedido.mesa_nombre, { conNumero: true })}`}
									{pedido.tipo === "recoger" && `🛍️ Llevar${pedido.hora_recogida ? ` · ${hora(pedido.hora_recogida)}` : ""}`}
									{pedido.tipo === "whatsapp" && `💬 WhatsApp${pedido.hora_recogida ? ` · ${hora(pedido.hora_recogida)}` : ""}`}
									<span className="block text-sm font-normal text-gray-500">{pedido.nombre_cliente} · llegó {hora(pedido.created_at)}</span>
								</div>
								<ul className="flex-1 divide-y">
									{lineas.map(({ it, i }) => {
										const hecho = Boolean(hechos[`${pedido.id}:${i}`]);
										return (
											<li key={i}>
												<button onClick={() => alternar(pedido, i)}
													className={`w-full text-left px-3 py-3 text-xl flex gap-3 items-start ${hecho ? "bg-green-50 text-gray-400 line-through" : ""}`}>
													<span className="font-black min-w-8">{it.cantidad}×</span>
													<span className="flex-1">{it.nombre}</span>
													<span>{hecho ? "✅" : "⬜"}</span>
												</button>
											</li>
										);
									})}
								</ul>
								{pedido.notas && <p className="mx-3 mb-2 p-2 rounded bg-yellow-100 text-base font-semibold">📝 {pedido.notas}</p>}
								<button onClick={() => terminar(pedido)}
									className={`m-3 py-4 rounded-lg text-xl font-black ${todasHechas ? "bg-green-600 text-white" : "bg-gray-200 text-gray-600"}`}>
									Listo ✓
								</button>
							</article>
						);
					})}
				</div>
			)}
		</div>
	);
}
