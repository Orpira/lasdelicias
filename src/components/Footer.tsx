import React from "react";
const year = new Date().getFullYear();

const Footer: React.FC = () => (
	<footer className="fixed bottom-0 left-0 w-full bg-white text-pink-700 py-4 px-2 text-center border-t border-pink-300 shadow z-50">
		<p className="text-base font-semibold tracking-wide">
			{year} <span className="font-bold">Panaderia - Las Delicias</span>. Calle
			Ayala 28, Málaga.
		</p>
	</footer>
);

export default Footer;
