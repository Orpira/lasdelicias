import { useState } from "react";
import { useNegocio } from "../../lib/negocio";
import { DatoLegal, DatosResponsable, PaginaLegal } from "./ContenidoLegal";

export default function AvisoLegal() {
	const [error, setError] = useState("");
	const negocio = useNegocio(setError);

	return (
		<PaginaLegal titulo="Aviso legal" error={error}>
			<section>
				<h2>1. Identificación del titular</h2>
				<p className="mb-4">En cumplimiento del artículo 10 de la Ley 34/2002, de servicios de la sociedad de la información y de comercio electrónico (LSSI), se facilita la siguiente información:</p>
				<DatosResponsable negocio={negocio} />
				<p>Datos de inscripción registral, si corresponden al titular: <DatoLegal campo="datos registrales, si procede" />.</p>
			</section>
			<section>
				<h2>2. Objeto de la web</h2>
				<p>Esta web informa sobre la carta, los horarios y los servicios de {negocio?.nombre ?? "Las Delicias"}. Permite solicitar pedidos para tomar en el local o recoger, seguir su preparación, llamar al personal desde una mesa y compartir opiniones.</p>
				<p>Los pedidos se pagan en el local. La disponibilidad de los productos puede cambiar; el personal atenderá las incidencias relacionadas con el pedido.</p>
			</section>
			<section>
				<h2>3. Propiedad intelectual</h2>
				<p>Los textos, fotografías, imágenes y elementos identificativos propios del negocio están protegidos por la normativa de propiedad intelectual e industrial. Su reproducción o utilización fuera de los usos permitidos por la ley requiere la autorización de quien ostente los derechos.</p>
				<p>Las marcas, contenidos y servicios de terceros mantienen sus respectivos derechos. La existencia de un enlace no implica que el negocio sea titular de la web enlazada.</p>
			</section>
			<section>
				<h2>4. Uso y responsabilidad</h2>
				<p>Utiliza la web de forma lícita y facilita información correcta al realizar un pedido. Procuramos mantener la información actualizada y el servicio disponible, pero pueden producirse errores o interrupciones técnicas. Si detectas una incidencia, contacta con el negocio.</p>
				<p>Los servicios externos enlazados tienen sus propias condiciones y políticas. Esta información no excluye las responsabilidades que legalmente correspondan ni limita los derechos de las personas consumidoras.</p>
			</section>
			<section>
				<h2>5. Legislación aplicable</h2>
				<p>Se aplica la legislación española, incluida la normativa de protección de las personas consumidoras. Cualquier controversia se resolverá ante los juzgados y tribunales que correspondan conforme a la ley, sin imponer una renuncia a los derechos de la persona consumidora.</p>
			</section>
		</PaginaLegal>
	);
}
