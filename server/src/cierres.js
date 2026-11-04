import { transaccion } from "./db.js";
import { config } from "./config.js";
import { bloquearCuentas } from "./cuentas.js";
import { ErrorOperacion } from "./errores.js";
import { esquemaConfiguracionCierre, esquemaConsultaCierre, esquemaFechaCierre, validar } from "./esquemas.js";

const NOMBRES_TIPO = { mesa: "En mesa", recoger: "Para recoger", whatsapp: "WhatsApp" };
const METODOS = ["efectivo", "tarjeta", "bizum", "otro"];
const DESCRIPCIONES = {
	cobrados: "Cobrado en caja",
	entregados: "Entregado",
	entregados_y_listos: "Entregado y listo para recoger",
};

/** Devuelve la única condición que define qué pedidos son ventas. */
export function filtroVenta(criterio, alias = "p") {
	if (criterio === "cobrados") return `${alias}.pagado_at IS NOT NULL AND ${alias}.estado <> 'cancelado'`;
	if (criterio === "entregados") return `${alias}.estado = 'entregado'`;
	if (criterio === "entregados_y_listos") return `${alias}.estado IN ('entregado', 'listo')`;
	throw new ErrorOperacion("El criterio de cierre no es válido", 400);
}

function descripcionCriterio(criterio) {
	return DESCRIPCIONES[criterio] ?? DESCRIPCIONES.cobrados;
}

function exigirAdministracion(usuario) {
	if (usuario?.rol !== "admin") throw new ErrorOperacion("Solo administración puede guardar el criterio y los cierres diarios", 403);
}

async function contextoCierre(conexion, bloquear = false) {
	const { rows: [negocio] } = await conexion.query(
		`SELECT datos, (now() AT TIME ZONE $1)::date::text AS hoy
		 FROM negocio WHERE id = 1${bloquear ? " FOR SHARE" : ""}`,
		[config.zonaHoraria],
	);
	if (!negocio) throw new ErrorOperacion("No existe la ficha del negocio para calcular el cierre", 500);
	const criterio = negocio.datos.cierre_criterio ?? (
		negocio.datos.cierre_incluye_listos === true ? "entregados_y_listos" : "cobrados"
	);
	if (!Object.hasOwn(DESCRIPCIONES, criterio)) throw new ErrorOperacion("El criterio de cierre de la ficha no es válido", 500);
	return { criterio, hoy: negocio.hoy };
}

function historicoCompatible(resumen) {
	if (resumen.criterio?.valor) return resumen;
	const valor = resumen.criterio?.incluye_listos ? "entregados_y_listos" : "entregados";
	return {
		...resumen,
		criterio: { valor, descripcion: descripcionCriterio(valor) },
		cobrados: resumen.cobrados ?? { pedidos: 0, importe: 0 },
		entregados_sin_cobrar: resumen.entregados_sin_cobrar ?? resumen.entregados ?? { pedidos: 0, importe: 0 },
		cobro: resumen.cobro ?? { total_cobrado: 0, por_metodo: METODOS.map((metodo) => ({ metodo, pedidos: 0, importe: 0 })) },
		pendiente_cobro: resumen.pendiente_cobro ?? {
			entregados_sin_cobrar: { pedidos: 0, importe: 0 },
			cuentas_abiertas: { pedidos: 0, importe: 0 },
		},
		anuladas: resumen.anuladas ?? { cuentas: 0, importe: 0, detalle: [] },
	};
}

function informe(resumen, contexto, cierre = null) {
	return {
		resumen: historicoCompatible(resumen),
		guardado: cierre !== null,
		cerrado_at: cierre?.cerrado_at ?? null,
		cerrado_por: cierre?.cerrado_por ?? null,
		origen: cierre?.origen ?? null,
		criterio_configurado: contexto.criterio,
		hoy: contexto.hoy,
	};
}

async function cierreGuardado(conexion, fecha) {
	const { rows } = await conexion.query("SELECT * FROM cierres_diarios WHERE fecha = $1::date", [fecha]);
	return rows[0] ?? null;
}

