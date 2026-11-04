UPDATE negocio
SET datos = jsonb_build_object(
	'cierre_criterio',
	CASE
		WHEN datos->>'cierre_criterio' IN ('cobrados', 'entregados', 'entregados_y_listos')
			THEN datos->>'cierre_criterio'
		WHEN datos->>'cierre_incluye_listos' = 'true' THEN 'entregados_y_listos'
		ELSE 'cobrados'
	END
) || (datos - 'cierre_criterio' - 'cierre_incluye_listos')
WHERE id = 1;

ALTER TABLE cierres_diarios
	DROP CONSTRAINT cierres_diarios_resumen_check,
	ADD CONSTRAINT cierres_diarios_criterio_check
	CHECK (resumen->'criterio'->>'valor' IN ('cobrados', 'entregados', 'entregados_y_listos'));
