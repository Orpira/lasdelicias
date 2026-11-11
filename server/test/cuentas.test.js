import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";
import Fastify from "fastify";
import jwt from "@fastify/jwt";

const urlPruebas = process.env.DATABASE_URL_TEST;

describe("Cuentas y registro del cobro", {
	skip: !urlPruebas && "Define DATABASE_URL_TEST con una base PostgreSQL dedicada a pruebas",
}, () => {
	let conexionBase, esquema, pool, app, cuentas, pedidos, pararEventos, direccion;
	let administrador, barra, producto, tokens, legado;

	before(async () => {
		esquema = `pruebas_cuentas_${randomUUID().replaceAll("-", "")}`;
		conexionBase = new pg.Client({ connectionString: urlPruebas });
		await conexionBase.connect();
		await conexionBase.query(`CREATE SCHEMA "${esquema}"`);
		await conexionBase.query(`SET search_path TO "${esquema}", public`);
		const url = new URL(urlPruebas);
		url.searchParams.set("options", `${url.searchParams.get("options") ?? ""} -csearch_path=${esquema},public`.trim());
		process.env.DATABASE_URL = url.toString();
		process.env.JWT_SECRET = "clave-exclusiva-de-pruebas-no-usar-en-produccion";
		process.env.N8N_WEBHOOK_URL = "";
		process.env.TPV_PROVEEDOR = "ninguno";

		({ pool } = await import("../src/db.js"));
		cuentas = await import("../src/cuentas.js");
		pedidos = await import("../src/pedidos-servicio.js");
		const archivos = (await readdir(new URL("../migrations/", import.meta.url))).filter((archivo) => archivo.endsWith(".sql")).sort();
		for (const archivo of archivos) {
			if (archivo === "007_cuentas_y_cobro.sql") {
				await conexionBase.query(
					`INSERT INTO pedidos (codigo, fecha, numero_dia, nombre_cliente, tipo, mesa_numero, estado, total)
					 VALUES ('legado0001', current_date, 1, 'Prueba', 'mesa', 1, 'nuevo', 4),
					        ('legado0002', current_date, 2, 'Prueba', 'mesa', 1, 'entregado', 6)`,
				);
			}
			await conexionBase.query("BEGIN");
			try {
				await conexionBase.query(await readFile(new URL(`../migrations/${archivo}`, import.meta.url), "utf8"));
				await conexionBase.query("COMMIT");
			} catch (error) {
				await conexionBase.query("ROLLBACK");
				throw error;
			}
		}
		const horario = Object.fromEntries(["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"].map((dia) => [dia, "00:00–24:00"]));
		await pool.query("UPDATE negocio SET datos = datos || jsonb_build_object('horario', $1::jsonb, 'dias_cerrado', '[]'::jsonb) WHERE id = 1", [horario]);
		({ rows: legado } = await pool.query("SELECT codigo, cuenta_id FROM pedidos ORDER BY numero_dia"));
		({ rows: [administrador] } = await pool.query(
			"INSERT INTO staff (email, nombre, password_hash, rol) VALUES ('admin@pruebas.invalid', 'Administración de prueba', 'no-se-usa', 'admin') RETURNING id, rol",
		));
		({ rows: [barra] } = await pool.query(
			"INSERT INTO staff (email, nombre, password_hash, rol) VALUES ('barra@pruebas.invalid', 'Barra de prueba', 'no-se-usa', 'barra') RETURNING id, rol",
		));
		({ rows: [producto] } = await pool.query(
			"INSERT INTO productos (nombre, precio, categoria, stock) VALUES ('Producto de prueba', 3.25, 'Bebidas', 100) RETURNING id",
		));
		await pool.query("INSERT INTO mesas (numero, nombre) VALUES (101, 'Terraza de prueba'), (102, 'Interior de prueba')");
		const { rows: mesas } = await pool.query("SELECT numero, token FROM mesas WHERE numero IN (101, 102)");
		tokens = new Map(mesas.map((mesa) => [mesa.numero, mesa.token]));

		app = Fastify();
		await app.register(jwt, { secret: process.env.JWT_SECRET });
		app.decorate("autenticar", async (request) => request.jwtVerify());
		app.decorate("soloAdmin", async (request, reply) => {
			if (request.user.rol !== "admin") return reply.code(403).send({ error: "Solo un administrador puede hacer esto" });
		});
		app.setErrorHandler((error, request, reply) =>
			reply.code(error.statusCode ?? 500).send({ error: error.message }));
		await app.register((await import("../src/rutas/publicas.js")).default);
		await app.register((await import("../src/rutas/staff.js")).default);
		direccion = await app.listen({ host: "127.0.0.1", port: 0 });
		await new Promise((resolve, reject) => {
			import("../src/eventos.js").then(({ iniciarEscucha }) => {
				pararEventos = iniciarEscucha({ info: resolve, error: reject, warn: console.warn });
			}).catch(reject);
		});
	});

	after(async () => {
		await pararEventos?.();
		await app?.close();
		await pool?.end();
		if (conexionBase) {
			try {
				if (esquema) await conexionBase.query(`DROP SCHEMA IF EXISTS "${esquema}" CASCADE`);
			} finally {
				await conexionBase.end();
			}
		}
	});

	beforeEach(async () => {
		await pool.query("TRUNCATE pedidos, cuentas, llamadas_mesa CASCADE");
		await pool.query("UPDATE productos SET stock = 100, disponible = true WHERE id = $1", [producto.id]);
	});

	async function pedir(tipo = "mesa", { mesa = 101, ...cambios } = {}) {
		return pedidos.crearPedido({
			items: [{ producto_id: producto.id, cantidad: 1 }],
			nombre: "Cliente de prueba", telefono: tipo === "mesa" ? undefined : "600000000",
			tipo, mesaToken: tokens.get(mesa), dispositivo: randomUUID(), ...cambios,
		});
	}

	const sesion = (usuario) => ({
		authorization: `Bearer ${app.jwt.sign({ sub: usuario.id, rol: usuario.rol, nombre: "Personal de prueba" })}`,
	});
	const errorConEstado = (estado) => (error) => error.statusCode === estado;

	it("La migración final asigna cuenta a todos los pedidos de mesa, incluidos los históricos", () => {
		assert.ok(legado.find((pedido) => pedido.codigo === "legado0001").cuenta_id);
		assert.ok(legado.find((pedido) => pedido.codigo === "legado0002").cuenta_id);
	});

	it("Dos pedidos simultáneos de una mesa comparten una única cuenta", async () => {
		const [primero, segundo] = await Promise.all([pedir(), pedir()]);
		assert.equal(primero.cuenta_id, segundo.cuenta_id);
		const abiertas = await cuentas.listarCuentas();
		assert.equal(abiertas.length, 1);
		assert.equal(abiertas[0].numero_pedidos, 2);
		assert.equal(abiertas[0].total, 6.5);
	});

	it("Después de cobrar, el siguiente pedido abre una cuenta nueva", async () => {
		const primero = await pedir();
		await pedidos.cambiarEstado(primero.id, "listo");
		await pedidos.cambiarEstado(primero.id, "entregado");
		await cuentas.cobrarCuenta(primero.cuenta_id, { metodo_pago: "efectivo" }, barra);
		const segundo = await pedir();
		assert.notEqual(segundo.cuenta_id, primero.cuenta_id);
		const cerrado = await pedidos.obtenerPedidoPorId(primero.id);
		assert.ok(cerrado.pagado_at);
		assert.equal(cerrado.metodo_pago, "efectivo");
	});

	it("El cambio de mesa traslada los pedidos y anula la cuenta que queda vacía", async () => {
		const dispositivo = randomUUID();
		const primero = await pedir("mesa", { dispositivo });
		const segundo = await pedir("mesa", { dispositivo });
		const destino = await pedir("mesa", { mesa: 102 });
		const resultado = await pedidos.cambiarDeMesa(dispositivo, 102);
		assert.equal(resultado.cuenta_id, destino.cuenta_id);
		assert.equal(resultado.pedidos.length, 2);
		assert.ok(resultado.pedidos_movidos.every((pedido) => Number.isFinite(Date.parse(pedido.created_at))));
		for (const original of [primero, segundo]) {
			const movido = await pedidos.obtenerPedidoPorId(original.id);
			assert.equal(movido.mesa_numero, 102);
			assert.equal(movido.cuenta_id, destino.cuenta_id);
		}
		const { rows: [anterior] } = await pool.query("SELECT * FROM cuentas WHERE id = $1", [primero.cuenta_id]);
		assert.equal(anterior.estado, "anulada");
		assert.equal(anterior.motivo_anulacion, "sin pedidos");
		assert.equal((await cuentas.obtenerCuenta(destino.cuenta_id)).total, 9.75);
	});

	it("Cobrar con pedidos sin entregar da 409 y forzar los entrega y cobra", async () => {
		const pedido = await pedir();
		await pool.query("INSERT INTO llamadas_mesa (mesa_numero, motivo) VALUES (101, 'cuenta'), (101, 'atencion')");
		await assert.rejects(cuentas.cobrarCuenta(pedido.cuenta_id, { metodo_pago: "tarjeta" }, barra), (error) => {
			assert.equal(error.message, "Hay 1 pedidos sin entregar");
			return error.statusCode === 409;
		});
		assert.equal((await pedidos.obtenerPedidoPorId(pedido.id)).pagado_at, null);
		await cuentas.cobrarCuenta(pedido.cuenta_id, { metodo_pago: "tarjeta", forzar: true }, barra);
		const pagado = await pedidos.obtenerPedidoPorId(pedido.id);
		assert.equal(pagado.estado, "entregado");
		assert.ok(pagado.pagado_at);
		assert.equal(pagado.metodo_pago, "tarjeta");
		const { rows: llamadas } = await pool.query("SELECT motivo, atendida FROM llamadas_mesa");
		assert.equal(llamadas.find((llamada) => llamada.motivo === "cuenta").atendida, true);
		assert.equal(llamadas.find((llamada) => llamada.motivo === "atencion").atendida, false);
	});

	it("Cancelar recalcula el total sin cobrar el pedido cancelado", async () => {
		const primero = await pedir();
		const segundo = await pedir();
		await pedidos.cambiarEstado(primero.id, "cancelado");
		assert.equal((await cuentas.obtenerCuenta(primero.cuenta_id)).total, 3.25);
		await cuentas.cobrarCuenta(segundo.cuenta_id, { metodo_pago: "bizum", forzar: true }, barra);
		assert.equal((await pedidos.obtenerPedidoPorId(primero.id)).pagado_at, null);
		assert.equal((await pedidos.obtenerPedidoPorId(segundo.id)).metodo_pago, "bizum");
		const { rows: [existencias] } = await pool.query("SELECT stock FROM productos WHERE id = $1", [producto.id]);
		assert.equal(existencias.stock, 99);
	});

	it("Anular exige motivo y rol admin tanto en la lógica como en las rutas", async () => {
		const pedido = await pedir();
		await assert.rejects(cuentas.anularCuenta(pedido.cuenta_id, { motivo: "invitación" }, barra), errorConEstado(403));
		await assert.rejects(cuentas.anularCuenta(pedido.cuenta_id, { motivo: " " }, administrador), errorConEstado(400));
		const ruta = `/admin/cuentas/${pedido.cuenta_id}/anular`;
		assert.equal((await app.inject({ method: "POST", url: ruta, payload: { motivo: "error" } })).statusCode, 401);
		assert.equal((await app.inject({ method: "POST", url: ruta, headers: sesion(barra), payload: { motivo: "error" } })).statusCode, 403);
		assert.equal((await app.inject({ method: "POST", url: ruta, headers: sesion(administrador), payload: { motivo: "" } })).statusCode, 400);
		const respuesta = await app.inject({ method: "POST", url: ruta, headers: sesion(administrador), payload: { motivo: "invitación" } });
		assert.equal(respuesta.statusCode, 200);
		assert.equal(respuesta.json().estado, "anulada");
		assert.equal((await pedidos.obtenerPedidoPorId(pedido.id)).pagado_at, null);
	});

	it("Los pedidos de mesa no se cobran sueltos, ni siquiera forzando", async () => {
		const pedido = await pedir();
		await assert.rejects(cuentas.cobrarPedido(pedido.id, { metodo_pago: "otro", forzar: true }), errorConEstado(409));
		assert.equal((await pedidos.obtenerPedidoPorId(pedido.id)).pagado_at, null);
	});

	it("Los datos de cobro inválidos se rechazan sin asumir método ni forzar la entrega", async () => {
		const pedido = await pedir();
		for (const datos of [undefined, {}, { metodo_pago: "pago-online" }, { metodo_pago: "efectivo", forzar: "true" }]) {
			await assert.rejects(cuentas.cobrarCuenta(pedido.cuenta_id, datos, barra), errorConEstado(400));
		}
		const conservado = await pedidos.obtenerPedidoPorId(pedido.id);
		assert.equal(conservado.estado, "nuevo");
		assert.equal(conservado.pagado_at, null);
		assert.equal((await cuentas.obtenerCuenta(pedido.cuenta_id)).estado, "abierta");
	});

	it("Los pedidos de una visita anulada no se detectan ni se trasladan a una cuenta nueva", async () => {
		const dispositivo = randomUUID();
		const anterior = await pedir("mesa", { dispositivo });
		await cuentas.anularCuenta(anterior.cuenta_id, { motivo: "invitación" }, administrador);
		assert.deepEqual(await pedidos.pedidosEnOtraMesa(dispositivo, 102), []);
		const cambio = await pedidos.cambiarDeMesa(dispositivo, 102);
		assert.deepEqual(cambio.pedidos_movidos, []);
		const siguiente = await pedir("mesa", { mesa: 102, dispositivo });
		assert.equal(siguiente.mesa_anterior, null);
		assert.notEqual(siguiente.cuenta_id, anterior.cuenta_id);
		const conservado = await pedidos.obtenerPedidoPorId(anterior.id);
		assert.equal(conservado.cuenta_id, anterior.cuenta_id);
		assert.equal(conservado.mesa_numero, 101);
		assert.equal(conservado.pagado_at, null);
	});

	it("Para llevar y WhatsApp se entregan y cobran de una vez sin repetir el cobro", async () => {
		for (const tipo of ["recoger", "whatsapp"]) {
			const pedido = await pedir(tipo);
			await assert.rejects(cuentas.cobrarPedido(pedido.id, { metodo_pago: "tarjeta" }), errorConEstado(409));
			await pedidos.cambiarEstado(pedido.id, "listo");
			await cuentas.cobrarPedido(pedido.id, { metodo_pago: "tarjeta" });
			const cobrado = await pedidos.obtenerPedidoPorId(pedido.id);
			assert.equal(cobrado.estado, "entregado");
			assert.ok(cobrado.pagado_at);
			assert.equal(cobrado.metodo_pago, "tarjeta");
			assert.equal(cobrado.cuenta_id, null);
			await assert.rejects(cuentas.cobrarPedido(pedido.id, { metodo_pago: "efectivo" }), errorConEstado(409));
		}
	});

	it("Dos intentos simultáneos no cobran dos veces una cuenta", async () => {
		const pedido = await pedir();
		const resultados = await Promise.allSettled([
			cuentas.cobrarCuenta(pedido.cuenta_id, { metodo_pago: "efectivo", forzar: true }, barra),
			cuentas.cobrarCuenta(pedido.cuenta_id, { metodo_pago: "tarjeta", forzar: true }, barra),
		]);
		assert.equal(resultados.filter((resultado) => resultado.status === "fulfilled").length, 1);
		assert.equal(resultados.find((resultado) => resultado.status === "rejected").reason.statusCode, 409);
	});

	it("Los resúmenes públicos no muestran datos personales y caducan a las 24 horas", async () => {
		const pedido = await pedir();
		const ruta = `/cuentas/${pedido.cuenta_id}/resumen`;
		const autorizada = () => app.inject({ url: ruta, headers: { "x-pedido-codigo": pedido.codigo } });
		assert.equal((await autorizada()).statusCode, 404);
		const abierta = (await app.inject(`/mesas/qr/${tokens.get(101)}/cuenta`)).json();
		for (const campo of ["nombre_cliente", "telefono", "dispositivo", "codigo", "cerrada_por"]) {
			assert.equal(JSON.stringify(abierta).includes(`"${campo}"`), false);
		}
		await cuentas.cobrarCuenta(pedido.cuenta_id, { metodo_pago: "otro", forzar: true }, administrador);
		assert.equal((await app.inject(ruta)).statusCode, 404, "sin código no debe revelarse la cuenta");
		assert.equal((await app.inject({ url: ruta, headers: { "x-pedido-codigo": "codigo-incorrecto" } })).statusCode, 404);
		const respuesta = await autorizada();
		assert.equal(respuesta.statusCode, 200);
		assert.equal(respuesta.headers["cache-control"], "no-store");
		assert.equal(respuesta.json().total, 3.25);
		await pool.query("UPDATE cuentas SET cerrada_at = now() - interval '25 hours' WHERE id = $1", [pedido.cuenta_id]);
		assert.equal((await autorizada()).statusCode, 404);
		await pool.query("UPDATE cuentas SET cerrada_at = now() + interval '1 hour' WHERE id = $1", [pedido.cuenta_id]);
		assert.equal((await autorizada()).statusCode, 404);
	});

	it("Los pendientes incluyen entregados sin pagar y cuentas de días anteriores", async () => {
		const mesa = await pedir();
		const llevar = await pedir("recoger");
		await pedidos.cambiarEstado(llevar.id, "listo");
		await pedidos.cambiarEstado(llevar.id, "entregado");
		await pool.query("UPDATE cuentas SET abierta_at = now() - interval '2 days' WHERE id = $1", [mesa.cuenta_id]);
		const pendientes = await cuentas.pendientesDeCobro();
		assert.equal(pendientes.total, 2);
		assert.equal(pendientes.pedidos[0].id, llevar.id);
		assert.equal(pendientes.total_hoy, 1);
		assert.equal(pendientes.total_anteriores, 1);
		assert.equal(pendientes.anteriores.cuentas[0].id, mesa.cuenta_id);
		await cuentas.cobrarPedido(llevar.id, { metodo_pago: "efectivo" });
		assert.equal((await cuentas.pendientesDeCobro()).total, 1);
	});

	it("El stream de la mesa recibe el cierre y rechaza los QR inválidos", async () => {
		const pedido = await pedir();
		const control = new AbortController();
		const respuesta = await fetch(`${direccion}/mesas/qr/${tokens.get(101)}/stream`, { signal: control.signal });
		assert.equal(respuesta.status, 200);
		const lector = respuesta.body.getReader();
		const decodificar = new TextDecoder();
		let recibido = "";
		const vencimiento = setTimeout(() => control.abort(), 5000);
		try {
			await cuentas.cobrarCuenta(pedido.cuenta_id, { metodo_pago: "efectivo", forzar: true }, barra);
			while (!recibido.includes('"tipo":"cuenta.cobrada"')) {
				const parte = await lector.read();
				assert.equal(parte.done, false);
				recibido += decodificar.decode(parte.value, { stream: true });
			}
			assert.ok(recibido.includes(`"id":"${pedido.cuenta_id}"`));
			assert.equal((await app.inject("/mesas/qr/incorrecto/stream")).statusCode, 404);
		} finally {
			clearTimeout(vencimiento);
			control.abort();
			await lector.cancel().catch((error) => {
				if (error.name !== "AbortError") throw error;
			});
		}
	});

	it("Al reconectar, el stream recupera primero la cuenta propia aunque haya otra visita posterior", async () => {
		const desde = new Date(Date.now() - 1000).toISOString();
		const propio = await pedir();
		await cuentas.cobrarCuenta(propio.cuenta_id, { metodo_pago: "efectivo", forzar: true }, barra);
		const posterior = await pedir();
		await cuentas.cobrarCuenta(posterior.cuenta_id, { metodo_pago: "tarjeta", forzar: true }, barra);
		const control = new AbortController();
		const parametros = new URLSearchParams({ desde, cuenta: propio.cuenta_id });
		const respuesta = await fetch(`${direccion}/mesas/qr/${tokens.get(101)}/stream?${parametros}`, { signal: control.signal });
		const lector = respuesta.body.getReader();
		const decodificar = new TextDecoder();
		const vencimiento = setTimeout(() => control.abort(), 5000);
		let recibido = "";
		try {
			while (!/data: [^\n]+\n\n/.test(recibido)) {
				const parte = await lector.read();
				assert.equal(parte.done, false);
				recibido += decodificar.decode(parte.value, { stream: true });
			}
			const primerEvento = JSON.parse(recibido.match(/data: ([^\n]+)/)[1]);
			assert.equal(primerEvento.tipo, "cuenta.cobrada");
			assert.equal(primerEvento.id, propio.cuenta_id);
			for (const campo of ["nombre_cliente", "telefono", "dispositivo", "codigo", "cerrada_por", "motivo_anulacion"]) {
				assert.equal(JSON.stringify(primerEvento).includes(`"${campo}"`), false);
			}
		} finally {
			clearTimeout(vencimiento);
			control.abort();
			await lector.cancel().catch((error) => { if (error.name !== "AbortError") throw error; });
		}
	});
});
