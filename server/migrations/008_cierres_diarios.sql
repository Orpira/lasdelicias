UPDATE negocio
SET datos = datos || jsonb_build_object('cierre_incluye_listos', false)
WHERE NOT (datos ? 'cierre_incluye_listos');

CREATE TABLE cierres_diarios (
	fecha        date PRIMARY KEY,
	resumen      jsonb NOT NULL,
	cerrado_at   timestamptz NOT NULL DEFAULT now(),
	cerrado_por  uuid REFERENCES staff(id),
	origen       text NOT NULL CHECK (origen IN ('personal', 'n8n')),
	CHECK ((jsonb_typeof(resumen->'criterio'->'incluye_listos') = 'boolean') IS TRUE),
	CHECK ((resumen->>'fecha' = fecha::text) IS TRUE)
);
