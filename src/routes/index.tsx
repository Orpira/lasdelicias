import { Routes, Route, useLocation } from "react-router-dom";
import Home from "../pages/Home";
import Menu from "../components/Menu";
import Pedido from "../pages/Pedido";
import Seguimiento from "../pages/Seguimiento";
import MesaQr from "../pages/MesaQr";
import Admin from "../pages/Admin";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { CarritoProvider } from "../lib/carrito";
import "../App.css";

export default function App() {
	// El panel del local ocupa toda la pantalla, sin cabecera ni pie públicos
	const esPanel = useLocation().pathname.startsWith("/admin");

	return (
		<CarritoProvider>
			{!esPanel && <Navbar />}
			<main className="bg-[#fffaf5] min-h-[70vh]">
				<Routes>
					<Route path="/" element={<Home />} />
					<Route path="/menu" element={<Menu />} />
					<Route path="/pedido" element={<Pedido />} />
					<Route path="/pedido/:codigo" element={<Seguimiento />} />
					<Route path="/m/:token" element={<MesaQr />} />
					<Route path="/admin" element={<Admin />} />
					<Route path="*" element={<p className="text-center py-24 text-gray-600">Página no encontrada</p>} />
				</Routes>
			</main>
			{!esPanel && <Footer />}
		</CarritoProvider>
	);
}
