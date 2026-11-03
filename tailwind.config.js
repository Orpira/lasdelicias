/** @type {import('tailwindcss').Config} */
module.exports = {
	content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
	theme: {
		extend: {
			fontFamily: {
				pacifico: ["Pacifico", "cursive"],
			},
			colors: {
				// Granate del logo de Las Delicias
				delicias: {
					DEFAULT: "#C70041",
					oscuro: "#9E0034",
					claro: "#FBE5EC",
				},
			},
			// ...otros estilos extendidos
		},
	},
	plugins: [],
};
