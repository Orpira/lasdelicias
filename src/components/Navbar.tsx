import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useCarrito } from "../lib/carrito";

const enlaces = [
	{ label: "Inicio", to: "/" },
	{ label: "Carta", to: "/menu" },
	{ label: "Mi pedido", to: "/pedido" },
];

export default function Navbar() {
	const [abierto, setAbierto] = useState(false);
	const { unidades, mesa } = useCarrito();

	const estilo = ({ isActive }: { isActive: boolean }) =>
		`block px-4 py-2 rounded-lg font-bold transition ${isActive ? "bg-delicias-claro text-delicias" : "text-gray-800 hover:bg-delicias-claro"}`;

	return (
		<nav className="sticky top-0 z-50 w-full bg-white/90 backdrop-blur-md shadow-sm font-sans">
			<div className="flex items-center justify-between max-w-6xl mx-auto h-16 px-4">
				<Link to="/" className="flex items-center gap-3" onClick={() => setAbierto(false)}>
					<img src="/logo-las-delicias.webp" alt="Las Delicias" className="h-10 w-auto rounded-md" />
					{mesa && <span className="text-xs font-bold px-2 py-1 rounded-full bg-delicias-claro text-delicias">Mesa {mesa}</span>}
				</Link>
				<ul className="hidden md:flex gap-2 items-center list-none m-0 p-0">
					{enlaces.map((e) => (
						<li key={e.to}>
							<NavLink to={e.to} end className={estilo}>
								{e.label}
								{e.to === "/pedido" && unidades > 0 && (
									<span className="ml-2 px-2 py-0.5 rounded-full bg-delicias text-white text-xs">{unidades}</span>
								)}
							</NavLink>
						</li>
					))}
				</ul>
				<button
					className="md:hidden flex flex-col justify-center items-center w-10 h-10 bg-transparent border-none cursor-pointer gap-1"
					onClick={() => setAbierto((a) => !a)}
					aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
					aria-expanded={abierto}
				>
					<span className={`block w-6 h-0.5 bg-delicias transition-all ${abierto ? "rotate-45 translate-y-1.5" : ""}`} />
					<span className={`block w-6 h-0.5 bg-delicias transition-all ${abierto ? "opacity-0" : ""}`} />
					<span className={`block w-6 h-0.5 bg-delicias transition-all ${abierto ? "-rotate-45 -translate-y-1.5" : ""}`} />
				</button>
			</div>
			{abierto && (
				<ul className="md:hidden bg-white border-t list-none m-0 p-2">
					{enlaces.map((e) => (
						<li key={e.to}>
							<NavLink to={e.to} end className={estilo} onClick={() => setAbierto(false)}>
								{e.label} {e.to === "/pedido" && unidades > 0 ? `(${unidades})` : ""}
							</NavLink>
						</li>
					))}
				</ul>
			)}
		</nav>
	);
}
