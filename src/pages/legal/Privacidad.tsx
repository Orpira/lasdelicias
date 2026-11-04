import { useState } from "react";
import { Link } from "react-router-dom";
import { useNegocio } from "../../lib/negocio";
import { DatoLegal, DatosResponsable, PaginaLegal } from "./ContenidoLegal";

export default function Privacidad() {
	const [error, setError] = useState("");
	const negocio = useNegocio(setError);
	const meses = negocio?.conservacion_meses ?? 12;

	return (
		<PaginaLegal titulo="Política de privacidad" error={error}>
			<section>
				<h2>1. Responsable del tratamiento</h2>
				<p className="mb-4">El responsable es el titular del negocio indicado a continuación. Esta política informa del tratamiento de datos conforme al artículo 13 del Reglamento General de Protección de Datos (RGPD).</p>
				<DatosResponsable negocio={negocio} />
			</section>
			<section>
				<h2>2. Qué datos tratamos y para qué</h2>
				<ul>
					<li><strong>Pedidos:</strong> nombre, teléfono, productos, horario y notas que facilites, para preparar y entregar lo solicitado y avisarte cuando esté listo. También se registran el importe, la fecha y el método del cobro realizado en el local. La app no procesa pagos ni recoge datos bancarios o de tarjetas. En los pedidos para recoger, el aviso puede enviarse por WhatsApp al teléfono facilitado. El teléfono es opcional en los pedidos de mesa.</li>
					<li><strong>Mesas y dispositivo:</strong> número de mesa e identificador aleatorio del dispositivo, para entregar en la mesa correcta y detectar cambios de mesa. El identificador no contiene tu nombre ni teléfono por sí mismo, pero se asocia a tu pedido durante su conservación.</li>
					<li><strong>Opiniones:</strong> nombre, valoración y comentario, para revisarlos y publicarlos si se aprueban. El único dato identificativo que se muestra es el nombre que elijas; también se muestran la valoración y el comentario aprobados, nunca el teléfono ni el código del pedido.</li>
					<li><strong>Personal:</strong> nombre, email y credenciales de las cuentas autorizadas, para controlar el acceso al panel y registrar quién cobra o anula las cuentas de mesa. Las contraseñas se almacenan mediante hash.</li>
				</ul>
				<p>Recordar tu nombre y teléfono en el navegador es opcional. Solo se guardan para próximas visitas si marcas la casilla correspondiente al enviar el pedido. No marcarla no impide hacer pedidos.</p>
			</section>
			<section>
				<h2>3. Base jurídica</h2>
				<ul>
					<li><strong>Ejecución del pedido solicitado</strong> (artículo 6.1.b del RGPD): preparar, entregar y comunicar el estado de tu pedido y registrar su cobro en el local.</li>
					<li><strong>Interés legítimo en la seguridad</strong> (artículo 6.1.f): evitar entregas en una mesa equivocada, gestionar cambios de mesa, proteger los accesos del personal y mantener la trazabilidad de los cierres de cuenta.</li>
					<li><strong>Consentimiento</strong> (artículo 6.1.a): publicar la opinión que envías voluntariamente y recordar tus datos cuando lo solicitas. Puedes retirar tu consentimiento, sin que afecte a la licitud del tratamiento anterior.</li>
				</ul>
			</section>
			<section>
				<h2>4. Plazos de conservación</h2>
				<p>Una tarea automática diaria anonimiza los datos personales de los pedidos con más de <strong>{meses} meses</strong> de antigüedad: sustituye el nombre por «Cliente», vacía teléfono y notas y elimina la relación con el dispositivo y la ficha del cliente. También elimina las fichas de clientes sin pedidos dentro de ese plazo. Los importes y las líneas de producto se conservan sin esos datos identificativos.</p>
				<p>Las opiniones publicadas se conservan como contenido público con tu consentimiento y no se borran con la anonimización de pedidos. Puedes retirar el consentimiento y solicitar su supresión. Las cuentas del personal se gestionan mientras sean necesarias para administrar los accesos y atender las responsabilidades aplicables.</p>
				<p>Los datos del navegador tienen las duraciones explicadas en la <Link to="/cookies">política de cookies y almacenamiento</Link>. Borrarlos del dispositivo no elimina por sí solo un pedido del servidor.</p>
			</section>
			<section>
				<h2>5. Encargado y destinatarios</h2>
				<p>El proveedor tecnológico que aloja la aplicación, con servidor en la Unión Europea, es: <DatoLegal campo="nombre del encargado del tratamiento" />.</p>
				<p>No se ceden datos a terceros salvo obligación legal. Los proveedores tecnológicos prestan los servicios necesarios para el funcionamiento de la aplicación. El aviso por WhatsApp se envía mediante el servicio de mensajería del propio negocio, sujeto también a las <a href="https://www.whatsapp.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">condiciones de privacidad de WhatsApp</a>.</p>
				<p>Google Maps solo se carga si pulsas «Ver mapa». Antes de hacerlo puedes consultar la información sobre ese servicio en la <Link to="/cookies">política de cookies</Link>.</p>
			</section>
			<section>
				<h2>6. Tus derechos</h2>
				<p>Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, limitación del tratamiento y portabilidad escribiendo a {negocio?.email_contacto ? (
					<a href={`mailto:${negocio.email_contacto}`}>{negocio.email_contacto}</a>
				) : <DatoLegal campo="email de contacto" />}. Indica el derecho que deseas ejercer y la información necesaria para localizar tu solicitud; solo se pedirá información adicional de identificación cuando resulte necesaria.</p>
				<p>Si consideras que tus derechos no se han atendido adecuadamente, puedes reclamar ante la Agencia Española de Protección de Datos: <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">www.aepd.es</a>.</p>
			</section>
		</PaginaLegal>
	);
}
