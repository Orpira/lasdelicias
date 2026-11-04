import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { telefonoLegible, type Negocio } from "../../lib/negocio";

export function PaginaLegal({ titulo, error, children }: { titulo: string; error: string; children: ReactNode }) {
	return (
		<article className="max-w-[70ch] mx-auto px-5 py-12 md:py-16 text-tinta" aria-labelledby="titulo-legal">
			<Link to="/" className="inline-flex items-center gap-2 text-sm font-bold text-delicias hover:text-delicias-oscuro">
				<ArrowLeft className="w-4 h-4" aria-hidden="true" /> Volver a inicio
			</Link>
			<header className="mt-6 mb-8 border-b border-delicias/15 pb-6">
				<h1 id="titulo-legal" className="text-4xl font-extrabold tracking-titular">{titulo}</h1>
				<p className="mt-3 text-sm text-tinta/70">Última actualización: <time dateTime="2026-11-04">4 de noviembre de 2026</time></p>
			</header>
			{error && (
				<div role="alert" className="mb-8 rounded-xl border border-delicias/25 bg-merengue p-4">
					<p>No se pudieron cargar los datos del negocio: {error}</p>
					<button type="button" onClick={() => window.location.reload()} className="mt-2 font-bold text-delicias underline">
						Volver a cargar
					</button>
				</div>
			)}
			<div className="space-y-8 leading-relaxed [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-titular [&_h2]:mb-3 [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_li+li]:mt-3 [&_a]:text-delicias [&_a]:underline [&_a]:underline-offset-4">
				{children}
			</div>
		</article>
	);
}

export function DatoLegal({ valor, campo }: { valor?: string | null; campo: string }) {
	return valor?.trim() ? <>{valor}</> : (
		<mark className="rounded bg-merengue px-1.5 py-0.5 font-semibold text-delicias-profundo">[Pendiente: {campo}]</mark>
	);
}

export function DatosResponsable({ negocio }: { negocio: Negocio | null }) {
	return (
		<dl className="space-y-3 rounded-2xl border border-delicias/15 p-5 break-words">
			<div>
				<dt className="font-semibold">Titular</dt>
				<dd><DatoLegal valor={negocio?.titular} campo="titular" /></dd>
			</div>
			<div>
				<dt className="font-semibold">NIF</dt>
				<dd><DatoLegal valor={negocio?.nif} campo="NIF" /></dd>
			</div>
			<div>
				<dt className="font-semibold">Domicilio</dt>
				<dd><DatoLegal valor={negocio?.direccion} campo="domicilio" /></dd>
			</div>
			<div>
				<dt className="font-semibold">Teléfono</dt>
				<dd>{negocio?.telefono ? (
					<a href={`tel:${negocio.telefono}`}>{telefonoLegible(negocio.telefono)}</a>
				) : <DatoLegal campo="teléfono" />}</dd>
			</div>
			<div>
				<dt className="font-semibold">Email de contacto</dt>
				<dd>{negocio?.email_contacto ? (
					<a href={`mailto:${negocio.email_contacto}`}>{negocio.email_contacto}</a>
				) : <DatoLegal campo="email de contacto" />}</dd>
			</div>
		</dl>
	);
}
