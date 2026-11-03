-- Mesas con código secreto en el QR y control de cambios de mesa.

-- 1) Cada mesa tiene un token aleatorio: el QR lleva el token, no el número.
--    Así nadie puede "inventarse" una mesa escribiendo la URL a mano,
--    y el personal puede regenerarlo para invalidar un QR antiguo o fotografiado.
CREATE FUNCTION nuevo_token_mesa() RETURNS text AS $$
	SELECT substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)
$$ LANGUAGE sql VOLATILE;

ALTER TABLE mesas ADD COLUMN token text;
UPDATE mesas SET token = nuevo_token_mesa();
ALTER TABLE mesas ALTER COLUMN token SET NOT NULL,
                  ALTER COLUMN token SET DEFAULT nuevo_token_mesa(),
                  ADD CONSTRAINT mesas_token_unico UNIQUE (token);

-- 2) Seguimiento de cambios de mesa en los pedidos
ALTER TABLE pedidos
	ADD COLUMN dispositivo   text,      -- id anónimo del móvil que hizo el pedido
	ADD COLUMN mesa_anterior integer,   -- mesa en la que estaba antes
	ADD COLUMN cambio_mesa   text CHECK (cambio_mesa IN ('declarado','detectado'));
CREATE INDEX pedidos_dispositivo_idx ON pedidos (dispositivo, fecha) WHERE dispositivo IS NOT NULL;

-- 3) El aviso en tiempo real también salta cuando un pedido cambia de mesa
CREATE OR REPLACE FUNCTION notificar_pedido() RETURNS trigger AS $$
DECLARE
	tipo_evento text;
BEGIN
	IF TG_OP = 'INSERT' THEN
		tipo_evento := 'pedido.creado';
	ELSIF NEW.estado IS DISTINCT FROM OLD.estado THEN
		tipo_evento := 'pedido.estado';
	ELSIF NEW.mesa_numero IS DISTINCT FROM OLD.mesa_numero THEN
		tipo_evento := 'pedido.mesa';
	ELSE
		RETURN NEW;
	END IF;
	PERFORM pg_notify('delicias', json_build_object(
		'tipo', tipo_evento,
		'id', NEW.id,
		'estado', NEW.estado,
		'estado_anterior', CASE WHEN TG_OP = 'UPDATE' THEN OLD.estado END
	)::text);
	RETURN NEW;
END $$ LANGUAGE plpgsql;
