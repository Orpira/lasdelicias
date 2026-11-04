ALTER TABLE pedidos
	ADD COLUMN fuera_horario boolean NOT NULL DEFAULT false,
	ADD COLUMN atender_desde timestamptz;

UPDATE negocio
SET datos = datos || jsonb_build_object('dias_cerrado', '[]'::jsonb)
WHERE NOT (datos ? 'dias_cerrado');

CREATE INDEX pedidos_programados_idx ON pedidos (atender_desde)
	WHERE atender_desde IS NOT NULL AND estado IN ('nuevo', 'preparando', 'listo');
