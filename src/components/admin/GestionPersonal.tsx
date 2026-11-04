import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, ErrorApi } from "../../lib/api";

type Rol = "admin" | "barra";
type Personal = {
	id: string;
	email: string;
	nombre: string;
	rol: Rol;
	activo: boolean;
	created_at: string;
};

type Formulario = {
	email: string;
	nombre: string;
	password: string;
	rol: Rol;
	activo: boolean;
};

const VACIO: Formulario = { email: "", nombre: "", password: "", rol: "barra", activo: true };

export default function GestionPersonal({ alCaducar }: { alCaducar: () => void }) {
	const [personal, setPersonal] = useState<Personal[]>([]);
	const [form, setForm] = useState<Formulario>(VACIO);
	const [editando, setEditando] = useState<string | null>(null);
	const [cargando, setCargando] = useState(true);
	const [guardando, setGuardando] = useState(false);
	const [error, setError] = useState("");
	const [aviso, setAviso] = useState("");

	const cargar = useCallback(async () => {
		try {
			setPersonal(await api<Personal[]>("/admin/staff", { auth: true }));
		} catch (fallo) {
			if (fallo instanceof ErrorApi && fallo.status === 401) alCaducar();
			setError(fallo instanceof Error ? fallo.message : "No se pudo cargar el personal");
		} finally {
			setCargando(false);
		}
	}, [alCaducar]);

	useEffect(() => { cargar(); }, [cargar]);

	function editar(usuario: Personal) {
		setEditando(usuario.id);
		setForm({ email: usuario.email, nombre: usuario.nombre, password: "", rol: usuario.rol, activo: usuario.activo });
		setError("");
		setAviso("");
	}

	function cancelar() {
		setEditando(null);
		setForm(VACIO);
	}

	async function guardar(evento: FormEvent) {
		evento.preventDefault();
		setGuardando(true);
		setError("");
		setAviso("");
		try {
			const cuerpo = { ...form, ...(form.password ? {} : { password: undefined }) };
			const usuario = editando
				? await api<Personal>(`/admin/staff/${editando}`, { metodo: "PUT", cuerpo, auth: true })
				: await api<Personal>("/admin/staff", { metodo: "POST", cuerpo, auth: true });
			setPersonal((actual) => editando ? actual.map((u) => u.id === usuario.id ? usuario : u) : [usuario, ...actual]);
			cancelar();
			setAviso(editando ? "Usuario actualizado." : "Usuario creado.");
		} catch (fallo) {
			if (fallo instanceof ErrorApi && fallo.status === 401) alCaducar();
			setError(fallo instanceof Error ? fallo.message : "No se pudo guardar el usuario");
		} finally {
			setGuardando(false);
		}
	}

	async function desactivar(usuario: Personal) {
		if (!window.confirm(`¿Desactivar a ${usuario.nombre}?`)) return;
		try {
			await api<void>(`/admin/staff/${usuario.id}`, { metodo: "DELETE", auth: true });
			setPersonal((actual) => actual.map((u) => u.id === usuario.id ? { ...u, activo: false } : u));
		} catch (fallo) {
			if (fallo instanceof ErrorApi && fallo.status === 401) alCaducar();
			setError(fallo instanceof Error ? fallo.message : "No se pudo desactivar el usuario");
		}
	}

	if (cargando) return <p className="p-6 text-gray-500">Cargando personal…</p>;

	return (
		<section className="mx-auto max-w-5xl space-y-6 p-4 text-gray-800 md:p-6">
			<header>
				<h1 className="text-3xl font-extrabold tracking-tight">Personal</h1>
				<p className="mt-1 text-gray-600">Crea y administra temporalmente las cuentas de acceso del equipo.</p>
			</header>
			{error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}
			{aviso && <p role="status" className="rounded-xl bg-green-50 p-4 font-semibold text-green-800">{aviso}</p>}

			<form onSubmit={guardar} className="rounded-2xl bg-white p-5 shadow-sm">
				<h2 className="mb-4 text-xl font-bold">{editando ? "Editar usuario" : "Nuevo usuario"}</h2>
				<div className="grid gap-4 sm:grid-cols-2">
					<Campo label="Nombre" value={form.nombre} required onChange={(nombre) => setForm({ ...form, nombre })} />
					<Campo label="Email" type="email" value={form.email} required onChange={(email) => setForm({ ...form, email })} />
					<Campo label={editando ? "Nueva contraseña (opcional)" : "Contraseña"} type="password" value={form.password} required={!editando} minLength={10} onChange={(password) => setForm({ ...form, password })} />
					<label className="flex flex-col gap-1 font-semibold">Rol
						<select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value as Rol })} className="rounded-lg border px-3 py-2 font-normal">
							<option value="barra">Barra</option><option value="admin">Administrador</option>
						</select>
					</label>
					{editando && <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} /> Cuenta activa</label>}
				</div>
				<div className="mt-4 flex gap-2">
					<button disabled={guardando} className="rounded-xl bg-delicias px-5 py-2 font-bold text-white disabled:opacity-60">{guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear usuario"}</button>
					{editando && <button type="button" onClick={cancelar} className="rounded-xl bg-gray-100 px-5 py-2 font-bold">Cancelar</button>}
				</div>
			</form>

			<div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
				<table className="w-full text-left">
					<thead className="border-b bg-gray-50"><tr><th className="p-4">Nombre</th><th className="p-4">Email</th><th className="p-4">Rol</th><th className="p-4">Estado</th><th className="p-4">Acciones</th></tr></thead>
					<tbody>{personal.map((usuario) => <tr key={usuario.id} className="border-b last:border-0">
						<td className="p-4 font-semibold">{usuario.nombre}</td><td className="p-4">{usuario.email}</td><td className="p-4">{usuario.rol === "admin" ? "Administrador" : "Barra"}</td>
						<td className="p-4">{usuario.activo ? "Activa" : "Inactiva"}</td>
						<td className="p-4"><div className="flex gap-2"><button onClick={() => editar(usuario)} className="rounded-lg bg-gray-100 px-3 py-1.5 font-semibold">Editar</button>{usuario.activo && <button onClick={() => desactivar(usuario)} className="rounded-lg bg-red-50 px-3 py-1.5 font-semibold text-red-700">Desactivar</button>}</div></td>
					</tr>)}</tbody>
				</table>
			</div>
		</section>
	);
}

function Campo({ label, value, onChange, type = "text", required = false, minLength }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean; minLength?: number }) {
	return <label className="flex flex-col gap-1 font-semibold">{label}<input type={type} value={value} required={required} minLength={minLength} onChange={(e) => onChange(e.target.value)} className="rounded-lg border px-3 py-2 font-normal" /></label>;
}
