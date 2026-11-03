-- Completa la ficha sin inventar datos del titular ni sobrescribir valores existentes.
UPDATE negocio
SET datos = datos || jsonb_build_object(
	'titular', datos->'titular',
	'nif', datos->'nif',
	'email_contacto', datos->'email_contacto',
	'conservacion_meses', COALESCE(datos->'conservacion_meses', '12'::jsonb)
)
WHERE id = 1;
