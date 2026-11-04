import { useEffect, useState, type FormEvent } from "react";
import { api, ErrorApi } from "../../lib/api";
import { DIAS, type Negocio } from "../../lib/negocio";

type Horario = Negocio["horario"];
type Dia = keyof Horario;

const HORAS_POR_DEFECTO: Record<Dia, { abre: string; cierra: string }> = {
	lunes: { abre: "07:00", cierra: "19:00" },
	martes: { abre: "07:00", cierra: "19:00" },
	miercoles: { abre: "07:00", cierra: "19:00" },
	jueves: { abre: "07:00", cierra: "19:00" },
	viernes: { abre: "07:00", cierra: "19:00" },
	sabado: { abre: "08:00", cierra: "14:00" },
	domingo: { abre: "08:00", cierra: "14:00" },
};

function tramo(valor: string | null, dia: Dia) {
	const partes = valor?.match(/^(\d{2}:\d{2})[–-](\d{2}:\d{2})$/);
	return partes ? { abre: partes[1], cierra: partes[2] } : HORAS_POR_DEFECTO[dia];
}

function estadoInicial(negocio: Negocio) {
	return {
		...negocio,
		horario: Object.fromEntries(DIAS.map(({ clave }) => [clave, tramo(negocio.horario[clave], clave)])) as Record<Dia, { abre: string; cierra: string } | null>,
		dias_cerrado: [...(negocio.dias_cerrado ?? [])].sort(),
	};
}

