ALTER TABLE cierres_diarios
	DROP CONSTRAINT IF EXISTS cierres_diarios_criterio_check,
	DROP CONSTRAINT IF EXISTS cierres_diarios_resumen_check;

UPDATE negocio
SET datos = datos || jsonb_build_object(
	'cierre_incluye_listos',
	CASE
		WHEN datos->>'cierre_incluye_listos' IN ('true', 'false')
			THEN (datos->>'cierre_incluye_listos')::boolean
		ELSE false
	END
)
WHERE id = 1;

UPDATE cierres_diarios
SET resumen = jsonb_set(
	resumen,
	'{criterio}',
	jsonb_build_object(
		'incluye_listos',
		COALESCE(
			(resumen->'criterio'->>'incluye_listos')::boolean,
			resumen->'criterio'->>'valor' = 'entregados_y_listos'
		),
		'descripcion',
		CASE
			WHEN COALESCE(
				(resumen->'criterio'->>'incluye_listos')::boolean,
				resumen->'criterio'->>'valor' = 'entregados_y_listos'
			) THEN 'Pedidos entregados y listos para recoger'
			ELSE 'Solo pedidos entregados'
		END
	)
)
WHERE resumen->'criterio' IS NOT NULL;

ALTER TABLE cierres_diarios
	ADD CONSTRAINT cierres_diarios_criterio_check
	CHECK (jsonb_typeof(resumen->'criterio'->'incluye_listos') = 'boolean');
