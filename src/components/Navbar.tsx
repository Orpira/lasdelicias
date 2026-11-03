import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Menu as IconoMenu, ShoppingBag, X } from "lucide-react";
import { useCarrito } from "../lib/carrito";
import { euros } from "../lib/api";

export default function Navbar() {
	const [abierto, setAbierto] = useState(false);
	const { unidades, total, mesa } = useCarrito();

	const enlace = ({ isActive }: { isActive: boolean }) =>
		`px-3 py-2 rounded-lg font-semibold transition-colors ${isActive ? "text-delicias" : "text-tinta/80 hover:text-delicias"}`;

	return (
		<header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-delicias/10">
			<nav className="max-w-6xl mx-auto h-16 px-5 flex items-center gap-3" aria-label="Principal">
				<Link to="/" className="shrink-0" onClick={() => setAbierto(false)}>
					<img src="/logo-las-delicias.webp" alt="Las Delicias, inicio" className="h-10 w-auto rounded-md" />
				</Link>
				{mesa && (
					<span className="text-sm font-bold px-2.5 py-1 rounded-full bg-merengue text-delicias">Mesa {mesa}</span>
				)}

				<div className="hidden md:flex items-center gap-1 ml-auto">
					<NavLink to="/" end className={enlace}>Inicio</NavLink>
					<NavLink to="/menu" className={enlace}>Carta</NavLink>
				</div>

				<Link to="/pedido" onClick={() => setAbierto(false)}
					className="ml-auto md:ml-3 flex items-center gap-2 h-11 px-4 rounded-xl bg-delicias text-white font-bold hover:bg-delicias-oscuro transition-colors">
					<ShoppingBag className="w-5 h-5" aria-hidden="true" />
					{unidades > 0 ? (
						<span>{unidades} · {euros(total)}</span>
					) : (
						<span className="hidden sm:inline">Mi pedido</span>
					)}
					<span className="sr-only">Ver mi pedido</span>
				</Link>

				<button
					className="md:hidden w-11 h-11 flex items-center justify-center rounded-xl text-tinta"
					onClick={() => setAbierto((a) => !a)}
					aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
					aria-expanded={abierto}
				>
					{abierto ? <X className="w-6 h-6" /> : <IconoMenu className="w-6 h-6" />}
				</button>
			</nav>
			{abierto && (
				<div className="md:hidden border-t border-delicias/10 bg-white px-5 py-3 flex flex-col">
					<NavLink to="/" end className={enlace} onClick={() => setAbierto(false)}>Inicio</NavLink>
					<NavLink to="/menu" className={enlace} onClick={() => setAbierto(false)}>Carta</NavLink>
					<NavLink to="/pedido" className={enlace} onClick={() => setAbierto(false)}>Mi pedido</NavLink>
				</div>
			)}
		</header>
	);
}
