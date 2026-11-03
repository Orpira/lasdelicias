import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";

const FOTOS = [
	{
		src: "/demo/vitrina-dulces.webp",
		alt: "La vitrina de Las Delicias con suizos, pasteles de naranja y tartas",
		etiqueta: "Mostrar la vitrina",
		posicion: "object-center",
		ancho: 900,
		alto: 786,
	},
	{
		src: "/interior-cafeteria.webp",
		alt: "Interior de Las Delicias con la vitrina, la barra y las mesas de la cafetería",
		etiqueta: "Mostrar el interior de la cafetería",
		posicion: "object-[center_35%]",
		ancho: 768,
		alto: 1025,
	},
];

export default function FotosPortada() {
	const [fotoActual, setFotoActual] = useState(0);
	const [reproduciendo, setReproduciendo] = useState(() => !matchMedia("(prefers-reduced-motion: reduce)").matches);
	const [conPuntero, setConPuntero] = useState(false);
	const [conFoco, setConFoco] = useState(false);

	useEffect(() => {
		const preferencia = matchMedia("(prefers-reduced-motion: reduce)");
		const actualizar = (evento: MediaQueryListEvent) => {
			if (evento.matches) setReproduciendo(false);
		};
		preferencia.addEventListener("change", actualizar);
		return () => preferencia.removeEventListener("change", actualizar);
	}, []);

	useEffect(() => {
		if (!reproduciendo || conPuntero || conFoco) return;
		const intervalo = setInterval(() => {
			if (!document.hidden) setFotoActual((actual) => (actual + 1) % FOTOS.length);
		}, 5000);
		return () => clearInterval(intervalo);
	}, [reproduciendo, conPuntero, conFoco]);

	return (
		<div role="region" aria-roledescription="carrusel" aria-label="Fotos de Las Delicias"
			onMouseEnter={() => setConPuntero(true)} onMouseLeave={() => setConPuntero(false)}
			onFocusCapture={() => setConFoco(true)}
			onBlurCapture={(evento) => {
				if (!evento.currentTarget.contains(evento.relatedTarget)) setConFoco(false);
			}}
			className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-white/10">
			<div id="fotos-portada" aria-live={reproduciendo ? "off" : "polite"} aria-atomic="true">
				{FOTOS.map((foto, i) => (
					<div key={foto.src} id={`foto-portada-${i}`} role="group" aria-roledescription="diapositiva"
						aria-label={`${i + 1} de ${FOTOS.length}`} aria-hidden={fotoActual !== i}
						className={`absolute inset-0 transition-opacity duration-700 ${fotoActual === i ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
						<img src={foto.src} alt={foto.alt} width={foto.ancho} height={foto.alto}
							fetchPriority={i === 0 ? "high" : "auto"}
							className={`w-full h-full object-cover ${foto.posicion}`} />
					</div>
				))}
			</div>
			<div className="absolute inset-x-0 bottom-3 flex justify-center">
				<div className="flex items-center rounded-full bg-black/50 px-1 text-white">
					{FOTOS.map((foto, i) => (
						<button key={foto.src} type="button" aria-label={foto.etiqueta}
							aria-controls={`foto-portada-${i}`} aria-pressed={fotoActual === i}
							onClick={() => {
								setFotoActual(i);
								setReproduciendo(false);
							}}
							className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/15 focus-visible:outline-white">
							<span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${fotoActual === i ? "bg-white" : "bg-white/50"}`} />
						</button>
					))}
					<button type="button" aria-controls="fotos-portada"
						aria-label={reproduciendo ? "Pausar rotación de fotos" : "Reanudar rotación de fotos"}
						onClick={() => setReproduciendo((actual) => !actual)}
						className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/15 focus-visible:outline-white">
						{reproduciendo ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
					</button>
				</div>
			</div>
		</div>
	);
}
