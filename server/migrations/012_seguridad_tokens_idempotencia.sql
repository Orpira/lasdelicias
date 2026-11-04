-- Endurecimiento de seguridad (auditoría P0).

-- 1) Tokens de mesa de 128 bits (32 hexadecimales) en lugar de 64.
--    gen_random_uuid() usa el generador criptográfico de Postgres; se mezclan dos
--    UUID (244 bits aleatorios) con SHA-256 y se conservan 128 bits.
--    ATENCIÓN: regenera TODOS los tokens → hay que reimprimir los QR de las mesas.
CREATE OR REPLACE FUNCTION nuevo_token_mesa() RETURNS text AS $$
	SELECT substr(encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex'), 1, 32)
$$ LANGUAGE sql VOLATILE;

UPDATE mesas SET token = nuevo_token_mesa();
ALTER TABLE mesas ADD CONSTRAINT mesas_token_formato CHECK (token ~ '^[a-f0-9]{32}$');

-- 2) Idempotencia de pedidos: un reintento con la misma Idempotency-Key
--    devuelve el pedido ya creado en vez de duplicarlo.
ALTER TABLE pedidos
	ADD COLUMN idempotencia_clave  text,
	ADD COLUMN idempotencia_huella text;
CREATE UNIQUE INDEX pedidos_idempotencia_idx ON pedidos (idempotencia_clave) WHERE idempotencia_clave IS NOT NULL;
