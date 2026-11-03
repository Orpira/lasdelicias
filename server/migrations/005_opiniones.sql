-- Opiniones de clientes: valoración (1–5) y comentario.
-- Nada se publica sin aprobación del personal; las de un pedido real llevan "verificada".

CREATE TABLE opiniones (
	id             bigserial PRIMARY KEY,
	nombre         text NOT NULL CHECK (length(trim(nombre)) BETWEEN 1 AND 40),
	puntuacion     smallint NOT NULL CHECK (puntuacion BETWEEN 1 AND 5),
	comentario     text NOT NULL DEFAULT '' CHECK (length(comentario) <= 500),
	pedido_codigo  text UNIQUE REFERENCES pedidos(codigo) ON DELETE SET NULL,  -- una opinión por pedido
	verificada     boolean NOT NULL DEFAULT false,
	estado         text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','publicada','oculta')),
	created_at     timestamptz NOT NULL DEFAULT now(),
	revisada_at    timestamptz
);
CREATE INDEX opiniones_publicadas_idx ON opiniones (estado) WHERE estado = 'publicada';

-- Aviso a n8n (y al panel) cuando llega una opinión nueva para revisar
CREATE FUNCTION notificar_opinion() RETURNS trigger AS $$
BEGIN
	PERFORM pg_notify('delicias', json_build_object(
		'tipo', 'opinion.nueva', 'id', NEW.id, 'nombre', NEW.nombre,
		'puntuacion', NEW.puntuacion, 'comentario', NEW.comentario, 'verificada', NEW.verificada
	)::text);
	RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER opiniones_notificar AFTER INSERT ON opiniones
	FOR EACH ROW EXECUTE FUNCTION notificar_opinion();

-- Enlace a la ficha pública donde también se puede opinar
UPDATE negocio SET datos = datos || jsonb_build_object('resenas_externas', jsonb_build_array(
	jsonb_build_object(
		'sitio', 'Páginas Amarillas',
		'url', 'https://www.paginasamarillas.es/f/malaga/panaderia-cafeteria-las-delicias_229992508_000000001.html'
	)
))
WHERE NOT (datos ? 'resenas_externas');
