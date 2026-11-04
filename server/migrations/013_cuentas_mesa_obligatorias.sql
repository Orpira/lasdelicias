-- Todo pedido de mesa debe pertenecer a una cuenta para impedir cobros huérfanos.

-- Recupera pedidos históricos sin cuenta. Si había una cuenta abierta para la mesa
-- se reutiliza; en otro caso se crea una cuenta de recuperación.
INSERT INTO cuentas (mesa_numero, abierta_at)
SELECT p.mesa_numero, min(p.created_at)
FROM pedidos p
LEFT JOIN cuentas c ON c.mesa_numero = p.mesa_numero AND c.estado = 'abierta'
WHERE p.tipo = 'mesa' AND p.cuenta_id IS NULL AND c.id IS NULL
GROUP BY p.mesa_numero;

UPDATE pedidos p
SET cuenta_id = c.id
FROM cuentas c
WHERE p.tipo = 'mesa' AND p.cuenta_id IS NULL
	AND c.mesa_numero = p.mesa_numero AND c.estado = 'abierta';

ALTER TABLE pedidos
	ADD CONSTRAINT pedidos_mesa_cuenta_obligatoria
	CHECK (tipo <> 'mesa' OR cuenta_id IS NOT NULL) NOT VALID;

ALTER TABLE pedidos VALIDATE CONSTRAINT pedidos_mesa_cuenta_obligatoria;
