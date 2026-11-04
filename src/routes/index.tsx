import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import Home from "../pages/Home";
import Menu from "../components/Menu";
import Pedido from "../pages/Pedido";
import Seguimiento from "../pages/Seguimiento";
import MesaQr from "../pages/MesaQr";
import Admin from "../pages/Admin";
import AvisoLegal from "../pages/legal/AvisoLegal";
import Privacidad from "../pages/legal/Privacidad";
import Cookies from "../pages/legal/Cookies";
import Gracias from "../pages/Gracias";
import VigilanteMesa from "../components/VigilanteMesa";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { CarritoProvider } from "../lib/carrito";
import "../App.css";

export default function App() {
	// El panel del local ocupa toda la pantalla, sin cabecera ni pie públicos
	const { pathname } = useLocation();
	const esPanel = pathname.startsWith("/admin");

	// Cada página nueva empieza arriba (no al cambiar de categoría en la carta)
	useEffect(() => {
		window.scrollTo(0, 0);
	}, [pathname]);

	return (
		<CarritoProvider>
			<VigilanteMesa activo={!esPanel} />
			{!esPanel && <Navbar />}
			<main className="bg-white min-h-[70vh]">
				<Routes>
					<Route path="/" element={<Home />} />
					<Route path="/menu" element={<Menu />} />
					<Route path="/pedido" element={<Pedido />} />
					<Route path="/pedido/:codigo" element={<Seguimiento />} />
					<Route path="/gracias/:cuentaId" element={<Gracias />} />
					<Route path="/m/:token" element={<MesaQr />} />
					<Route path="/aviso-legal" element={<AvisoLegal />} />
					<Route path="/privacidad" element={<Privacidad />} />
					<Route path="/cookies" element={<Cookies />} />
					<Route path="/admin" element={<Admin />} />
					<Route path="/admin/:pestana/*" element={<Admin />} />
					<Route path="*" element={<p className="text-center py-24 text-gray-600">Página no encontrada</p>} />
				</Routes>
			</main>
			{!esPanel && <Footer />}
		</CarritoProvider>
	);
}
