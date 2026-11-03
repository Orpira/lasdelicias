import { telefonoLegible, useNegocio } from "../lib/negocio";

export default function Footer() {
	const negocio = useNegocio();
	return (
		<footer className="bg-delicias text-white py-6 px-4 text-center text-sm">
			<p className="font-semibold">{negocio?.nombre ?? "Las Delicias"}</p>
			{negocio && (
				<p className="opacity-90">
					{negocio.direccion} · <a href={`tel:${negocio.telefono}`} className="text-white underline">{telefonoLegible(negocio.telefono)}</a>
					{negocio.instagram && (
						<> · <a href={`https://instagram.com/${negocio.instagram}`} target="_blank" rel="noopener noreferrer" className="text-white underline">@{negocio.instagram}</a></>
					)}
				</p>
			)}
			<p className="opacity-70 mt-1">© {new Date().getFullYear()}</p>
		</footer>
	);
}
