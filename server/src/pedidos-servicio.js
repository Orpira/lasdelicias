import { randomBytes } from "node:crypto";
import { query, transaccion } from "./db.js";
import { config } from "./config.js";
import { asegurarCuentaAbierta, bloquearCuentas } from "./cuentas.js";
import { ErrorOperacion as ErrorPedido } from "./errores.js";
import { descripcionHorario, dentroDeHorario, estaAbierto, fechaMadrid, siguienteApertura } from "./horario.js";

export { ErrorOperacion as ErrorPedido } from "./errores.js";

const SELECT_PEDIDO = `
	SELECT p.id, p.codigo, p.fecha::text AS fecha, p.numero_dia, p.nombre_cliente, p.telefono,
	       p.tipo, p.mesa_numero, m.nombre AS mesa_nombre, p.mesa_anterior, p.cambio_mesa, p.hora_recogida, p.notas, p.estado, p.total,
	       p.created_at, p.updated_at, p.cuenta_id, p.pagado_at, p.metodo_pago, p.fuera_horario, p.atender_desde,
	       COALESCE(json_agg(json_build_object(
	           'producto_id', i.producto_id, 'nombre', i.nombre, 'categoria', pr.categoria,
	           'precio_unitario', i.precio_unitario, 'cantidad', i.cantidad
	       ) ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS items
	FROM pedidos p
	LEFT JOIN mesas m ON m.numero = p.mesa_numero
	LEFT JOIN pedido_items i ON i.pedido_id = p.id
	LEFT JOIN productos pr ON pr.id = i.producto_id`;

export async function obtenerPedidoPorId(id) {
	const { rows } = await query(`${SELECT_PEDIDO} WHERE p.id = $1 GROUP BY p.id, m.nombre`, [id]);
	return rows[0] ?? null;
}

export async function obtenerPedidoPorCodigo(codigo) {
	const { rows } = await query(`${SELECT_PEDIDO} WHERE p.codigo = $1 GROUP BY p.id, m.nombre`, [codigo]);
	return rows[0] ?? null;
}

/** Pedidos recientes y los programados para aperturas futuras. */
export async function pedidosDelPanel() {
	const { rows } = await query(
		`${SELECT_PEDIDO}
		 WHERE (p.fecha >= (now() AT TIME ZONE $1)::date - 1 OR p.atender_desde > now())
		   AND (p.estado IN ('nuevo','preparando','listo') OR p.updated_at > now() - interval '2 hours')
		 GROUP BY p.id, m.nombre
		 ORDER BY p.created_at`,
		[config.zonaHoraria],
	);
	return rows;
}

/** Vista reducida para el cliente: sin teléfono ni ids internos. */
export function vistaPublica(pedido) {
	if (!pedido) return null;
	const { id: _id, telefono: _tel, ...resto } = pedido;
	return resto;
}

function codigoPublico() {
	// 10 caracteres sin ambigüedades (sin 0/O, 1/l/I)
	const alfabeto = "23456789abcdefghjkmnpqrstuvwxyz";
	const bytes = randomBytes(10);
	return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}

/**
 * Crea un pedido. Los precios SIEMPRE se toman de la base de datos,
 * nunca de lo que envíe el cliente.
 */
