import { transaccion } from "./db.js";

export async function anonimizarPedidosAntiguos() {
	return transaccion(async (client) => {
		const { rows: [negocio] } = await client.query(
			"SELECT datos->'conservacion_meses' AS meses FROM negocio WHERE id = 1",
		);
		if (!negocio) throw new Error("No se encontró la ficha del negocio para aplicar la conservación");
		const meses = negocio.meses ?? 12;
		if (!Number.isInteger(meses) || meses < 1 || meses > 60) {
			throw new Error("El plazo de conservación debe ser un entero entre 1 y 60 meses");
		}

		// El bloqueo y la segunda comprobación evitan borrar al cliente de un pedido concurrente.
		const { rows: candidatos } = await client.query(
			`SELECT c.id FROM clientes c
			 WHERE NOT EXISTS (
				SELECT 1 FROM pedidos p WHERE p.cliente_id = c.id
				AND p.created_at >= now() - make_interval(months => $1::int)
			 )
			 ORDER BY c.id FOR UPDATE OF c`,
			[meses],
		);
		const { rowCount: pedidosAnonimizados } = await client.query(
			`UPDATE pedidos
			 SET nombre_cliente = 'Cliente', telefono = '', notas = '', dispositivo = NULL, cliente_id = NULL
			 WHERE created_at < now() - make_interval(months => $1::int)
			 AND (nombre_cliente <> 'Cliente' OR telefono <> '' OR notas <> ''
			      OR dispositivo IS NOT NULL OR cliente_id IS NOT NULL)`,
			[meses],
		);
		const { rowCount: clientesEliminados } = await client.query(
			`DELETE FROM clientes c
			 WHERE c.id = ANY($2::uuid[]) AND NOT EXISTS (
				SELECT 1 FROM pedidos p WHERE p.cliente_id = c.id
				AND p.created_at >= now() - make_interval(months => $1::int)
			 )`,
			[meses, candidatos.map((c) => c.id)],
		);
		return { pedidosAnonimizados, clientesEliminados, conservacionMeses: meses };
	});
}

export function iniciarAnonimizacion(log) {
	let ejecucion = null;
	let intervalo;
	let detenido = false;

	function ejecutar() {
		if (detenido) return;
		if (ejecucion) {
			log.warn("La anonimización anterior sigue en curso; se omite esta ejecución");
			return;
		}
		ejecucion = anonimizarPedidosAntiguos()
			.then((resultado) => log.info(resultado, "Anonimización de pedidos antiguos completada"))
			.catch((err) => log.error({ err }, "No se pudieron anonimizar los pedidos antiguos"))
			.finally(() => { ejecucion = null; });
	}

	const primero = setTimeout(() => {
		ejecutar();
		intervalo = setInterval(ejecutar, 24 * 60 * 60_000);
	}, 60_000);

	return async () => {
		detenido = true;
		clearTimeout(primero);
		clearInterval(intervalo);
		await ejecucion;
	};
}
