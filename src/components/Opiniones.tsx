// Estrellas, formulario de opinión y tarjeta de opinión (portada y seguimiento del pedido)
import { useId, useState, type FormEvent } from "react";
import { BadgeCheck, Star } from "lucide-react";
import { api } from "../lib/api";

export interface Opinion {
	id: string;
	nombre: string;
	puntuacion: number;
	comentario: string;
	verificada: boolean;
	created_at: string;
}

export function Estrellas({ valor, className = "w-4 h-4" }: { valor: number; className?: string }) {
	return (
		<span className="inline-flex gap-0.5 text-delicias" role="img" aria-label={`${valor} de 5 estrellas`}>
			{[1, 2, 3, 4, 5].map((n) => (
				<Star key={n} className={className} fill={n <= Math.round(valor) ? "currentColor" : "none"} strokeWidth={1.75} aria-hidden="true" />
			))}
		</span>
	);
}

/** Selector de 1 a 5 estrellas accesible (grupo de radios) */
function SelectorEstrellas({ valor, onChange }: { valor: number; onChange: (n: number) => void }) {
	const [sobre, setSobre] = useState(0);
	const nombre = useId();
	const textos = ["", "Mal", "Regular", "Bien", "Muy bien", "¡Excelente!"];
	return (
		<fieldset>
			<legend className="text-sm font-semibold mb-1">Tu valoración</legend>
			<div className="flex items-center gap-1" onMouseLeave={() => setSobre(0)}>
				{[1, 2, 3, 4, 5].map((n) => (
					<label key={n} className="cursor-pointer p-0.5" onMouseEnter={() => setSobre(n)}>
						<input type="radio" name={nombre} value={n} checked={valor === n} onChange={() => onChange(n)}
							className="sr-only peer" aria-label={`${n} ${n === 1 ? "estrella" : "estrellas"}`} />
						<Star className="w-9 h-9 text-delicias peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-delicias rounded"
							fill={n <= (sobre || valor) ? "currentColor" : "none"} strokeWidth={1.5} aria-hidden="true" />
					</label>
				))}
				<span className="ml-2 text-sm font-semibold text-delicias-profundo min-w-20" aria-live="polite">{textos[sobre || valor]}</span>
			</div>
		</fieldset>
	);
}

export function FormularioOpinion({
	pedidoCodigo,
	nombreInicial = "",
	alEnviar,
}: {
	pedidoCodigo?: string;
	nombreInicial?: string;
	alEnviar?: () => void;
}) {
	const [nombre, setNombre] = useState(nombreInicial);
	const [puntuacion, setPuntuacion] = useState(0);
	const [comentario, setComentario] = useState("");
	const [web, setWeb] = useState(""); // campo trampa para bots
	const [estado, setEstado] = useState<"editando" | "enviando" | "enviada">("editando");
	const [mensaje, setMensaje] = useState("");

	async function enviar(e: FormEvent) {
		e.preventDefault();
		if (!puntuacion) return setMensaje("Elige de 1 a 5 estrellas.");
		setEstado("enviando");
		setMensaje("");
		try {
			const r = await api<{ mensaje: string }>("/opiniones", {
				metodo: "POST",
				cuerpo: { nombre, puntuacion, comentario, pedido_codigo: pedidoCodigo, web: web || undefined },
			});
			setMensaje(r.mensaje);
			setEstado("enviada");
			alEnviar?.();
		} catch (err) {
			setMensaje(err instanceof Error ? err.message : "No se ha podido enviar. Inténtalo de nuevo.");
			setEstado("editando");
		}
	}

	if (estado === "enviada") {
		return <p className="p-4 rounded-xl bg-green-50 text-green-800 font-semibold" role="status">{mensaje}</p>;
	}

	return (
		<form onSubmit={enviar} className="flex flex-col gap-4">
			<SelectorEstrellas valor={puntuacion} onChange={setPuntuacion} />
			<label className="flex flex-col gap-1">
				<span className="text-sm font-semibold">Tu nombre</span>
				<input value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={40} autoComplete="given-name"
					className="border border-delicias/20 rounded-lg px-3 py-2 bg-white" />
			</label>
			<label className="flex flex-col gap-1">
				<span className="text-sm font-semibold">Comentario <span className="font-normal text-tinta/55">(opcional)</span></span>
				<textarea value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={500} rows={3}
					placeholder="¿Qué te gustó? ¿Qué podemos mejorar?"
					className="border border-delicias/20 rounded-lg px-3 py-2 bg-white" />
				<span className="text-xs text-tinta/50 self-end tabular-nums">{comentario.length}/500</span>
			</label>
			{/* Invisible para personas; los bots suelen rellenarlo */}
			<input type="text" name="web" value={web} onChange={(e) => setWeb(e.target.value)} tabIndex={-1} autoComplete="off"
				aria-hidden="true" className="absolute -left-[9999px] w-px h-px opacity-0" />
			{mensaje && <p className="text-sm font-semibold text-red-700" role="alert">{mensaje}</p>}
			<button disabled={estado === "enviando"}
				className="self-start bg-delicias text-white font-bold px-6 py-3 rounded-xl hover:bg-delicias-oscuro disabled:opacity-60 transition-colors">
				{estado === "enviando" ? "Enviando…" : "Enviar opinión"}
			</button>
			<p className="text-xs text-tinta/55">Revisamos cada opinión antes de publicarla. Se mostrará tu nombre, no tus datos de contacto.</p>
		</form>
	);
}

export function TarjetaOpinion({ opinion: o }: { opinion: Opinion }) {
	return (
		<figure className="flex flex-col gap-3 p-6 rounded-2xl bg-white border border-delicias/15">
			<Estrellas valor={o.puntuacion} />
			{o.comentario && <blockquote className="text-lg leading-snug">“{o.comentario}”</blockquote>}
			<figcaption className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
				<span className="font-bold">{o.nombre}</span>
				{o.verificada && (
					<span className="inline-flex items-center gap-1 text-green-700 font-semibold">
						<BadgeCheck className="w-4 h-4" aria-hidden="true" /> Pedido verificado
					</span>
				)}
			</figcaption>
		</figure>
	);
}
