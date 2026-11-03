// Cartelito de precio amarillo escrito a mano, como los de la vitrina del local
import { euros } from "../lib/api";

const GIROS = ["-rotate-3", "rotate-2", "-rotate-1", "rotate-3", "-rotate-2"];

export default function Etiqueta({
	precio,
	texto,
	giro = 0,
	className = "",
}: {
	precio?: number;
	texto?: string;
	giro?: number;
	className?: string;
}) {
	return (
		<span
			className={`inline-block bg-cartel text-tinta font-mano leading-none px-2.5 pt-1 pb-1.5 rounded-sm shadow-[0_2px_0_rgba(43,26,31,0.18)] ${GIROS[giro % GIROS.length]} ${className}`}
		>
			{texto && <span className="block text-[0.8em] leading-tight">{texto}</span>}
			{precio !== undefined && <span className="text-[1.25em]">{euros(precio)}</span>}
		</span>
	);
}
