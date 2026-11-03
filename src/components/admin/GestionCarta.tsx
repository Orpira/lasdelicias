// Carta: el personal marca agotado/disponible; administración edita productos y fotos
import { useEffect, useState, type FormEvent } from "react";
import { api, euros } from "../../lib/api";
import { CATEGORIAS, type Categoria, type Producto } from "../../types/producto";

type Formulario = Omit<Producto, "id">;

const VACIO: Formulario = {
	nombre: "",
	descripcion: "",
	precio: 0,
	categoria: "Desayunos",
	valoracion: 5,
	imagen_url: "",
	sin_gluten: false,
	alergenos: [],
	disponible: true,
	orden: 0,
	stock: null,
	stock_minimo: 0,
	codigo_tpv: null,
};

interface EstadoTpv {
	proveedor: string;
	configurado: boolean;
	intervalo_min: number;
	productos_enlazados: number;
	ultimas: { origen: string; ok: boolean; actualizados: number; sin_enlazar: number; mensaje: string; created_at: string }[];
}

export default function GestionCarta({ esAdmin }: { esAdmin: boolean }) {
	const [productos, setProductos] = useState<Producto[]>([]);
	const [form, setForm] = useState<Formulario>(VACIO);
	const [editId, setEditId] = useState<string | null>(null);
	const [abierto, setAbierto] = useState(false);
	const [subiendo, setSubiendo] = useState(false);
	const [error, setError] = useState("");
	const [filtro, setFiltro] = useState<Categoria | "Todas">("Todas");

	const [tpv, setTpv] = useState<EstadoTpv | null>(null);

	const cargar = () => api<Producto[]>("/admin/productos", { auth: true }).then(setProductos).catch((e) => setError(e.message));
	const cargarTpv = () => esAdmin && api<EstadoTpv>("/admin/tpv", { auth: true }).then(setTpv).catch(() => {});
	useEffect(() => {
		cargar();
		cargarTpv();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	async function sincronizarTpv() {
		try {
			await api("/admin/tpv/sincronizar", { metodo: "POST", auth: true });
			cargar();
		} catch (e) {
			setError(e instanceof Error ? e.message : "No se pudo sincronizar");
		}
		cargarTpv();
	}

	async function alternarDisponible(p: Producto) {
		setProductos((prev) => prev.map((x) => (x.id === p.id ? { ...x, disponible: !p.disponible } : x)));
		try {
			await api(`/admin/productos/${p.id}/disponible`, { metodo: "PATCH", cuerpo: { disponible: !p.disponible }, auth: true });
		} catch (e) {
			setError(e instanceof Error ? e.message : "Error");
			cargar();
		}
	}

	async function subirFoto(archivo: File) {
		setSubiendo(true);
		try {
			const fd = new FormData();
			fd.append("imagen", archivo);
			const r = await api<{ url: string }>("/admin/imagenes", { metodo: "POST", formData: fd, auth: true });
			setForm((f) => ({ ...f, imagen_url: r.url }));
		} catch (e) {
			setError(e instanceof Error ? e.message : "No se pudo subir la foto");
		} finally {
			setSubiendo(false);
		}
	}

	async function guardar(e: FormEvent) {
		e.preventDefault();
		setError("");
		try {
			if (editId) await api(`/admin/productos/${editId}`, { metodo: "PUT", cuerpo: form, auth: true });
			else await api("/admin/productos", { metodo: "POST", cuerpo: form, auth: true });
			cerrar();
			cargar();
		} catch (err) {
			setError(err instanceof Error ? err.message : "No se pudo guardar");
		}
	}

	async function retirar(p: Producto) {
		if (!window.confirm(`¿Retirar "${p.nombre}" de la carta?`)) return;
		try {
			await api(`/admin/productos/${p.id}`, { metodo: "DELETE", auth: true });
			cargar();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Error");
		}
	}

	function editar(p: Producto) {
		const { id, ...resto } = p;
		setForm({ ...VACIO, ...resto });
		setEditId(id);
		setAbierto(true);
	}

	function cerrar() {
		setForm(VACIO);
		setEditId(null);
		setAbierto(false);
	}

	const visibles = productos.filter((p) => filtro === "Todas" || p.categoria === filtro);

	return (
		<div className="max-w-5xl mx-auto p-4">
			<div className="flex flex-wrap items-center gap-2 mb-4">
				{(["Todas", ...CATEGORIAS.map((c) => c.nombre)] as const).map((c) => (
					<button key={c} onClick={() => setFiltro(c)}
						className={`px-3 py-1.5 rounded-full text-sm font-semibold ${filtro === c ? "bg-delicias text-white" : "bg-white"}`}>
						{c}
					</button>
				))}
				{esAdmin && (
					<button onClick={() => { cerrar(); setAbierto(true); }} className="ml-auto px-4 py-2 rounded-lg bg-delicias text-white font-bold">
						+ Nuevo producto
					</button>
				)}
			</div>
			{error && <p className="mb-3 text-red-600" role="alert">{error}</p>}

			{esAdmin && tpv && (
				<div className="mb-4 p-3 rounded-xl bg-white shadow-sm flex flex-wrap items-center gap-3 text-sm">
					<span className="font-bold">🧾 Caja (TPV):</span>
					{tpv.proveedor === "ninguno" ? (
						<span className="text-gray-600">sin conexión directa — stock de envasados gestionado aquí{tpv.ultimas[0] ? " y por n8n" : ""}</span>
					) : (
						<span className={tpv.configurado ? "text-gray-700" : "text-red-600"}>
							{tpv.proveedor} · cada {tpv.intervalo_min} min{tpv.configurado ? "" : " · faltan credenciales"}
						</span>
					)}
					<span className="text-gray-500">{tpv.productos_enlazados} productos enlazados</span>
					{tpv.ultimas[0] && (
						<span className={tpv.ultimas[0].ok ? "text-green-700" : "text-red-600"}>
							Última: {new Date(tpv.ultimas[0].created_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" })} ·{" "}
							{tpv.ultimas[0].ok
								? `${tpv.ultimas[0].actualizados} actualizados${tpv.ultimas[0].sin_enlazar ? `, ${tpv.ultimas[0].sin_enlazar} sin enlazar` : ""}`
								: tpv.ultimas[0].mensaje}
						</span>
					)}
					{tpv.proveedor !== "ninguno" && (
						<button onClick={sincronizarTpv} className="ml-auto px-3 py-1.5 rounded-lg bg-gray-100 font-semibold">Sincronizar ahora</button>
					)}
				</div>
			)}

			{abierto && esAdmin && (
				<form onSubmit={guardar} className="bg-white rounded-2xl shadow p-5 mb-6 grid sm:grid-cols-2 gap-3">
					<h2 className="sm:col-span-2 text-lg font-bold">{editId ? "Editar producto" : "Nuevo producto"}</h2>
					<label className="flex flex-col gap-1 text-sm font-semibold">Nombre
						<input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required maxLength={80} className="border rounded-lg px-3 py-2 font-normal bg-white" />
					</label>
					<label className="flex flex-col gap-1 text-sm font-semibold">Categoría
						<select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value as Categoria })} className="border rounded-lg px-3 py-2 font-normal bg-white">
							{CATEGORIAS.map((c) => <option key={c.nombre} value={c.nombre}>{c.emoji} {c.nombre}</option>)}
						</select>
					</label>
					<label className="sm:col-span-2 flex flex-col gap-1 text-sm font-semibold">Descripción
						<textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} maxLength={300} rows={2} className="border rounded-lg px-3 py-2 font-normal bg-white" />
					</label>
					<label className="flex flex-col gap-1 text-sm font-semibold">Precio (€)
						<input type="number" step="0.05" min={0} value={form.precio} onChange={(e) => setForm({ ...form, precio: Number(e.target.value) })} required className="border rounded-lg px-3 py-2 font-normal bg-white" />
					</label>
					<label className="flex flex-col gap-1 text-sm font-semibold">Alérgenos (separados por comas)
						<input value={form.alergenos.join(", ")} onChange={(e) => setForm({ ...form, alergenos: e.target.value.split(",").map((a) => a.trim()).filter(Boolean) })}
							placeholder="gluten, huevo, lácteos" className="border rounded-lg px-3 py-2 font-normal bg-white" />
					</label>
					<fieldset className="sm:col-span-2 grid sm:grid-cols-3 gap-3 p-3 rounded-lg bg-gray-50">
						<legend className="text-sm font-semibold px-1">Stock (solo envasados: refrescos, agua, paquetes…)</legend>
						<label className="flex flex-col gap-1 text-sm font-semibold">Unidades
							<input type="number" min={0} value={form.stock ?? ""} placeholder="Sin control"
								onChange={(e) => setForm({ ...form, stock: e.target.value === "" ? null : Number(e.target.value) })}
								className="border rounded-lg px-3 py-2 font-normal bg-white" />
						</label>
						<label className="flex flex-col gap-1 text-sm font-semibold">Aviso con menos de
							<input type="number" min={0} value={form.stock_minimo ?? 0}
								onChange={(e) => setForm({ ...form, stock_minimo: Number(e.target.value) })}
								className="border rounded-lg px-3 py-2 font-normal bg-white" />
						</label>
						<label className="flex flex-col gap-1 text-sm font-semibold">Código en la caja
							<input value={form.codigo_tpv ?? ""} placeholder="Opcional" maxLength={64}
								onChange={(e) => setForm({ ...form, codigo_tpv: e.target.value || null })}
								className="border rounded-lg px-3 py-2 font-normal bg-white" />
						</label>
					</fieldset>
					<label className="flex items-center gap-2 text-sm font-semibold">
						<input type="checkbox" checked={form.sin_gluten} onChange={(e) => setForm({ ...form, sin_gluten: e.target.checked })} /> Sin gluten
					</label>
					<label className="flex items-center gap-2 text-sm font-semibold">
						<input type="checkbox" checked={form.disponible} onChange={(e) => setForm({ ...form, disponible: e.target.checked })} /> Disponible ahora
					</label>
					<div className="sm:col-span-2 flex items-center gap-4">
						{form.imagen_url ? <img src={form.imagen_url} alt="" className="w-24 h-24 object-cover rounded-lg" /> : <div className="w-24 h-24 rounded-lg bg-gray-100" />}
						<label className="px-4 py-2 rounded-lg bg-gray-100 font-semibold cursor-pointer hover:bg-gray-200">
							{subiendo ? "Subiendo…" : "Subir foto"}
							<input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
								onChange={(e) => e.target.files?.[0] && subirFoto(e.target.files[0])} />
						</label>
						{form.imagen_url && <button type="button" onClick={() => setForm({ ...form, imagen_url: "" })} className="text-sm text-gray-500 underline">Quitar foto</button>}
					</div>
					<div className="sm:col-span-2 flex gap-2 justify-end">
						<button type="button" onClick={cerrar} className="px-4 py-2 rounded-lg bg-gray-100 font-semibold">Cancelar</button>
						<button disabled={subiendo} className="px-6 py-2 rounded-lg bg-delicias text-white font-bold disabled:opacity-60">Guardar</button>
					</div>
				</form>
			)}

			<ul className="bg-white rounded-2xl shadow divide-y">
				{visibles.map((p) => (
					<li key={p.id} className="flex items-center gap-3 p-3">
						{p.imagen_url ? <img src={p.imagen_url} alt="" className="w-14 h-14 object-cover rounded-lg" /> : <div className="w-14 h-14 rounded-lg bg-gray-100" />}
						<div className="flex-1 min-w-0">
							<p className="font-semibold truncate">{p.nombre}</p>
							<p className="text-sm text-gray-500">
								{p.categoria} · {euros(p.precio)}
								{p.stock != null && (
									<span className={`ml-2 font-semibold ${p.stock <= (p.stock_minimo ?? 0) ? "text-orange-600" : "text-gray-700"}`}>
										· {p.stock} uds.
									</span>
								)}
								{p.codigo_tpv && <span className="ml-2 text-xs text-gray-400">🧾 {p.codigo_tpv}</span>}
							</p>
						</div>
						<button onClick={() => alternarDisponible(p)}
							className={`px-3 py-2 rounded-lg text-sm font-bold min-w-28 ${p.disponible ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>
							{p.disponible ? "Disponible" : "Agotado"}
						</button>
						{esAdmin && (
							<>
								<button onClick={() => editar(p)} className="px-3 py-2 rounded-lg bg-gray-100 text-sm font-semibold">Editar</button>
								<button onClick={() => retirar(p)} className="px-3 py-2 rounded-lg bg-gray-100 text-sm text-red-700" title="Retirar de la carta">✕</button>
							</>
						)}
					</li>
				))}
			</ul>
		</div>
	);
}
