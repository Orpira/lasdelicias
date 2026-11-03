-- Las Delicias · esquema inicial
-- Todas las fechas "del día" se calculan en hora de Madrid.

CREATE TABLE productos (
	id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	nombre       text NOT NULL CHECK (length(trim(nombre)) > 0),
	descripcion  text NOT NULL DEFAULT '',
	precio       numeric(8,2) NOT NULL CHECK (precio >= 0),
	categoria    text NOT NULL CHECK (categoria IN ('Desayunos','Almuerzos','Comida casera','Pastelería','Bebidas')),
	valoracion   smallint NOT NULL DEFAULT 5 CHECK (valoracion BETWEEN 1 AND 5),
	imagen_url   text NOT NULL DEFAULT '',
	sin_gluten   boolean NOT NULL DEFAULT false,
	alergenos    text[] NOT NULL DEFAULT '{}',
	disponible   boolean NOT NULL DEFAULT true,   -- false = agotado hoy
	activo       boolean NOT NULL DEFAULT true,   -- false = retirado de la carta (borrado lógico)
	orden        integer NOT NULL DEFAULT 0,
	created_at   timestamptz NOT NULL DEFAULT now(),
	updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX productos_categoria_idx ON productos (categoria, orden) WHERE activo;

CREATE TABLE mesas (
	numero  integer PRIMARY KEY CHECK (numero > 0),
	nombre  text NOT NULL DEFAULT '',
	activa  boolean NOT NULL DEFAULT true
);

CREATE TABLE clientes (
	id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	telefono       text NOT NULL UNIQUE,
	nombre         text NOT NULL DEFAULT '',
	sellos         integer NOT NULL DEFAULT 0 CHECK (sellos >= 0),
	acepta_avisos  boolean NOT NULL DEFAULT false,
	created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pedidos (
	id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	codigo          text NOT NULL UNIQUE,              -- código público para el seguimiento
	fecha           date NOT NULL,                     -- día de Madrid en que se hizo
	numero_dia      integer NOT NULL,                  -- #1, #2… se reinicia cada día
	cliente_id      uuid REFERENCES clientes(id) ON DELETE SET NULL,
	nombre_cliente  text NOT NULL,
	telefono        text NOT NULL DEFAULT '',
	tipo            text NOT NULL CHECK (tipo IN ('mesa','recoger','whatsapp')),
	mesa_numero     integer REFERENCES mesas(numero),
	hora_recogida   timestamptz,
	notas           text NOT NULL DEFAULT '',
	estado          text NOT NULL DEFAULT 'nuevo'
	                CHECK (estado IN ('nuevo','preparando','listo','entregado','cancelado')),
	total           numeric(10,2) NOT NULL CHECK (total >= 0),
	created_at      timestamptz NOT NULL DEFAULT now(),
	updated_at      timestamptz NOT NULL DEFAULT now(),
	UNIQUE (fecha, numero_dia),
	CHECK (tipo <> 'mesa' OR mesa_numero IS NOT NULL)
);
CREATE INDEX pedidos_activos_idx ON pedidos (fecha, estado);

CREATE TABLE pedido_items (
	id               bigserial PRIMARY KEY,
	pedido_id        uuid NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
	producto_id      uuid REFERENCES productos(id) ON DELETE SET NULL,
	nombre           text NOT NULL,                -- copia: el pedido no cambia si cambia la carta
	precio_unitario  numeric(8,2) NOT NULL,
	cantidad         integer NOT NULL CHECK (cantidad BETWEEN 1 AND 50)
);
CREATE INDEX pedido_items_pedido_idx ON pedido_items (pedido_id);

CREATE TABLE llamadas_mesa (
	id           bigserial PRIMARY KEY,
	mesa_numero  integer NOT NULL REFERENCES mesas(numero),
	motivo       text NOT NULL CHECK (motivo IN ('atencion','cuenta')),
	atendida     boolean NOT NULL DEFAULT false,
	created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE staff (
	id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	email          text NOT NULL UNIQUE CHECK (email = lower(email)),
	nombre         text NOT NULL,
	password_hash  text NOT NULL,
	rol            text NOT NULL DEFAULT 'barra' CHECK (rol IN ('admin','barra')),
	activo         boolean NOT NULL DEFAULT true,
	created_at     timestamptz NOT NULL DEFAULT now()
);

-- updated_at automático
CREATE FUNCTION tocar_updated_at() RETURNS trigger AS $$
BEGIN
	NEW.updated_at = now();
	RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER productos_updated BEFORE UPDATE ON productos
	FOR EACH ROW EXECUTE FUNCTION tocar_updated_at();
CREATE TRIGGER pedidos_updated BEFORE UPDATE ON pedidos
	FOR EACH ROW EXECUTE FUNCTION tocar_updated_at();

-- Cada cambio relevante se publica en el canal "delicias".
-- La API lo escucha (LISTEN) y lo reparte al panel del local, al seguimiento del cliente y a n8n.
-- Así también llegan los cambios que haga n8n escribiendo directamente en la base de datos.
CREATE FUNCTION notificar_pedido() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'UPDATE' AND NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
		RETURN NEW;
	END IF;
	PERFORM pg_notify('delicias', json_build_object(
		'tipo', CASE WHEN TG_OP = 'INSERT' THEN 'pedido.creado' ELSE 'pedido.estado' END,
		'id', NEW.id,
		'estado', NEW.estado,
		'estado_anterior', CASE WHEN TG_OP = 'UPDATE' THEN OLD.estado END
	)::text);
	RETURN NEW;
END $$ LANGUAGE plpgsql;

-- DEFERRABLE: el aviso de INSERT sale al confirmar la transacción, cuando las líneas ya existen.
CREATE CONSTRAINT TRIGGER pedidos_notificar AFTER INSERT OR UPDATE ON pedidos
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION notificar_pedido();

CREATE FUNCTION notificar_llamada() RETURNS trigger AS $$
BEGIN
	PERFORM pg_notify('delicias', json_build_object(
		'tipo', CASE WHEN TG_OP = 'INSERT' THEN 'mesa.llamada' ELSE 'mesa.atendida' END,
		'id', NEW.id,
		'mesa', NEW.mesa_numero,
		'motivo', NEW.motivo
	)::text);
	RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER llamadas_notificar AFTER INSERT OR UPDATE OF atendida ON llamadas_mesa
	FOR EACH ROW EXECUTE FUNCTION notificar_llamada();

-- Mesas de partida (se pueden cambiar desde SQL o desde el panel más adelante)
INSERT INTO mesas (numero, nombre)
SELECT n, 'Mesa ' || n FROM generate_series(1, 8) AS n;
