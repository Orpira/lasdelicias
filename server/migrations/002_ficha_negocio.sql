-- Ficha del negocio: fuente única de verdad para la web, n8n (agente de WhatsApp,
-- respuestas automáticas, publicaciones) y cualquier canal futuro.
-- Una sola fila; se edita desde el panel (PUT /admin/negocio).

CREATE TABLE negocio (
	id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
	datos       jsonb NOT NULL,
	updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER negocio_updated BEFORE UPDATE ON negocio
	FOR EACH ROW EXECUTE FUNCTION tocar_updated_at();

-- Datos públicos encontrados (Páginas Amarillas e Instagram).
-- Horario: solo está confirmado el martes; null = pendiente de confirmar con el negocio.
INSERT INTO negocio (datos) VALUES ($json${
	"nombre": "Panadería Cafetería Las Delicias",
	"lema": "Cafetería ~ Panadería",
	"descripcion": "Panadería, pastelería, cafetería y obrador. Elaboración artesana: pan, pasteles, empanadas, repostería, comida casera para llevar y tartas por encargo.",
	"direccion": "Calle Ayala, 28, 29002 Málaga",
	"referencia": "A 400 m de la estación María Zambrano",
	"telefono": "+34633272668",
	"whatsapp": "+34633272668",
	"instagram": "pc_lasdelicias2019",
	"servicios": ["Servicio en mesa", "Para llevar", "Servicio a domicilio", "Comida casera para llevar", "Tartas por encargo"],
	"horario": {
		"lunes": null,
		"martes": "07:00–19:00",
		"miercoles": null,
		"jueves": null,
		"viernes": null,
		"sabado": null,
		"domingo": null
	}
}$json$);
