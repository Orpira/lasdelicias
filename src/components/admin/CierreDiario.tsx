import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Download, LockKeyhole, Printer, RefreshCw, Save } from "lucide-react";
import { Link } from "react-router-dom";
import { api, apiArchivo, ErrorApi, euros } from "../../lib/api";
import type { CifrasCierre, GrupoCierre, InformeCierre } from "../../types/cierre";

function fechaMadrid() {
	const partes = Object.fromEntries(new Intl.DateTimeFormat("es-ES", {
		timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
	}).formatToParts(new Date()).map((parte) => [parte.type, parte.value]));
	return `${partes.year}-${partes.month}-${partes.day}`;
}

export default function CierreDiario({ esAdmin, alCaducar }: { esAdmin: boolean; alCaducar: () => void }) {
	const [fecha, setFecha] = useState(fechaMadrid);
	const [informe, setInforme] = useState<InformeCierre | null>(null);
	const [cargando, setCargando] = useState(true);
	const [accion, setAccion] = useState<"criterio" | "cierre" | "csv" | null>(null);
	const [revision, setRevision] = useState(0);
	const [error, setError] = useState("");
	const [aviso, setAviso] = useState("");
	const mostrarError = useCallback((fallo: unknown) => {
		if (fallo instanceof ErrorApi && fallo.status === 401) alCaducar();
		setError(fallo instanceof Error ? fallo.message : "No se pudo completar la operación.");
	}, [alCaducar]);

	useEffect(() => {
		let vigente = true;
		async function cargar() {
			setCargando(true);
			setError("");
			try {
				const datos = await api<InformeCierre>(`/admin/cierres/${fecha}`, { auth: true });
				if (vigente) setInforme(datos);
			} catch (fallo) {
				if (vigente) { setInforme(null); mostrarError(fallo); }
			} finally {
				if (vigente) setCargando(false);
			}
		}
		void cargar();
		return () => { vigente = false; };
	}, [fecha, revision, mostrarError]);

	const resumen = informe?.resumen;
	const ocupado = cargando || accion !== null;

	async function guardar() {
		if (!window.confirm(`¿Guardar el cierre del ${fecha}? Solo contará pedidos cobrados.`)) return;
		setAccion("cierre"); setError(""); setAviso("");
		try {
			let datos: InformeCierre;
			try {
				datos = await api<InformeCierre>("/admin/cierres", { metodo: "POST", auth: true, cuerpo: { fecha } });
			} catch (fallo) {
				if (!(fallo instanceof ErrorApi) || fallo.status !== 409 || !window.confirm(`${fallo.message}\n\n¿Forzar el cierre?`)) throw fallo;
				datos = await api<InformeCierre>("/admin/cierres", { metodo: "POST", auth: true, cuerpo: { fecha, forzar: true } });
			}
			setInforme(datos);
			setAviso(`Cierre guardado con: ${datos.resumen.criterio.descripcion}.`);
		} catch (fallo) { mostrarError(fallo); }
		finally { setAccion(null); }
	}

	async function descargar() {
		setAccion("csv"); setError("");
		try {
			const archivo = await apiArchivo(`/admin/cierres/${fecha}/csv`, { auth: true });
			const url = URL.createObjectURL(archivo);
			const enlace = document.createElement("a");
			try {
				enlace.href = url; enlace.download = `cierre-${fecha}.csv`;
				document.body.appendChild(enlace); enlace.click();
			} finally {
				enlace.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
			}
		} catch (fallo) { mostrarError(fallo); }
		finally { setAccion(null); }
	}

	return (
		<div className="mx-auto max-w-6xl p-4 text-tinta md:p-6 print:max-w-none print:p-0">
			<header className="mb-5 flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-titular">
						<CalendarDays className="h-7 w-7 text-delicias" aria-hidden="true" /> Cierre diario
					</h1>
					<p className="mt-1 text-sm text-tinta/70">Las Delicias · Fecha y horas de Madrid</p>
				</div>
				<div className="flex flex-wrap items-end gap-2 print:hidden">
					<label className="text-sm font-bold" htmlFor="fecha-cierre">Fecha
						<input id="fecha-cierre" type="date" value={fecha} max={informe?.hoy ?? fechaMadrid()} disabled={accion !== null}
							onChange={(evento) => { setFecha(evento.target.value); setInforme(null); setAviso(""); }}
							className="mt-1 block min-h-[44px] rounded-lg border border-delicias/20 bg-white px-3 font-normal" />
					</label>
					<button onClick={() => setRevision((actual) => actual + 1)} disabled={ocupado || !fecha}
						className="flex min-h-[44px] items-center gap-2 rounded-lg border border-delicias/20 bg-white px-3 font-bold disabled:opacity-50">
						<RefreshCw className="h-4 w-4" aria-hidden="true" /> Actualizar
					</button>
				</div>
			</header>
			{cargando && <p role="status" className="mb-4 text-sm print:hidden">Calculando el informe…</p>}
			{error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 print:hidden">{error}</p>}
			{aviso && <p role="status" className="mb-4 rounded-xl bg-green-50 p-4 font-semibold text-green-800 print:hidden">{aviso}</p>}

			{informe && resumen && <article aria-label="Informe de cierre diario" className="rounded-2xl border border-delicias/15 bg-white p-4 shadow-sm md:p-6 print:border-0 print:p-0 print:shadow-none">
				{(() => {
					const pendientes = resumen.pendiente_cobro;
					const pedidosPendientes = pendientes.pedidos ?? [];
					const cuentasPendientes = pendientes.cuentas ?? [];
					return <>
				<p className="mb-4 flex items-center gap-2 font-bold text-delicias">
					{informe.guardado ? <LockKeyhole className="h-5 w-5" aria-hidden="true" /> : <CalendarDays className="h-5 w-5" aria-hidden="true" />}
					{informe.guardado ? "Cierre guardado" : "Vista previa sin guardar"}
				</p>
				<p className="mb-4 rounded-xl border border-delicias/15 bg-merengue/30 p-4 font-semibold print:hidden">
					Las ventas del cierre cuentan cuando el pedido está cobrado.
				</p>
				<p className="mb-4 rounded-xl bg-merengue/50 p-4 font-bold">{informe.guardado ? "Calculado con: " : "Criterio aplicado: "}{resumen.criterio.descripcion}</p>
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					<Destacado titulo="Total de ventas" valor={euros(resumen.totales.importe)} />
					<Destacado titulo="Cobrado en caja" valor={euros(resumen.cobro.total_cobrado)} />
					<Destacado titulo="Pendiente de cobro" valor={euros(resumen.pendiente_cobro.entregados_sin_cobrar.importe + resumen.pendiente_cobro.cuentas_abiertas.importe)} rojo={resumen.pendiente_cobro.entregados_sin_cobrar.pedidos + resumen.pendiente_cobro.cuentas_abiertas.pedidos > 0} />
					<Destacado titulo="Pedidos que cuentan" valor={String(resumen.totales.pedidos)} />
				</div>
				<p className="mt-4 rounded-xl border border-delicias/15 p-4"><strong>Desglose:</strong> Entregados: {resumen.entregados.pedidos} ({euros(resumen.entregados.importe)}) · Listos sin recoger: {resumen.listos_sin_recoger.pedidos} ({euros(resumen.listos_sin_recoger.importe)})</p>
				<div className="mt-3 grid gap-3 sm:grid-cols-2">
					<p className="rounded-xl border border-delicias/15 p-4"><strong>Cobro:</strong> {resumen.cobro.por_metodo.map((fila) => `${fila.metodo}: ${fila.pedidos} (${euros(fila.importe)})`).join(" · ")}</p>
					<p className="rounded-xl border border-delicias/15 p-4"><strong>Otros:</strong> En curso {resumen.en_curso.pedidos} · Cancelados {resumen.cancelados.pedidos}</p>
				</div>
				{(resumen.pendiente_cobro.entregados_sin_cobrar.pedidos || resumen.pendiente_cobro.cuentas_abiertas.pedidos) > 0 && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
					<strong>Pendiente de cobro:</strong> {resumen.pendiente_cobro.entregados_sin_cobrar.pedidos} entregados y {resumen.pendiente_cobro.cuentas_abiertas.pedidos} cuentas abiertas. <Link className="font-bold underline" to="/admin/barra">Ir a Barra para cobrar</Link>
				</p>}
				{(pedidosPendientes.length || cuentasPendientes.length) > 0 && <section className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
					<h2 className="font-extrabold">Detalle de pendientes de cobro</h2>
					<div className="mt-2 grid gap-2 sm:grid-cols-2">
						{pedidosPendientes.map((pedido) => <p key={pedido.id} className="rounded-lg bg-white p-3">
							<strong>Pedido #{pedido.numero_dia}</strong> · {pedido.nombre_cliente} · {pedido.tipo === "whatsapp" ? "WhatsApp" : pedido.tipo === "recoger" ? "Para recoger" : "Mesa"} · <strong>{euros(pedido.total)}</strong>
						</p>)}
						{cuentasPendientes.map((cuenta) => <p key={cuenta.id} className="rounded-lg bg-white p-3">
							<strong>Cuenta mesa {cuenta.mesa_numero}</strong> · <strong>{euros(cuenta.total)}</strong>
						</p>)}
					</div>
				</section>}
				{resumen.anuladas.cuentas > 0 && <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-4">
					<strong>Cuentas anuladas:</strong> {resumen.anuladas.detalle.map((cuenta) => `Mesa ${cuenta.mesa_numero}: ${cuenta.motivo ?? "sin motivo"}`).join(" · ")}
				</div>}
				<div className="mt-6 grid gap-6 lg:grid-cols-2">
					<TablaVentas titulo="Ventas por tipo" filas={resumen.por_tipo} />
					<TablaVentas titulo="Ventas por categoría" filas={resumen.por_categoria} />
				</div>
				<section className="mt-6">
					<h2 className="mb-2 text-xl font-extrabold tracking-titular">Ventas por producto</h2>
					{resumen.por_producto.length === 0 ? <p className="text-sm text-tinta/70">No hay ventas con este criterio.</p> : <table className="w-full table-fixed text-left text-sm">
						<thead><tr className="border-b border-delicias/20"><th className="py-2">Artículo</th><th className="w-16 py-2 text-right">Unidades</th><th className="w-24 py-2 text-right">Importe</th></tr></thead>
						<tbody>{resumen.por_producto.map((fila) => <tr key={`${fila.producto_id}-${fila.nombre}-${fila.categoria}`} className="break-inside-avoid border-b border-delicias/10"><th className="break-words py-3 pr-2 font-semibold">{fila.nombre}<span className="mt-1 block text-xs font-normal text-tinta/70">{fila.categoria}</span></th><td className="py-3 text-right">{fila.unidades}</td><td className="py-3 text-right">{euros(fila.importe)}</td></tr>)}</tbody>
					</table>}
				</section>
				<HorasVentas filas={resumen.por_hora} />
				{informe.cerrado_at && <p className="mt-5 text-sm text-tinta/70">Guardado el {new Date(informe.cerrado_at).toLocaleString("es-ES", { timeZone: resumen.zona_horaria })} · {informe.origen === "n8n" ? "Automatización n8n" : "Administración"}</p>}
					</>;
				})()}
			</article>}
			{informe && <div className="mt-5 flex flex-wrap gap-3 print:hidden">
				{esAdmin && !informe.guardado && <button onClick={guardar} disabled={ocupado}
					className="flex min-h-[44px] items-center gap-2 rounded-xl bg-delicias px-4 py-3 font-bold text-white disabled:opacity-50"><Save className="h-5 w-5" aria-hidden="true" /> {accion === "cierre" ? "Guardando cierre…" : "Guardar cierre"}</button>}
				<button onClick={descargar} disabled={ocupado} className="flex min-h-[44px] items-center gap-2 rounded-xl border border-delicias/20 bg-white px-4 py-3 font-bold disabled:opacity-50"><Download className="h-5 w-5" aria-hidden="true" /> Descargar CSV</button>
				<button onClick={() => window.print()} disabled={ocupado} className="flex min-h-[44px] items-center gap-2 rounded-xl border border-delicias/20 bg-white px-4 py-3 font-bold disabled:opacity-50"><Printer className="h-5 w-5" aria-hidden="true" /> Imprimir informe</button>
			</div>}
		</div>
	);
}

function Destacado({ titulo, valor, rojo = false }: { titulo: string; valor: string; rojo?: boolean }) {
	return <div className={`rounded-xl p-4 ${rojo ? "border border-red-200 bg-red-50 text-red-800" : "bg-merengue"}`}><h2 className="text-sm font-semibold">{titulo}</h2><p className="mt-1 break-words text-3xl font-extrabold">{valor}</p></div>;
}

function TablaVentas({ titulo, filas }: { titulo: string; filas: GrupoCierre[] }) {
	return <section><h2 className="mb-2 text-xl font-extrabold tracking-titular">{titulo}</h2>{filas.length === 0 ? <p className="text-sm text-tinta/70">No hay ventas con este criterio.</p> : <table className="w-full table-fixed text-left text-sm"><thead><tr className="border-b border-delicias/20"><th className="py-2">Grupo</th><th className="w-16 py-2 text-right">Pedidos</th><th className="w-24 py-2 text-right">Importe</th></tr></thead><tbody>{filas.map((fila) => <tr key={fila.nombre} className="border-b border-delicias/10"><th className="break-words py-3 pr-2">{fila.nombre}</th><td className="py-3 text-right">{fila.pedidos}</td><td className="py-3 text-right">{euros(fila.importe)}</td></tr>)}</tbody></table>}</section>;
}

function HorasVentas({ filas }: { filas: (CifrasCierre & { hora: number })[] }) {
	const activas = filas.filter((fila) => fila.pedidos > 0 || Number(fila.importe) > 0);
	const pico = activas.reduce<(CifrasCierre & { hora: number }) | null>(
		(anterior, fila) => !anterior || fila.importe > anterior.importe ? fila : anterior,
		null,
	);
	const maximo = Math.max(...activas.map((fila) => Number(fila.importe)), 1);

	return <section className="mt-6 rounded-2xl border border-delicias/15 bg-merengue/30 p-4 md:p-5 print:border-0 print:bg-transparent print:p-0">
		<div className="flex flex-wrap items-end justify-between gap-2">
			<div>
				<h2 className="text-xl font-extrabold tracking-titular">Ritmo de ventas</h2>
				<p className="mt-1 text-sm text-tinta/70">{activas.length ? `${activas.length} franjas con actividad` : "Sin ventas registradas por hora"}</p>
			</div>
			{pico && <p className="rounded-full bg-white px-3 py-1 text-sm font-bold text-delicias shadow-sm">Pico: {String(pico.hora).padStart(2, "0")}:00 · {euros(pico.importe)}</p>}
		</div>
		{activas.length > 0 && <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
			{activas.map((fila) => <div key={fila.hora} className="rounded-xl border border-delicias/10 bg-white p-3 shadow-sm">
				<div className="flex items-center justify-between gap-3 text-sm">
					<strong>{String(fila.hora).padStart(2, "0")}:00</strong>
					<span className="font-semibold">{fila.pedidos} {fila.pedidos === 1 ? "pedido" : "pedidos"}</span>
				</div>
				<div className="mt-2 h-2 overflow-hidden rounded-full bg-merengue" aria-hidden="true">
					<div className="h-full rounded-full bg-delicias transition-all" style={{ width: `${Math.max(8, Number(fila.importe) / maximo * 100)}%` }} />
				</div>
				<p className="mt-2 text-right text-lg font-extrabold">{euros(fila.importe)}</p>
			</div>)}
		</div>}
	</section>;
}
