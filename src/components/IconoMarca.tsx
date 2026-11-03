// Iconos de marcas (Instagram, WhatsApp) desde simple-icons (licencia CC0)
import { siInstagram, siWhatsapp } from "simple-icons";

const ICONOS = { instagram: siInstagram, whatsapp: siWhatsapp };

export default function IconoMarca({ marca, className = "w-6 h-6" }: { marca: keyof typeof ICONOS; className?: string }) {
	return (
		<svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
			<path d={ICONOS[marca].path} fill="currentColor" />
		</svg>
	);
}
