import { query, transaccion } from "./db.js";
import { config } from "./config.js";
import { ErrorOperacion } from "./errores.js";
import { esquemaAnularCuenta, esquemaCobro, esquemaIdCuenta, esquemaIdPedido, esquemaListadoCuentas, validar } from "./esquemas.js";

// Siempre antes de bloquear pedidos o productos: apertura, traslados y cobro comparten el mismo orden.
export function bloquearCuentas(conexion) {
	return conexion.query("SELECT pg_advisory_xact_lock(727003)");
}

export async function asegurarCuentaAbierta(conexion, mesa) {
	const { rows: [cuenta] } = await conexion.query(
		`INSERT INTO cuentas (mesa_numero) VALUES ($1)
		 ON CONFLICT (mesa_numero) WHERE estado = 'abierta'
		 DO UPDATE SET mesa_numero = EXCLUDED.mesa_numero RETURNING id`,
		[mesa],
	);
	return cuenta.id;
}

const CAMPOS_CUENTA = `
	c.id, c.mesa_numero, m.nombre AS mesa_nombre, c.estado, c.abierta_at, c.cerrada_at,
	c.total, c.metodo_pago,
	(SELECT count(*)::int FROM pedidos p WHERE p.cuenta_id = c.id) AS numero_pedidos,
	(SELECT count(*)::int FROM pedidos p WHERE p.cuenta_id = c.id AND p.estado NOT IN ('entregado','cancelado')) AS pedidos_sin_entregar,
	GREATEST(0, floor(extract(epoch FROM (now() - c.abierta_at)) / 60))::int AS minutos_abierta`;

const SELECT_CUENTA = `SELECT ${CAMPOS_CUENTA},
	COALESCE((SELECT json_agg(json_build_object(
		'numero_dia', p.numero_dia, 'estado', p.estado, 'total', p.total, 'pagado_at', p.pagado_at,
		'items', COALESCE((SELECT json_agg(json_build_object(
			'nombre', i.nombre, 'cantidad', i.cantidad, 'precio_unitario', i.precio_unitario
		) ORDER BY i.id) FROM pedido_items i WHERE i.pedido_id = p.id), '[]'::json)
	) ORDER BY p.created_at, p.id) FROM pedidos p WHERE p.cuenta_id = c.id), '[]'::json) AS pedidos
	FROM cuentas c JOIN mesas m ON m.numero = c.mesa_numero`;

export async function obtenerCuenta(id, { soloCobradaReciente = false } = {}) {
	const identificador = validar(esquemaIdCuenta, String(id));
	const { rows } = await query(
		`${SELECT_CUENTA} WHERE c.id = $1${soloCobradaReciente ? " AND c.estado = 'cobrada' AND c.cerrada_at BETWEEN now() - interval '24 hours' AND now()" : ""}`,
		[identificador],
	);
	return rows[0] ?? null;
}

export async function cuentaAbiertaDeMesa(numero) {
	const { rows } = await query(`${SELECT_CUENTA} WHERE c.mesa_numero = $1 AND c.estado = 'abierta'`, [numero]);
	return rows[0] ?? null;
}

export async function listarCuentas(estado = "abierta") {
	const datos = validar(esquemaListadoCuentas, { estado });
	const { rows } = await query(
		`SELECT ${CAMPOS_CUENTA},
			(c.abierta_at AT TIME ZONE $2)::date < (now() AT TIME ZONE $2)::date AS de_dias_anteriores
		 FROM cuentas c JOIN mesas m ON m.numero = c.mesa_numero
		 WHERE c.estado = $1 ORDER BY c.abierta_at, c.id`,
		[datos.estado, config.zonaHoraria],
	);
	return rows;
}

export async function pendientesDeCobro() {
	const [{ rows: pedidos }, cuentas] = await Promise.all([
		query(
			`SELECT id, codigo, numero_dia, nombre_cliente, tipo, estado, total, created_at, pagado_at, metodo_pago,
				(p.fecha < (now() AT TIME ZONE $1)::date) AS de_dias_anteriores
			 FROM pedidos p
			 WHERE tipo IN ('recoger','whatsapp') AND estado = 'entregado' AND pagado_at IS NULL
			 ORDER BY created_at, id`,
			[config.zonaHoraria],
		),
		listarCuentas(),
	]);
	const pedidosHoy = pedidos.filter((pedido) => !pedido.de_dias_anteriores);
	const pedidosAnteriores = pedidos.filter((pedido) => pedido.de_dias_anteriores);
	const cuentasHoy = cuentas.filter((cuenta) => !cuenta.de_dias_anteriores);
	const cuentasAnteriores = cuentas.filter((cuenta) => cuenta.de_dias_anteriores);
	return {
		pedidos: pedidosHoy,
		cuentas: cuentasHoy,
		anteriores: { pedidos: pedidosAnteriores, cuentas: cuentasAnteriores },
		total: pedidos.length + cuentas.length,
		total_hoy: pedidosHoy.length + cuentasHoy.length,
		total_anteriores: pedidosAnteriores.length + cuentasAnteriores.length,
	};
}