export async function crearPedido({ items, nombre, telefono, tipo, mesaToken, dispositivo, horaRecogida, notas }) {
	// Agrupa líneas repetidas del mismo producto
	const cantidades = new Map();
	for (const it of items) {
		cantidades.set(it.producto_id, (cantidades.get(it.producto_id) ?? 0) + it.cantidad);
	}
	for (const c of cantidades.values()) {
		if (c > 50) throw new ErrorPedido("Máximo 50 unidades por producto");
	}

	return transaccion(async (client) => {
		await bloquearCuentas(client);
		const { rows: [negocio] } = await client.query("SELECT datos, clock_timestamp() AS instante FROM negocio WHERE id = 1 FOR SHARE");
		if (!negocio) throw new ErrorPedido("No existe la ficha del negocio para consultar su horario", 500);
		const { horario, dias_cerrado = [] } = negocio.datos;
		const instante = negocio.instante;
		const abierto = estaAbierto(horario, dias_cerrado, instante);
		if (!abierto && tipo === "mesa") {
			throw new ErrorPedido("El local está cerrado ahora mismo. Puedes hacer tu pedido para recoger y lo prepararemos en cuanto abramos.", 409);
		}
		const apertura = abierto ? null : siguienteApertura(horario, dias_cerrado, instante);
		if (!abierto && !apertura) {
			throw new ErrorPedido("Ahora mismo no tenemos horario de apertura previsto. Llámanos para hacer tu pedido.", 409);
		}
		const fechaPedido = apertura?.fecha ?? fechaMadrid(instante);
		if (horaRecogida) {
			const recogida = new Date(horaRecogida);
			if (!Number.isFinite(recogida.getTime())) throw new ErrorPedido("La hora de recogida no es válida", 400);
			if (!dentroDeHorario(horario, dias_cerrado, recogida)
				|| recogida.getTime() < (apertura?.inicio.getTime() ?? instante.getTime() - 5 * 60_000)) {
				throw new ErrorPedido(`Elige una hora de recogida dentro del horario y no anterior al comienzo de la preparación. ${descripcionHorario(horario, dias_cerrado, recogida)}`, 400);
			}
		}
		const ids = [...cantidades.keys()];
		const { rows: productos } = await client.query(
			"SELECT id, nombre, precio, disponible, activo, stock FROM productos WHERE id = ANY($1::uuid[]) FOR UPDATE",
			[ids],
		);
		const porId = new Map(productos.map((p) => [p.id, p]));
		for (const id of ids) {
			const p = porId.get(id);
			if (!p || !p.activo) throw new ErrorPedido("Uno de los productos ya no está en la carta");
			if (!p.disponible) throw new ErrorPedido(`${p.nombre} está agotado ahora mismo`, 409);
			if (p.stock !== null && p.stock < cantidades.get(id)) {
				throw new ErrorPedido(`Solo quedan ${p.stock} de ${p.nombre}`, 409);
			}
		}

		// La mesa sale del token secreto del QR, nunca de un número enviado por el cliente
		let mesa = null;
		let mesaAnterior = null;
		let cuentaId = null;
		if (tipo === "mesa") {
			const { rows } = await client.query("SELECT numero FROM mesas WHERE token = $1 AND activa", [mesaToken]);
			if (rows.length === 0) {
				throw new ErrorPedido("El código de esta mesa ya no es válido. Vuelve a escanear el QR de tu mesa.", 409);
			}
			mesa = rows[0].numero;
			cuentaId = await asegurarCuentaAbierta(client, mesa);
			// ¿Este móvil tiene pedidos en curso hoy en OTRA mesa? → posible cambio de mesa
			if (dispositivo) {
				const { rows: previos } = await client.query(
					`SELECT p.mesa_numero FROM pedidos p
					 LEFT JOIN cuentas c ON c.id = p.cuenta_id
					 WHERE p.dispositivo = $1 AND p.tipo = 'mesa' AND p.mesa_numero <> $2
					   AND p.estado IN ('nuevo','preparando','listo') AND p.pagado_at IS NULL
					   AND (c.estado = 'abierta' OR p.cuenta_id IS NULL)
					   AND p.fecha = (now() AT TIME ZONE $3)::date
					 ORDER BY p.created_at DESC LIMIT 1`,
					[dispositivo, mesa, config.zonaHoraria],
				);
				mesaAnterior = previos[0]?.mesa_numero ?? null;
			}
		}

		const total = ids.reduce((acc, id) => acc + porId.get(id).precio * cantidades.get(id), 0);

		// Número correlativo del día, sin carreras entre pedidos simultáneos
		await client.query("SELECT pg_advisory_xact_lock(727002)");
		const { rows: [dia] } = await client.query(
			`SELECT $1::date::text AS fecha,
			        COALESCE((SELECT max(numero_dia) FROM pedidos
			                  WHERE fecha = $1::date), 0) + 1 AS numero`,
			[fechaPedido],
		);

		let clienteId = null;
		if (telefono) {
			const { rows: [cli] } = await client.query(
				`INSERT INTO clientes (telefono, nombre) VALUES ($1, $2)
				 ON CONFLICT (telefono) DO UPDATE SET nombre = EXCLUDED.nombre
				 RETURNING id`,
				[telefono, nombre],
			);
			clienteId = cli.id;
		}

		const { rows: [pedido] } = await client.query(
			`INSERT INTO pedidos (codigo, fecha, numero_dia, cliente_id, nombre_cliente, telefono,
			                      tipo, mesa_numero, hora_recogida, notas, total,
			                      dispositivo, mesa_anterior, cambio_mesa, cuenta_id, fuera_horario, atender_desde)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, round($11::numeric, 2), $12, $13, $14, $15, $16, $17)
			 RETURNING id`,
			[
				codigoPublico(), dia.fecha, dia.numero, clienteId, nombre, telefono ?? "",
				tipo, mesa, horaRecogida ?? null, notas ?? "", total,
				dispositivo ?? null, mesaAnterior, mesaAnterior ? "detectado" : null, cuentaId, !abierto, apertura?.inicio ?? null,
			],
		);

		for (const id of ids) {
			const p = porId.get(id);
			if (p.stock !== null) {
				// Productos con control de unidades: se descuentan y a 0 quedan agotados
				await client.query(
					"UPDATE productos SET stock = stock - $2, disponible = (stock - $2) > 0 WHERE id = $1",
					[id, cantidades.get(id)],
				);
			}
			await client.query(
				`INSERT INTO pedido_items (pedido_id, producto_id, nombre, precio_unitario, cantidad)
				 VALUES ($1, $2, $3, $4, $5)`,
				[pedido.id, id, p.nombre, p.precio, cantidades.get(id)],
			);
		}
		return pedido.id;
	}).then(obtenerPedidoPorId);
}