export default function FichaNegocio({ alCaducar }: { alCaducar: () => void }) {
	const [form, setForm] = useState<ReturnType<typeof estadoInicial> | null>(null);
	const [nuevoCierre, setNuevoCierre] = useState("");
	const [cargando, setCargando] = useState(true);
	const [guardando, setGuardando] = useState(false);
	const [error, setError] = useState("");
	const [aviso, setAviso] = useState("");

	useEffect(() => {
		api<Negocio>("/negocio")
			.then((negocio) => setForm(estadoInicial(negocio)))
			.catch((fallo) => {
				if (fallo instanceof ErrorApi && fallo.status === 401) alCaducar();
				setError(fallo instanceof Error ? fallo.message : "No se pudo cargar la ficha");
			})
			.finally(() => setCargando(false));
	}, [alCaducar]);

	function cambiarHorario(dia: Dia, cambios: Partial<{ abre: string; cierra: string }>) {
		setForm((actual) => actual ? {
			...actual,
			horario: { ...actual.horario, [dia]: { ...(actual.horario[dia] ?? HORAS_POR_DEFECTO[dia]), ...cambios } },
		} : actual);
	}

	function cambiarAbierto(dia: Dia, abierto: boolean) {
		setForm((actual) => actual ? {
			...actual,
			horario: { ...actual.horario, [dia]: abierto ? HORAS_POR_DEFECTO[dia] : null },
		} : actual);
	}

	function anadirCierre() {
		if (!nuevoCierre || form?.dias_cerrado.includes(nuevoCierre)) return;
		setForm((actual) => actual ? { ...actual, dias_cerrado: [...actual.dias_cerrado, nuevoCierre].sort() } : actual);
		setNuevoCierre("");
	}

	async function guardar(evento: FormEvent) {
		evento.preventDefault();
		if (!form) return;
		setGuardando(true);
		setError("");
		setAviso("");
		try {
			const horario = Object.fromEntries(DIAS.map(({ clave }) => {
				const valor = form.horario[clave];
				return [clave, valor ? `${valor.abre}–${valor.cierra}` : null];
			}));
			const cuerpo = {
				...form,
				titular: form.titular?.trim() || null,
				nif: form.nif?.trim() || null,
				email_contacto: form.email_contacto?.trim() || null,
				conservacion_meses: form.conservacion_meses ?? 12,
				horario,
				dias_cerrado: form.dias_cerrado,
			};
			const actualizado = await api<Negocio>("/admin/negocio", { metodo: "PUT", cuerpo, auth: true });
			setForm(estadoInicial(actualizado));
			setAviso("Ficha guardada correctamente.");
		} catch (fallo) {
			if (fallo instanceof ErrorApi && fallo.status === 401) alCaducar();
			setError(fallo instanceof Error ? fallo.message : "No se pudo guardar la ficha");
		} finally {
			setGuardando(false);
		}
	}

	if (cargando) return <p className="p-6 text-gray-500">Cargando ficha…</p>;
	if (!form) return <p role="alert" className="m-6 rounded-xl bg-red-50 p-4 text-red-800">{error || "No se pudo cargar la ficha."}</p>;

	return (
		<form onSubmit={guardar} className="mx-auto max-w-4xl space-y-6 p-4 text-gray-800 md:p-6">
			<header>
				<h1 className="text-3xl font-extrabold tracking-tight">Ficha del negocio</h1>
				<p className="mt-1 text-gray-600">Actualiza el horario, los cierres excepcionales y los datos legales.</p>
			</header>
			{error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}
			{aviso && <p role="status" className="rounded-xl bg-green-50 p-4 font-semibold text-green-800">{aviso}</p>}

			<section className="rounded-2xl bg-white p-5 shadow-sm">
				<h2 className="mb-4 text-xl font-bold">Horario semanal</h2>
				<div className="space-y-3">
					{DIAS.map(({ clave, nombre }) => {
						const valor = form.horario[clave];
						return <div key={clave} className="grid items-center gap-3 border-b border-gray-100 pb-3 last:border-0 sm:grid-cols-[7rem_6rem_1fr]">
							<strong>{nombre}</strong>
							<label className="flex items-center gap-2">
								<input type="checkbox" checked={valor !== null} onChange={(e) => cambiarAbierto(clave, e.target.checked)} />
								Abierto
							</label>
							{valor ? <div className="flex flex-wrap items-center gap-2">
								<label>De <input type="time" value={valor.abre} required onChange={(e) => cambiarHorario(clave, { abre: e.target.value })} className="rounded-lg border px-2 py-1" /></label>
								<label>a <input type="time" value={valor.cierra} required onChange={(e) => cambiarHorario(clave, { cierra: e.target.value })} className="rounded-lg border px-2 py-1" /></label>
							</div> : <span className="text-gray-500">Cerrado</span>}
						</div>;
					})}
				</div>
			</section>

			<section className="rounded-2xl bg-white p-5 shadow-sm">
				<h2 className="mb-4 text-xl font-bold">Días de cierre excepcional</h2>
				<div className="flex flex-wrap gap-2">
					<label htmlFor="nuevo-cierre" className="sr-only">Fecha de cierre</label>
					<input id="nuevo-cierre" type="date" value={nuevoCierre} onChange={(e) => setNuevoCierre(e.target.value)} className="rounded-lg border px-3 py-2" />
					<button type="button" onClick={anadirCierre} disabled={!nuevoCierre} className="rounded-lg bg-gray-100 px-4 py-2 font-bold disabled:opacity-50">Añadir día</button>
				</div>
				<ul className="mt-4 flex flex-wrap gap-2">
					{form.dias_cerrado.length === 0 && <li className="text-gray-500">No hay días excepcionales.</li>}
					{form.dias_cerrado.map((fecha) => <li key={fecha} className="flex items-center gap-2 rounded-full bg-merengue px-3 py-1">
						{fecha}<button type="button" onClick={() => setForm((actual) => actual ? { ...actual, dias_cerrado: actual.dias_cerrado.filter((dia) => dia !== fecha) } : actual)} aria-label={`Quitar cierre del ${fecha}`} className="font-bold">×</button>
					</li>)}
				</ul>
			</section>

			<section className="rounded-2xl bg-white p-5 shadow-sm">
				<h2 className="mb-4 text-xl font-bold">Datos legales</h2>
				<div className="grid gap-4 sm:grid-cols-2">
					<Campo label="Titular o razón social" value={form.titular ?? ""} onChange={(titular) => setForm({ ...form, titular })} />
					<Campo label="NIF" value={form.nif ?? ""} onChange={(nif) => setForm({ ...form, nif })} />
					<Campo label="Email de contacto" type="email" value={form.email_contacto ?? ""} onChange={(email_contacto) => setForm({ ...form, email_contacto })} />
					<label className="flex flex-col gap-1 font-semibold">Meses de conservación
						<input type="number" min="1" max="60" required value={form.conservacion_meses ?? 12} onChange={(e) => setForm({ ...form, conservacion_meses: Number(e.target.value) })} className="rounded-lg border px-3 py-2 font-normal" />
					</label>
				</div>
				<p className="mt-3 text-sm text-gray-600">Los datos legales son necesarios para publicar correctamente el aviso legal y la política de privacidad.</p>
			</section>

			<button disabled={guardando} className="min-h-12 rounded-xl bg-delicias px-6 py-3 font-bold text-white disabled:opacity-60">
				{guardando ? "Guardando…" : "Guardar ficha"}
			</button>
		</form>
	);
}

function Campo({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
	return <label className="flex flex-col gap-1 font-semibold">{label}
		<input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border px-3 py-2 font-normal" />
	</label>;
}