async function cuentaParaCerrar(conexion, id) {
	const { rows: [cuenta] } = await conexion.query("SELECT * FROM cuentas WHERE id = $1 FOR UPDATE", [id]);
	if (!cuenta) throw new ErrorOperacion("Cuenta no encontrada", 404);
	if (cuenta.estado !== "abierta") throw new ErrorOperacion("Esta cuenta ya está cerrada", 409);
	return cuenta;
}

export async function cobrarCuenta(id, datos, usuario) {
	const identificador = validar(esquemaIdCuenta, String(id));
	const { metodo_pago, forzar } = validar(esquemaCobro, datos);
	await transaccion(async (conexion) => {
		await bloquearCuentas(conexion);
		const cuenta = await cuentaParaCerrar(conexion, identificador);
		const { rows: pedidos } = await conexion.query(
			"SELECT id, estado FROM pedidos WHERE cuenta_id = $1 ORDER BY id FOR UPDATE",
			[identificador],
		);
		const sinEntregar = pedidos.filter((pedido) => !["entregado", "cancelado"].includes(pedido.estado)).length;
		if (sinEntregar && !forzar) throw new ErrorOperacion(`Hay ${sinEntregar} pedidos sin entregar`, 409);
		await conexion.query(
			`UPDATE pedidos SET estado = 'entregado', pagado_at = now(), metodo_pago = $2
			 WHERE cuenta_id = $1 AND estado <> 'cancelado' AND pagado_at IS NULL`,
			[identificador, metodo_pago],
		);
		await conexion.query(
			`UPDATE cuentas SET estado = 'cobrada', cerrada_at = now(), cerrada_por = $2, metodo_pago = $3,
				total = (SELECT COALESCE(sum(total), 0) FROM pedidos WHERE cuenta_id = $1 AND estado <> 'cancelado')
			 WHERE id = $1`,
			[identificador, usuario.sub ?? usuario.id, metodo_pago],
		);
		await conexion.query(
			"UPDATE llamadas_mesa SET atendida = true WHERE mesa_numero = $1 AND motivo = 'cuenta' AND NOT atendida",
			[cuenta.mesa_numero],
		);
	});
	return obtenerCuenta(identificador);
}

export async function anularCuenta(id, datos, usuario) {
	if (usuario.rol !== "admin") throw new ErrorOperacion("Solo un administrador puede anular una cuenta", 403);
	const identificador = validar(esquemaIdCuenta, String(id));
	const { motivo } = validar(esquemaAnularCuenta, datos);
	await transaccion(async (conexion) => {
		await bloquearCuentas(conexion);
		const cuenta = await cuentaParaCerrar(conexion, identificador);
		await conexion.query(
			`UPDATE cuentas SET estado = 'anulada', cerrada_at = now(), cerrada_por = $2, motivo_anulacion = $3
			 WHERE id = $1`,
			[identificador, usuario.sub ?? usuario.id, motivo],
		);
		await conexion.query(
			"UPDATE llamadas_mesa SET atendida = true WHERE mesa_numero = $1 AND motivo = 'cuenta' AND NOT atendida",
			[cuenta.mesa_numero],
		);
	});
	return obtenerCuenta(identificador);
}

export async function cobrarPedido(id, datos) {
	const identificador = validar(esquemaIdPedido, id);
	const { metodo_pago, forzar } = validar(esquemaCobro, datos);
	return transaccion(async (conexion) => {
		await bloquearCuentas(conexion);
		const { rows: [pedido] } = await conexion.query("SELECT * FROM pedidos WHERE id = $1 FOR UPDATE", [identificador]);
		if (!pedido) throw new ErrorOperacion("Pedido no encontrado", 404);
		if (pedido.tipo === "mesa") throw new ErrorOperacion("Los pedidos de mesa se cobran por su cuenta", 409);
		if (pedido.pagado_at) throw new ErrorOperacion("Este pedido ya está cobrado", 409);
		if (pedido.estado === "cancelado") throw new ErrorOperacion("Un pedido cancelado no se puede cobrar", 409);
		if (!["listo", "entregado"].includes(pedido.estado) && !forzar) {
			throw new ErrorOperacion("El pedido todavía no está listo. Confirma su entrega para cobrarlo.", 409);
		}
		await conexion.query(
			"UPDATE pedidos SET estado = 'entregado', pagado_at = now(), metodo_pago = $2 WHERE id = $1",
			[identificador, metodo_pago],
		);
		return identificador;
	});
}
