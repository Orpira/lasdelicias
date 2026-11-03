import { useState } from "react";
import { useNegocio } from "../../lib/negocio";
import { PaginaLegal } from "./ContenidoLegal";

const ALMACENAMIENTO = [
	{
		clave: "delicias.carrito",
		finalidad: "Productos y cantidades del carrito y datos de la mesa seleccionada, incluido su token QR.",
		duracion: "Sin caducidad automática. Las líneas se vacían al enviar el pedido; al cargar la app se descarta la mesa si han pasado 4 horas desde el escaneo.",
	},
	{
		clave: "delicias.dispositivo",
		finalidad: "Identificador aleatorio para relacionar pedidos del dispositivo y detectar cambios de mesa.",
		duracion: "Sin caducidad automática, hasta borrar el almacenamiento del sitio.",
	},
	{
		clave: "delicias.token",
		finalidad: "Autenticar al personal en el panel; no se crea para los clientes.",
		duracion: "La sesión es válida durante 14 horas. La entrada se borra al salir o al detectar una sesión no válida; localStorage no la elimina por tiempo.",
	},
	{
		clave: "delicias.pestana",
		finalidad: "Recordar la última pantalla utilizada por el personal.",
		duracion: "Hasta elegir otra pantalla o borrar el almacenamiento, sin caducidad temporal.",
	},
	{
		clave: "delicias.cocina.puesto",
		finalidad: "Recordar el filtro de puesto de la tablet de cocina.",
		duracion: "Hasta cambiar el puesto o borrar el almacenamiento, sin caducidad temporal.",
	},
	{
		clave: "delicias.cocina.hechos",
		finalidad: "Conservar las líneas de comanda ya tachadas al recargar la tablet.",
		duracion: "Se retiran las marcas de un pedido al pulsar «Listo» en esa pantalla; las restantes no tienen caducidad automática.",
	},
	{
		clave: "delicias.misPedidos",
		finalidad: "Recordar los códigos de los últimos pedidos para su seguimiento.",
		duracion: "Hasta 10 códigos, que se sustituyen al hacer nuevos pedidos; sin caducidad temporal, o hasta borrar el almacenamiento.",
	},
	{
		clave: "delicias.cliente",
		finalidad: "Opcional: recordar nombre y teléfono solo si marcas «Recordar mi nombre y teléfono en este dispositivo».",
		duracion: "Hasta borrar el almacenamiento o enviar correctamente otro pedido con la casilla desmarcada.",
	},
];

export default function Cookies() {
	const [error, setError] = useState("");
	const negocio = useNegocio(setError);

	return (
		<PaginaLegal titulo="Política de cookies y almacenamiento" error={error}>
			<section>
				<h2>1. Almacenamiento necesario, sin analítica ni publicidad</h2>
				<p>La web de {negocio?.nombre ?? "Las Delicias"} no utiliza cookies de analítica ni de publicidad. Utiliza almacenamiento local del navegador (<code>localStorage</code>) para el carrito, el seguimiento de pedidos, la entrega en mesa y las funciones del personal.</p>
				<p>Estas funciones técnicas permiten prestar los servicios solicitados, conforme a la excepción del artículo 22.2 de la LSSI. No mostramos un banner de cookies de analítica o publicidad. Las funciones opcionales se activan únicamente a petición: recordar datos mediante su casilla y cargar Google Maps mediante su botón.</p>
			</section>
			<section>
				<h2>2. Qué guarda esta aplicación</h2>
				<p className="mb-4">Todas las entradas siguientes son propias de la aplicación. No se utilizan para seguimiento publicitario entre webs. El almacenamiento local persiste al cerrar la pestaña; no tiene la caducidad automática de una cookie.</p>
				<div className="overflow-x-auto rounded-xl border border-delicias/15">
					<table className="w-full min-w-[38rem] text-sm text-left">
						<caption className="sr-only">Claves de almacenamiento local, finalidad y duración</caption>
						<thead className="bg-merengue">
							<tr>
								<th scope="col" className="p-3">Clave</th>
								<th scope="col" className="p-3">Finalidad</th>
								<th scope="col" className="p-3">Duración</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-delicias/10">
							{ALMACENAMIENTO.map((entrada) => (
								<tr key={entrada.clave} className="align-top">
									<th scope="row" className="p-3 font-medium"><code>{entrada.clave}</code></th>
									<td className="p-3">{entrada.finalidad}</td>
									<td className="p-3">{entrada.duracion}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>
			<section>
				<h2>3. Google Maps, solo cuando lo pides</h2>
				<p>El mapa no se carga al abrir la web. En su lugar aparecen la dirección y el botón «Ver mapa». Solo al pulsarlo se conecta con Google y se inserta su mapa; Google puede recibir datos de conexión e instalar o leer cookies conforme a sus políticas.</p>
				<p>Consulta la <a href="https://policies.google.com/privacy?hl=es" target="_blank" rel="noopener noreferrer">política de privacidad de Google</a> y su <a href="https://policies.google.com/technologies/cookies?hl=es" target="_blank" rel="noopener noreferrer">información sobre cookies</a>. Si prefieres no cargarlo dentro de la web, puedes usar «Cómo llegar», que abre el servicio externo solo cuando pulsas el enlace.</p>
				<p>No guardamos la decisión de cargar el mapa en el navegador. Si recargas la página, volverá a mostrarse el botón antes de conectar con Google.</p>
			</section>
			<section>
				<h2>4. Cómo borrar el almacenamiento</h2>
				<p>En los ajustes de privacidad del navegador, abre los datos o permisos de sitios web, busca esta web y elimina sus cookies y datos almacenados. En las herramientas de desarrollo también puedes abrir «Almacenamiento» o «Aplicación», entrar en «Almacenamiento local» y borrar las claves de esta tabla.</p>
				<p>Se perderán el carrito, los accesos recientes a pedidos, los datos recordados y las preferencias de ese navegador. Si eres personal, tendrás que iniciar sesión de nuevo. Esto no cancela ni borra pedidos del servidor.</p>
				<p>Para dejar de recordar nombre y teléfono, también puedes desmarcar la casilla al enviar tu próximo pedido. Para borrar las cookies que Google hubiera instalado, revisa además los datos de sus dominios en el navegador.</p>
			</section>
		</PaginaLegal>
	);
}