async function calcularResumen(conexion, fecha, criterio) {
	const venta = filtroVenta(criterio, "d");
	const { rows: [datos] } = await conexion.query(
		`WITH del_dia AS MATERIALIZED (
			SELECT id, tipo, estado, total, created_at, pagado_at, metodo_pago
			FROM pedidos WHERE fecha = $1::date
		), ventas AS (
			SELECT * FROM del_dia d WHERE ${venta}
		), lineas AS (
			SELECT v.id AS pedido_id, i.producto_id, i.nombre, i.cantidad, i.precio_unitario,
				COALESCE(pr.categoria, 'Sin categoría') AS categoria
			FROM ventas v JOIN pedido_items i ON i.pedido_id = v.id
			LEFT JOIN productos pr ON pr.id = i.producto_id
		), cifras AS (
			SELECT
				count(*)::int AS todos,
				count(*) FILTER (WHERE ${filtroVenta(criterio, "d")})::int AS pedidos,
				COALESCE(sum(total) FILTER (WHERE ${filtroVenta(criterio, "d")}), 0) AS importe,
				COALESCE(round(avg(total) FILTER (WHERE ${filtroVenta(criterio, "d")}), 2), 0) AS ticket_medio,
				count(*) FILTER (WHERE estado <> 'cancelado' AND pagado_at IS NOT NULL)::int AS cobrados_pedidos,
				COALESCE(sum(total) FILTER (WHERE estado <> 'cancelado' AND pagado_at IS NOT NULL), 0) AS cobrados_importe,
				count(*) FILTER (WHERE estado = 'entregado' AND pagado_at IS NULL)::int AS entregados_sin_cobrar_pedidos,
				COALESCE(sum(total) FILTER (WHERE estado = 'entregado' AND pagado_at IS NULL), 0) AS entregados_sin_cobrar_importe,
				count(*) FILTER (WHERE estado = 'listo' AND pagado_at IS NULL)::int AS listos_pedidos,
				COALESCE(sum(total) FILTER (WHERE estado = 'listo' AND pagado_at IS NULL), 0) AS listos_importe,
				count(*) FILTER (WHERE estado IN ('nuevo','preparando'))::int AS en_curso_pedidos,
				COALESCE(sum(total) FILTER (WHERE estado IN ('nuevo','preparando')), 0) AS en_curso_importe,
				count(*) FILTER (WHERE estado = 'cancelado')::int AS cancelados_pedidos,
				COALESCE(sum(total) FILTER (WHERE estado = 'cancelado'), 0) AS cancelados_importe
			FROM del_dia d
		), tipos AS (
			SELECT tipo, count(*)::int AS pedidos, sum(total) AS importe FROM ventas GROUP BY tipo
		), categorias AS (
			SELECT categoria AS nombre, count(DISTINCT pedido_id)::int AS pedidos,
				sum(cantidad)::int AS unidades, sum(cantidad * precio_unitario) AS importe
			FROM lineas GROUP BY categoria
		), productos AS (
			SELECT producto_id, nombre, categoria, count(DISTINCT pedido_id)::int AS pedidos,
				sum(cantidad)::int AS unidades, sum(cantidad * precio_unitario) AS importe
			FROM lineas GROUP BY producto_id, nombre, categoria
		), horas AS (
			SELECT extract(hour FROM created_at AT TIME ZONE $2)::int AS hora,
				count(*)::int AS pedidos, sum(total) AS importe FROM ventas GROUP BY 1
		), metodos AS (
			SELECT metodo_pago AS metodo, count(*)::int AS pedidos, sum(total) AS importe
			FROM del_dia WHERE pagado_at IS NOT NULL AND estado <> 'cancelado' GROUP BY metodo_pago
		), cuentas_abiertas AS (
			SELECT count(*)::int AS pedidos, COALESCE(sum(total), 0) AS importe
			FROM cuentas WHERE estado = 'abierta' AND (abierta_at AT TIME ZONE $2)::date = $1::date
		), anuladas AS (
			SELECT count(*)::int AS cuentas, COALESCE(sum(total), 0) AS importe,
				COALESCE(jsonb_agg(jsonb_build_object(
					'id', id, 'mesa_numero', mesa_numero, 'importe', total, 'motivo', motivo_anulacion
				) ORDER BY cerrada_at, id), '[]'::jsonb) AS detalle
			FROM cuentas
			WHERE estado = 'anulada' AND (cerrada_at AT TIME ZONE $2)::date = $1::date
		)
		SELECT (SELECT to_jsonb(c) FROM cifras c) AS cifras,
			COALESCE((SELECT jsonb_agg(t ORDER BY t.tipo) FROM tipos t), '[]'::jsonb) AS tipos,
			COALESCE((SELECT jsonb_agg(c ORDER BY c.importe DESC, c.nombre) FROM categorias c), '[]'::jsonb) AS categorias,
			COALESCE((SELECT jsonb_agg(p ORDER BY p.importe DESC, p.nombre, p.producto_id) FROM productos p), '[]'::jsonb) AS productos,
			COALESCE((SELECT jsonb_agg(h ORDER BY h.hora) FROM horas h), '[]'::jsonb) AS horas,
			COALESCE((SELECT jsonb_agg(m ORDER BY m.metodo) FROM metodos m), '[]'::jsonb) AS metodos,
			(SELECT row_to_json(c) FROM cuentas_abiertas c) AS cuentas_abiertas,
			(SELECT row_to_json(a) FROM anuladas a) AS anuladas`,
		[fecha, config.zonaHoraria],
	);
	const cifras = datos.cifras;
	const porHora = new Map(datos.horas.map((fila) => [fila.hora, fila]));
	const porMetodo = METODOS.map((metodo) => datos.metodos.find((fila) => fila.metodo === metodo)
		?? { metodo, pedidos: 0, importe: 0 });
	return {
		fecha,
		zona_horaria: config.zonaHoraria,
		criterio: { valor: criterio, descripcion: descripcionCriterio(criterio) },
		totales: { pedidos: cifras.pedidos, importe: cifras.importe, ticket_medio: cifras.ticket_medio },
		cobro: {
			total_cobrado: cifras.cobrados_importe,
			por_metodo: porMetodo,
		},
		pendiente_cobro: {
			entregados_sin_cobrar: { pedidos: cifras.entregados_sin_cobrar_pedidos, importe: cifras.entregados_sin_cobrar_importe },
			cuentas_abiertas: datos.cuentas_abiertas,
		},
		anuladas: datos.anuladas,
		cobrados: { pedidos: cifras.cobrados_pedidos, importe: cifras.cobrados_importe },
		entregados_sin_cobrar: { pedidos: cifras.entregados_sin_cobrar_pedidos, importe: cifras.entregados_sin_cobrar_importe },
		listos_sin_recoger: { pedidos: cifras.listos_pedidos, importe: cifras.listos_importe },
		en_curso: { pedidos: cifras.en_curso_pedidos, importe: cifras.en_curso_importe },
		cancelados: { pedidos: cifras.cancelados_pedidos, importe: cifras.cancelados_importe },
		por_tipo: datos.tipos.map((fila) => ({ ...fila, nombre: NOMBRES_TIPO[fila.tipo] })),
		por_categoria: datos.categorias,
		por_producto: datos.productos,
		por_hora: Array.from({ length: 24 }, (_, hora) => porHora.get(hora) ?? { hora, pedidos: 0, importe: 0 }),
	};
}

