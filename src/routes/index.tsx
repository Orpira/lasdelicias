import { Routes, Route } from "react-router-dom";
import Home from "../pages/Home";
import Menu from "../components/Menu";
import Pedido from "../pages/Pedido";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import "../App.css";

export default function App() {
	return (
		<>
			<Navbar />
			<main className="pb-20">
				<Routes>
					<Route path="/" element={<Home />} />
					<Route path="/menu" element={<Menu />} />
					<Route path="/pedido" element={<Pedido />} />
					{/*    <Route path="/admin" element={<Admin />} /> */}
				</Routes>
			</main>
			<Footer />
		</>
	);
}
