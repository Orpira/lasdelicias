CREATE TABLE cuentas (
	id                bigserial PRIMARY KEY,
	mesa_numero       integer NOT NULL REFERENCES mesas(numero),
	estado            text NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','cobrada','anulada')),
	abierta_at        timestamptz NOT NULL DEFAULT now(),
	cerrada_at        timestamptz,
	total             numeric(10,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
	metodo_pago       text CHECK (metodo_pago IN ('efectivo','tarjeta','bizum','otro')),
	cerrada_por       uuid REFERENCES staff(id),
	motivo_anulacion  text
);
CREATE UNIQUE INDEX cuentas_mesa_abierta_idx ON cuentas (mesa_numero) WHERE estado = 'abierta';

ALTER TABLE pedidos
	ADD COLUMN cuenta_id bigint REFERENCES cuentas(id),
	ADD COLUMN pagado_at timestamptz,
	ADD COLUMN metodo_pago text CHECK (metodo_pago IN ('efectivo','tarjeta','bizum','otro')),
	ADD CONSTRAINT pedidos_pago_coherente CHECK ((pagado_at IS NULL) = (metodo_pago IS NULL));
CREATE INDEX pedidos_cuenta_idx ON pedidos (cuenta_id) WHERE cuenta_id IS NOT NULL;
CREATE INDEX pedidos_pendientes_cobro_idx ON pedidos (created_at)
	WHERE tipo IN ('recoger','whatsapp') AND estado = 'entregado' AND pagado_at IS NULL;

-- Solo se recuperan visitas en curso; no se dan por hechos los pagos históricos.
INSERT INTO cuentas (mesa_numero, abierta_at)
SELECT mesa_numero, min(created_at) FROM pedidos
WHERE tipo = 'mesa' AND estado IN ('nuevo','preparando','listo')
GROUP BY mesa_numero;
UPDATE pedidos p SET cuenta_id = c.id
FROM cuentas c
WHERE p.tipo = 'mesa' AND p.mesa_numero = c.mesa_numero
	AND p.estado IN ('nuevo','preparando','listo') AND c.estado = 'abierta';
UPDATE cuentas c SET total = (
	SELECT COALESCE(sum(p.total), 0) FROM pedidos p WHERE p.cuenta_id = c.id AND p.estado <> 'cancelado'
);

CREATE FUNCTION recalcular_cuenta(identificador bigint) RETURNS void AS $$
DECLARE
	importe numeric(10,2);
	vacia boolean;
BEGIN
	IF identificador IS NULL THEN RETURN; END IF;
	SELECT COALESCE(sum(total) FILTER (WHERE estado <> 'cancelado'), 0), count(*) = 0
	INTO importe, vacia FROM pedidos WHERE cuenta_id = identificador;
	UPDATE cuentas SET total = importe,
		estado = CASE WHEN vacia THEN 'anulada' ELSE 'abierta' END,
		cerrada_at = CASE WHEN vacia THEN now() END,
		motivo_anulacion = CASE WHEN vacia THEN 'sin pedidos' END
	WHERE id = identificador AND estado = 'abierta';
END $$ LANGUAGE plpgsql;

CREATE FUNCTION recalcular_cuentas_pedido() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		PERFORM recalcular_cuenta(OLD.cuenta_id);
		RETURN OLD;
	ELSIF TG_OP = 'INSERT' THEN
		PERFORM recalcular_cuenta(NEW.cuenta_id);
	ELSE
		IF OLD.cuenta_id IS DISTINCT FROM NEW.cuenta_id THEN
			PERFORM recalcular_cuenta(OLD.cuenta_id);
		END IF;
		IF ROW(NEW.cuenta_id, NEW.estado, NEW.total) IS DISTINCT FROM ROW(OLD.cuenta_id, OLD.estado, OLD.total) THEN
			PERFORM recalcular_cuenta(NEW.cuenta_id);
		END IF;
	END IF;
	RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER pedidos_recalcular_cuentas AFTER INSERT OR UPDATE OF cuenta_id, estado, total OR DELETE ON pedidos
	FOR EACH ROW EXECUTE FUNCTION recalcular_cuentas_pedido();

CREATE FUNCTION notificar_cuenta() RETURNS trigger AS $$
DECLARE
	actual cuentas%ROWTYPE;
	tipo_evento text := 'cuenta.actualizada';
BEGIN
	SELECT * INTO actual FROM cuentas WHERE id = NEW.id;
	IF NOT FOUND THEN RETURN NEW; END IF;
	IF TG_OP = 'UPDATE' AND NEW.estado IS DISTINCT FROM OLD.estado THEN
		tipo_evento := CASE NEW.estado
			WHEN 'cobrada' THEN 'cuenta.cobrada'
			WHEN 'anulada' THEN 'cuenta.anulada'
			ELSE 'cuenta.actualizada' END;
	END IF;
	PERFORM pg_notify('delicias', json_build_object(
		'tipo', tipo_evento, 'id', actual.id::text, 'mesa_numero', actual.mesa_numero,
		'total', actual.total, 'metodo_pago', actual.metodo_pago
	)::text);
	RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER cuentas_notificar AFTER INSERT OR UPDATE ON cuentas
	DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION notificar_cuenta();

CREATE OR REPLACE FUNCTION notificar_pedido() RETURNS trigger AS $$
DECLARE
	tipo_evento text;
BEGIN
	IF TG_OP = 'INSERT' THEN
		tipo_evento := 'pedido.creado';
	ELSIF NEW.estado IS DISTINCT FROM OLD.estado THEN
		tipo_evento := 'pedido.estado';
	ELSIF NEW.pagado_at IS DISTINCT FROM OLD.pagado_at THEN
		tipo_evento := 'pedido.pagado';
	ELSIF ROW(NEW.mesa_numero, NEW.cuenta_id) IS DISTINCT FROM ROW(OLD.mesa_numero, OLD.cuenta_id) THEN
		tipo_evento := 'pedido.mesa';
	ELSE
		RETURN NEW;
	END IF;
	PERFORM pg_notify('delicias', json_build_object(
		'tipo', tipo_evento, 'id', NEW.id, 'estado', NEW.estado,
		'estado_anterior', CASE WHEN TG_OP = 'UPDATE' THEN OLD.estado END
	)::text);
	RETURN NEW;
END $$ LANGUAGE plpgsql;
