/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
	theme: {
		extend: {
			fontFamily: {
				// Una familia para todo; la letra a mano solo para los cartelitos de precio
				sans: ['"Bricolage Grotesque Variable"', "system-ui", "sans-serif"],
				mano: ["Caveat", "cursive"],
			},
			colors: {
				// Granate del rótulo de Las Delicias
				delicias: {
					DEFAULT: "#C70041",
					oscuro: "#9E0034",
					profundo: "#7A0028",
					claro: "#FBE5EC",
				},
				merengue: "#FCEFF3",
				cartel: "#FFE14D", // amarillo de los cartelitos de precio de la vitrina
				tinta: "#2B1A1F",
			},
			letterSpacing: {
				titular: "-0.025em",
			},
		},
	},
	plugins: [],
};