export async function consultarCierre(fecha, consulta = {}) {
	const dia = validar(esquemaFechaCierre, fecha);
	const { criterio } = validar(esquemaConsultaCierre, consulta);
	return transaccion(async (conexion) => {
		await conexion.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
		const contexto = await contextoCierre(conexion);
		const guardado = await cierreGuardado(conexion, dia);
		if (guardado) return informe(guardado.resumen, contexto, guardado);
		return informe(await calcularResumen(conexion, dia, criterio ?? contexto.criterio), contexto);
	});
}

export async function configurarCierre(datos, usuario) {
	exigirAdministracion(usuario);
	const { cierre_criterio } = validar(esquemaConfiguracionCierre, datos);
	return transaccion(async (conexion) => {
		const { rows: [negocio] } = await conexion.query(
			`UPDATE negocio SET datos = (datos - 'cierre_incluye_listos') || jsonb_build_object('cierre_criterio', $1)
			 WHERE id = 1 RETURNING updated_at`,
			[cierre_criterio],
		);
		if (!negocio) throw new ErrorOperacion("No existe la ficha del negocio para guardar el criterio", 500);
		return { cierre_criterio, actualizado: negocio.updated_at };
	});
}

async function bloqueosDeHoy(conexion, fecha, criterio) {
	const filtros = ["estado IN ('nuevo','preparando')"];
	if (criterio !== "entregados_y_listos") filtros.push("estado = 'listo'");
	if (criterio === "cobrados") filtros.push("estado = 'entregado' AND pagado_at IS NULL");
	const { rows: pedidos } = await conexion.query(
		`SELECT estado, numero_dia, total FROM pedidos WHERE fecha = $1::date AND (${filtros.join(" OR ")}) ORDER BY numero_dia`,
		[fecha],
	);
	const { rows: cuentas } = criterio === "cobrados" ? await conexion.query(
		`SELECT mesa_numero, total FROM cuentas
		 WHERE estado = 'abierta' AND (abierta_at AT TIME ZONE $2)::date = $1::date
		 ORDER BY mesa_numero`,
		[fecha, config.zonaHoraria],
	) : { rows: [] };
	return { pedidos, cuentas };
}

