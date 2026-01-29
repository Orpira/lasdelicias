import { useState } from "react";

const navLinks = [
	{ label: "Inicio", href: "/" },
	{ label: "Menú", href: "/menu" },
	{ label: "Contacto", href: "/contacto" },
];

export default function Navbar() {
	const [menuOpen, setMenuOpen] = useState(false);
	return (
		<nav className="sticky top-0 z-50 w-full bg-gradient-to-r from-white/70 via-white/60 to-white/30 dark:from-slate-900/90 dark:via-slate-900/80 dark:to-slate-900/60 backdrop-blur-md ring-1 ring-slate-900/5 dark:ring-slate-50/10 shadow-md transition-colors font-sans">
			<div className="flex items-center justify-between w-full h-16 px-6">
				<div className="flex items-center gap-3">
					<div
						className="border-4 border-yellow-400 rounded-full p-1 bg-white flex items-center justify-center"
						style={{ width: "48px", height: "36px", borderRadius: "50%" }}
					>
						<img
							src="/logo.webp"
							alt="Logo Las Delicias"
							className="object-cover w-10 h-8 rounded-full"
						/>
					</div>
					<span className="font-bold text-2xl text-gray-800 font-pacifico">
						Las Delicias
					</span>
				</div>
				<ul className="hidden md:flex gap-6 items-center list-none m-0 p-0">
					{navLinks.map((link) => (
						<li key={link.href}>
							<a
								href={link.href}
								className="text-gray-800 font-bold px-4 py-2 rounded hover:bg-yellow-300 transition"
							>
								{link.label}
							</a>
						</li>
					))}
				</ul>
				<button
					className="md:hidden flex flex-col justify-center items-center w-8 h-8 bg-transparent border-none cursor-pointer"
					onClick={() => setMenuOpen((open) => !open)}
					aria-label="Abrir menú"
				>
					<span
						className={`block w-6 h-1 bg-pink-600 rounded transition-all duration-300 mb-1 ${
							menuOpen ? "rotate-45 translate-y-2" : ""
						}`}
					></span>
					<span
						className={`block w-6 h-1 bg-pink-600 rounded transition-all duration-300 mb-1 ${
							menuOpen ? "opacity-0" : ""
						}`}
					></span>
					<span
						className={`block w-6 h-1 bg-pink-600 rounded transition-all duration-300 ${
							menuOpen ? "-rotate-45 -translate-y-2" : ""
						}`}
					></span>
				</button>
			</div>
			{/* Menú móvil */}
			{menuOpen && (
				<ul className="absolute top-16 left-0 w-full bg-yellow-400 flex flex-col items-center py-4 shadow-md md:hidden">
					{navLinks.map((link) => (
						<li key={link.href} className="w-full">
							<a
								href={link.href}
								className="block w-full text-center text-gray-800 font-bold px-4 py-3 hover:bg-yellow-300 transition"
							>
								{link.label}
							</a>
						</li>
					))}
				</ul>
			)}
		</nav>
	);
}