const TRANSICIONES = {
	nuevo: ["preparando", "listo", "cancelado"],
	preparando: ["listo", "cancelado"],
	listo: ["entregado", "preparando"],
	entregado: [],
	cancelado: [],
};

export async function cambiarEstado(id, estado) {
	return transaccion(async (client) => {
		await bloquearCuentas(client);
		const { rows } = await client.query("SELECT estado, pagado_at, atender_desde FROM pedidos WHERE id = $1 FOR UPDATE", [id]);
		if (rows.length === 0) throw new ErrorPedido("Pedido no encontrado", 404);
		if (rows[0].pagado_at) throw new ErrorPedido("Un pedido cobrado no se puede modificar", 409);
		if (estado !== "cancelado" && rows[0].atender_desde?.getTime() > Date.now()) {
			throw new ErrorPedido("Este pedido está programado para la apertura. Todavía no puede empezar a prepararse.", 409);
		}
		const actual = rows[0].estado;
		if (!TRANSICIONES[actual].includes(estado)) {
			throw new ErrorPedido(`No se puede pasar de "${actual}" a "${estado}"`, 409);
		}
		await client.query("UPDATE pedidos SET estado = $2 WHERE id = $1", [id, estado]);
		if (estado === "cancelado") {
			// Devuelve al stock las unidades de productos con control de unidades
			await client.query(
				`UPDATE productos pr SET stock = pr.stock + i.cantidad, disponible = true
				 FROM pedido_items i
				 WHERE i.pedido_id = $1 AND i.producto_id = pr.id AND pr.stock IS NOT NULL`,
				[id],
			);
		}
		return id;
	}).then(obtenerPedidoPorId);
}

/** Pedidos en curso de este móvil hoy que están en una mesa distinta de la indicada. */
export async function pedidosEnOtraMesa(dispositivo, mesa) {
	if (!dispositivo) return [];
	const { rows } = await query(
		`SELECT p.codigo, p.numero_dia, p.mesa_numero, m.nombre AS mesa_nombre
		 FROM pedidos p
		 LEFT JOIN mesas m ON m.numero = p.mesa_numero
		 LEFT JOIN cuentas c ON c.id = p.cuenta_id
		 WHERE p.dispositivo = $1 AND p.tipo = 'mesa' AND p.mesa_numero <> $2
		   AND p.estado IN ('nuevo','preparando','listo') AND p.pagado_at IS NULL
		   AND (c.estado = 'abierta' OR p.cuenta_id IS NULL)
		   AND p.fecha = (now() AT TIME ZONE $3)::date
		 ORDER BY p.created_at`,
		[dispositivo, mesa, config.zonaHoraria],
	);
	return rows;
}

/** El cliente declara que se ha cambiado de mesa: sus pedidos en curso pasan a la nueva. */
export async function cambiarDeMesa(dispositivo, mesaNueva) {
	return transaccion(async (conexion) => {
		await bloquearCuentas(conexion);
		const { rows: anteriores } = await conexion.query(
			`SELECT p.id FROM pedidos p LEFT JOIN cuentas c ON c.id = p.cuenta_id
			 WHERE p.dispositivo = $1 AND p.tipo = 'mesa' AND p.mesa_numero <> $2
			 AND p.estado IN ('nuevo','preparando','listo') AND p.pagado_at IS NULL
			 AND (c.estado = 'abierta' OR p.cuenta_id IS NULL)
			 AND p.fecha = (now() AT TIME ZONE $3)::date ORDER BY p.id FOR UPDATE OF p`,
			[dispositivo, mesaNueva, config.zonaHoraria],
		);
		if (!anteriores.length) return { pedidos: [], cuenta_id: null, pedidos_movidos: [] };
		const cuentaId = await asegurarCuentaAbierta(conexion, mesaNueva);
		const { rows } = await conexion.query(
			`UPDATE pedidos SET mesa_anterior = mesa_numero, mesa_numero = $2,
				cambio_mesa = 'declarado', cuenta_id = $3
			 WHERE id = ANY($1::uuid[]) RETURNING codigo, numero_dia, cuenta_id, created_at`,
			[anteriores.map((pedido) => pedido.id), mesaNueva, cuentaId],
		);
		return { pedidos: rows.map((pedido) => pedido.numero_dia), cuenta_id: cuentaId, pedidos_movidos: rows };
	});
}