export async function guardarCierre(fecha, { usuario, origen = "personal", forzar = false } = {}) {
	const dia = validar(esquemaFechaCierre, fecha);
	if (origen === "personal") exigirAdministracion(usuario);
	else if (origen !== "n8n") throw new ErrorOperacion("Origen de cierre no válido", 400);
	return transaccion(async (conexion) => {
		await bloquearCuentas(conexion);
		const contexto = await contextoCierre(conexion, true);
		const guardado = await cierreGuardado(conexion, dia);
		if (guardado) return { ...informe(guardado.resumen, contexto, guardado), creado: false };
		if (dia > contexto.hoy) throw new ErrorOperacion("No se puede guardar el cierre de una fecha futura", 409);
		const resumen = await calcularResumen(conexion, dia, contexto.criterio);
		if (dia === contexto.hoy && !forzar) {
			const bloqueos = await bloqueosDeHoy(conexion, dia, contexto.criterio);
			if (bloqueos.pedidos.length || bloqueos.cuentas.length) {
				const lista = [
					...bloqueos.cuentas.map((cuenta) => `Mesa ${cuenta.mesa_numero} con cuenta abierta (${Number(cuenta.total).toFixed(2).replace(".", ",")} €)`),
					...bloqueos.pedidos.map((pedido) => `Pedido #${pedido.numero_dia} pendiente (${Number(pedido.total).toFixed(2).replace(".", ",")} €)`),
				];
				throw new ErrorOperacion(`No se puede cerrar hoy: ${lista.join(" · ")}. Puedes forzar el cierre.`, 409);
			}
		}
		const { rows: [nuevo] } = await conexion.query(
			`INSERT INTO cierres_diarios (fecha, resumen, cerrado_por, origen) VALUES ($1::date, $2::jsonb, $3, $4)
			 ON CONFLICT (fecha) DO NOTHING RETURNING *`,
			[dia, resumen, origen === "personal" ? usuario.sub ?? usuario.id : null, origen],
		);
		const cierre = nuevo ?? await cierreGuardado(conexion, dia);
		return { ...informe(cierre.resumen, contexto, cierre), creado: Boolean(nuevo) };
	});
}

function celdaCsv(valor) {
	const texto = String(valor);
	const seguro = /^\s*[=+\-@]/.test(texto) ? `'${texto}` : texto;
	return `"${seguro.replaceAll('"', '""')}"`;
}

export function csvCierre(datos) {
	const { resumen, guardado, cerrado_at } = datos;
	const importe = (valor) => Number(valor).toFixed(2).replace(".", ",");
	const filas = [
		["Cierre diario", resumen.fecha],
		["Criterio", resumen.criterio.descripcion],
		["Informe", guardado ? "Cierre guardado" : "Vista previa sin guardar"],
		["Guardado el", cerrado_at ? new Date(cerrado_at).toISOString() : "Sin guardar"],
		[],
		["Indicador", "Pedidos", "Importe (€)"],
		["Ventas", resumen.totales.pedidos, importe(resumen.totales.importe)],
		["Cobrados", resumen.cobrados.pedidos, importe(resumen.cobrados.importe)],
		["Entregados sin cobrar", resumen.entregados_sin_cobrar.pedidos, importe(resumen.entregados_sin_cobrar.importe)],
		["Listos sin recoger", resumen.listos_sin_recoger.pedidos, importe(resumen.listos_sin_recoger.importe)],
		["En curso", resumen.en_curso.pedidos, importe(resumen.en_curso.importe)],
		["Cancelados", resumen.cancelados.pedidos, importe(resumen.cancelados.importe)],
		[],
		["Cobro por método", "Pedidos", "Importe (€)"],
		...resumen.cobro.por_metodo.map((fila) => [fila.metodo, fila.pedidos, importe(fila.importe)]),
		["Total cobrado", "", importe(resumen.cobro.total_cobrado)],
		[],
		["Pendiente de cobro", "Pedidos", "Importe (€)"],
		["Entregados sin cobrar", resumen.pendiente_cobro.entregados_sin_cobrar.pedidos, importe(resumen.pendiente_cobro.entregados_sin_cobrar.importe)],
		["Cuentas abiertas", resumen.pendiente_cobro.cuentas_abiertas.pedidos, importe(resumen.pendiente_cobro.cuentas_abiertas.importe)],
		[],
		["Ventas por tipo", "Pedidos", "Importe (€)"],
		...resumen.por_tipo.map((fila) => [fila.nombre, fila.pedidos, importe(fila.importe)]),
		[],
		["Ventas por categoría", "Pedidos", "Unidades", "Importe (€)"],
		...resumen.por_categoria.map((fila) => [fila.nombre, fila.pedidos, fila.unidades, importe(fila.importe)]),
		[],
		["Artículo", "Categoría", "Pedidos", "Unidades", "Importe (€)"],
		...resumen.por_producto.map((fila) => [fila.nombre, fila.categoria, fila.pedidos, fila.unidades, importe(fila.importe)]),
		[],
		["Hora", "Pedidos", "Importe (€)"],
		...resumen.por_hora.map((fila) => [`${String(fila.hora).padStart(2, "0")}:00`, fila.pedidos, importe(fila.importe)]),
	];
	return `\uFEFF${filas.map((fila) => fila.map(celdaCsv).join(";")).join("\r\n")}\r\n`;
}
