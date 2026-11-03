-- Stock de productos envasados (refrescos, agua, tortas…) y enlace con la caja (TPV).
--
-- stock NULL  → el producto no lleva control de unidades (lo que se prepara en cocina).
-- stock 0..N  → unidades disponibles; cada pedido descuenta y a 0 pasa a "agotado".
-- codigo_tpv  → código del artículo en la caja; si hay integración, la caja manda.

ALTER TABLE productos
	ADD COLUMN stock        integer CHECK (stock IS NULL OR stock >= 0),
	ADD COLUMN stock_minimo integer NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
	ADD COLUMN codigo_tpv   text;

CREATE UNIQUE INDEX productos_codigo_tpv_idx ON productos (codigo_tpv) WHERE codigo_tpv IS NOT NULL AND activo;

-- Registro de sincronizaciones con la caja (para diagnosticar desde el panel)
CREATE TABLE sincronizaciones_tpv (
	id            bigserial PRIMARY KEY,
	origen        text NOT NULL,              -- loyverse | revo | agora | n8n | ...
	ok            boolean NOT NULL,
	actualizados  integer NOT NULL DEFAULT 0,
	sin_enlazar   integer NOT NULL DEFAULT 0, -- códigos de la caja que no están en la carta
	mensaje       text NOT NULL DEFAULT '',
	created_at    timestamptz NOT NULL DEFAULT now()
);

-- Aviso de stock bajo para n8n (y el panel) cuando el stock cruza el mínimo o llega a 0
CREATE FUNCTION notificar_stock() RETURNS trigger AS $$
BEGIN
	IF NEW.stock IS NOT NULL
	   AND NEW.stock IS DISTINCT FROM OLD.stock
	   AND NEW.stock <= NEW.stock_minimo
	   AND (OLD.stock IS NULL OR OLD.stock > NEW.stock_minimo OR NEW.stock = 0) THEN
		PERFORM pg_notify('delicias', json_build_object(
			'tipo', CASE WHEN NEW.stock = 0 THEN 'stock.agotado' ELSE 'stock.bajo' END,
			'id', NEW.id, 'nombre', NEW.nombre, 'stock', NEW.stock, 'stock_minimo', NEW.stock_minimo
		)::text);
	END IF;
	RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER productos_stock_notificar AFTER UPDATE OF stock ON productos
	FOR EACH ROW EXECUTE FUNCTION notificar_stock();

-- Productos envasados de la carta de demo: con control de unidades
UPDATE productos SET stock = 24, stock_minimo = 6 WHERE nombre IN ('Refresco', 'Agua mineral');
UPDATE productos SET stock = 10, stock_minimo = 3 WHERE nombre = 'Tortas de aceite rellenas de chocolate';
