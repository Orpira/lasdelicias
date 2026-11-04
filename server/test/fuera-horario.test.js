import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { fechaMadrid, siguienteApertura } from "../src/horario.js";

const urlPruebas = process.env.DATABASE_URL_TEST;
const dias = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
const horario = Object.fromEntries(dias.map((dia) => [dia, "07:00–19:00"]));

describe("Pedidos fuera de horario", {
	skip: !urlPruebas && "Define DATABASE_URL_TEST con una base PostgreSQL dedicada a pruebas",
}, () => {
	let conexionBase, esquema, pool, app, servicio, producto, mesa, hoy, administrador, diasIniciales;

	before(async () => {
		esquema = `pruebas_horario_${randomUUID().replaceAll("-", "")}`;
		conexionBase = new pg.Client({ connectionString: urlPruebas });
		await conexionBase.connect();
		await conexionBase.query(`CREATE SCHEMA "${esquema}"`);
		await conexionBase.query(`SET search_path TO "${esquema}", public`);
		const url = new URL(urlPruebas);
		url.searchParams.set("options", `${url.searchParams.get("options") ?? ""} -csearch_path=${esquema},public`.trim());
		process.env.DATABASE_URL = url.toString();
		process.env.JWT_SECRET = "clave-exclusiva-de-pruebas-no-usar-en-produccion";
		process.env.N8N_API_KEY = randomUUID();
		process.env.N8N_WEBHOOK_URL = "";
		process.env.TPV_PROVEEDOR = "ninguno";
		({ pool } = await import("../src/db.js"));
		servicio = await import("../src/pedidos-servicio.js");
		for (const archivo of (await readdir(new URL("../migrations/", import.meta.url))).filter((nombre) => nombre.endsWith(".sql")).sort()) {
			await conexionBase.query(await readFile(new URL(`../migrations/${archivo}`, import.meta.url), "utf8"));
		}
		diasIniciales = (await pool.query("SELECT datos->'dias_cerrado' AS dias FROM negocio WHERE id = 1")).rows[0].dias;
		({ rows: [producto] } = await pool.query("INSERT INTO productos (nombre, precio, categoria, stock) VALUES ('Café programado de prueba', 3.25, 'Bebidas', 100) RETURNING id"));
		({ rows: [mesa] } = await pool.query("SELECT numero, token FROM mesas WHERE numero = 1"));
		({ rows: [administrador] } = await pool.query("INSERT INTO staff (email, nombre, password_hash, rol) VALUES ('horario@pruebas.invalid', 'Administración de prueba', 'no-se-usa', 'admin') RETURNING id, rol"));
		hoy = fechaMadrid(new Date());
		app = Fastify();
		await app.register(jwt, { secret: process.env.JWT_SECRET });
		app.decorate("autenticar", async (request) => request.jwtVerify());
		app.decorate("soloAdmin", async (request, reply) => {
			if (request.user.rol !== "admin") return reply.code(403).send({ error: "Solo administración puede hacer esto" });
		});
		app.setErrorHandler((error, request, reply) => reply.code(error.statusCode ?? 500).send({ error: error.message }));
		await app.register((await import("../src/rutas/publicas.js")).default);
		await app.register((await import("../src/rutas/staff.js")).default);
		await app.register((await import("../src/rutas/n8n.js")).default);
		await app.ready();
	});

	after(async () => {
		await app?.close();
		await pool?.end();
		if (conexionBase) {
			try {
				if (esquema) await conexionBase.query(`DROP SCHEMA IF EXISTS "${esquema}" CASCADE`);
			} finally { await conexionBase.end(); }
		}
	});

	beforeEach(async () => {
		await pool.query("TRUNCATE pedidos, cuentas CASCADE");
		await pool.query("UPDATE productos SET stock = 100, disponible = true WHERE id = $1", [producto.id]);
		await pool.query("UPDATE negocio SET datos = datos || jsonb_build_object('horario', $1::jsonb, 'dias_cerrado', $2::jsonb) WHERE id = 1", [horario, JSON.stringify([hoy])]);
	});

	const apertura = () => siguienteApertura(horario, [hoy], new Date());
	const sesion = () => ({ authorization: `Bearer ${app.jwt.sign({ sub: administrador.id, rol: administrador.rol })}` });
	const datos = () => ({ items: [{ producto_id: producto.id, cantidad: 1 }], nombre: "Cliente de prueba", telefono: "600000000" });
	const pedir = (tipo = "recoger", cambios = {}) => servicio.crearPedido({ ...datos(), tipo, mesaToken: mesa.token, ...cambios });

	it("La migración añade días de cierre vacíos y los pedidos antiguos quedan inmediatos", async () => {
		assert.deepEqual(diasIniciales, []);
		const { rows: [pedido] } = await pool.query(
			"INSERT INTO pedidos (codigo, fecha, numero_dia, nombre_cliente, tipo, total) VALUES ('antiguo001', $1, 1, 'Prueba', 'recoger', 0) RETURNING fuera_horario, atender_desde",
			[hoy],
		);
		assert.deepEqual(pedido, { fuera_horario: false, atender_desde: null });
	});

	it("La migración conserva una lista de festivos que ya existía", async () => {
		const conexion = await pool.connect();
		try {
			await conexion.query("BEGIN");
			await conexion.query("ALTER TABLE pedidos DROP COLUMN fuera_horario, DROP COLUMN atender_desde");
			await conexion.query("UPDATE negocio SET datos = datos || jsonb_build_object('dias_cerrado', $1::jsonb) WHERE id = 1", [JSON.stringify(["2026-12-25"])]);
			await conexion.query(await readFile(new URL("../migrations/009_fuera_de_horario.sql", import.meta.url), "utf8"));
			assert.deepEqual((await conexion.query("SELECT datos->'dias_cerrado' AS dias FROM negocio WHERE id = 1")).rows[0].dias, ["2026-12-25"]);
		} finally {
			await conexion.query("ROLLBACK");
			conexion.release();
		}
	});

	it("Recoger y WhatsApp se aceptan cerrados con fecha y correlativo de la apertura", async () => {
		const siguiente = apertura();
		await pool.query("INSERT INTO pedidos (codigo, fecha, numero_dia, nombre_cliente, tipo, total) VALUES ('previo0001', $1, 41, 'Prueba', 'recoger', 0)", [siguiente.fecha]);
		const [web, whatsapp] = await Promise.all([
			app.inject({ method: "POST", url: "/pedidos", payload: { ...datos(), tipo: "recoger" } }),
			app.inject({ method: "POST", url: "/n8n/pedidos", headers: { "x-api-key": process.env.N8N_API_KEY }, payload: datos() }),
		]);
		assert.equal(web.statusCode, 201);
		assert.equal(whatsapp.statusCode, 201);
		const pedidos = [web.json(), whatsapp.json()];
		assert.deepEqual(pedidos.map((pedido) => pedido.numero_dia).sort((a, b) => a - b), [42, 43]);
		for (const pedido of pedidos) {
			assert.equal(pedido.fecha, siguiente.fecha);
			assert.equal(pedido.fuera_horario, true);
			assert.equal(pedido.atender_desde, siguiente.inicio.toISOString());
			assert.equal(pedido.estado, "nuevo");
			assert.equal(fechaMadrid(new Date(pedido.created_at)), hoy);
			const publico = (await app.inject(`/pedidos/${pedido.codigo}`)).json();
			assert.equal(publico.atender_desde, pedido.atender_desde);
			assert.equal(publico.fuera_horario, true);
			assert.equal("telefono" in publico, false);
			assert.equal("id" in publico, false);
		}
		const panel = await servicio.pedidosDelPanel();
		for (const pedido of pedidos) assert.ok(panel.some((fila) => fila.codigo === pedido.codigo && fila.fecha > hoy));
	});

	it("La numeración de ocho pedidos simultáneos de apertura no tiene carreras", async () => {
		const pedidos = await Promise.all(Array.from({ length: 8 }, () => pedir()));
		assert.deepEqual(pedidos.map((pedido) => pedido.numero_dia).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);
		assert.ok(pedidos.every((pedido) => pedido.fecha === apertura().fecha));
	});

	it("Una mesa cerrada se rechaza sin abrir cuenta, reservar stock ni guardar un pedido", async () => {
		const respuesta = await app.inject({ method: "POST", url: "/pedidos", payload: { ...datos(), tipo: "mesa", mesa_token: mesa.token } });
		assert.equal(respuesta.statusCode, 409);
		assert.equal(respuesta.json().error, "El local está cerrado ahora mismo. Puedes hacer tu pedido para recoger y lo prepararemos en cuanto abramos.");
		assert.equal((await pool.query("SELECT count(*)::int AS n FROM pedidos")).rows[0].n, 0);
		assert.equal((await pool.query("SELECT count(*)::int AS n FROM cuentas")).rows[0].n, 0);
		assert.equal((await pool.query("SELECT stock FROM productos WHERE id = $1", [producto.id])).rows[0].stock, 100);
	});

	it("La recogida respeta horario, festivos y comienzo de la preparación, también en WhatsApp", async () => {
		const siguiente = apertura().inicio;
		const invalida = new Date(siguiente.getTime() - 60_000).toISOString();
		for (const ruta of ["/pedidos", "/n8n/pedidos"]) {
			const respuesta = await app.inject({
				method: "POST", url: ruta, headers: { "x-api-key": process.env.N8N_API_KEY },
				payload: { ...datos(), ...(ruta === "/pedidos" ? { tipo: "recoger" } : {}), hora_recogida: invalida },
			});
			assert.equal(respuesta.statusCode, 400);
			assert.match(respuesta.json().error, /07:00–19:00/);
		}
		const valida = new Date(siguiente.getTime() + 60 * 60_000).toISOString();
		assert.equal((await pedir("recoger", { horaRecogida: valida })).hora_recogida.toISOString(), valida);
		await assert.rejects(() => pedir("whatsapp", { horaRecogida: `${hoy}T12:00:00+01:00` }), (error) => error.statusCode === 400 && /cerrado/.test(error.message));
	});

	it("Una apertura tras más de 48 horas permite elegir su hora sin el límite antiguo", async () => {
		const cerrados = Array.from({ length: 4 }, (_, dia) => new Date(Date.parse(`${hoy}T00:00:00Z`) + dia * 86_400_000).toISOString().slice(0, 10));
		await pool.query("UPDATE negocio SET datos = datos || jsonb_build_object('dias_cerrado', $1::jsonb) WHERE id = 1", [JSON.stringify(cerrados)]);
		const siguiente = siguienteApertura(horario, cerrados, new Date());
		const respuesta = await app.inject({
			method: "POST", url: "/pedidos", payload: { ...datos(), tipo: "recoger", hora_recogida: siguiente.inicio.toISOString() },
		});
		assert.equal(respuesta.statusCode, 201);
		assert.equal(respuesta.json().fecha, siguiente.fecha);
	});

	it("Sin apertura prevista rechaza ambos canales y publica un estado sin horas", async () => {
		const cerrado = Object.fromEntries(dias.map((dia) => [dia, null]));
		await pool.query("UPDATE negocio SET datos = datos || jsonb_build_object('horario', $1::jsonb) WHERE id = 1", [cerrado]);
		for (const tipo of ["recoger", "whatsapp"]) {
			await assert.rejects(() => pedir(tipo), (error) => error.statusCode === 409 && /no tenemos horario de apertura previsto/.test(error.message));
		}
		const estado = (await app.inject("/horario/estado?recogida=true")).json();
		assert.equal(estado.abierto, false);
		assert.equal(estado.siguiente_apertura, null);
		assert.equal(estado.recogida, null);
	});

	it("Con el local abierto conserva entrega en mesa y fecha inmediata", async () => {
		const abierto = Object.fromEntries(dias.map((dia) => [dia, "00:00–24:00"]));
		await pool.query("UPDATE negocio SET datos = datos || jsonb_build_object('horario', $1::jsonb, 'dias_cerrado', '[]'::jsonb) WHERE id = 1", [abierto]);
		for (const tipo of ["mesa", "recoger", "whatsapp"]) {
			const pedido = await pedir(tipo);
			assert.equal(pedido.fuera_horario, false);
			assert.equal(pedido.atender_desde, null);
			assert.equal(pedido.fecha, hoy);
			assert.equal(Boolean(pedido.cuenta_id), tipo === "mesa");
		}
	});

	it("El endpoint público usa la misma apertura y ofrece solo minutos válidos", async () => {
		const respuesta = await app.inject("/horario/estado?recogida=true");
		assert.equal(respuesta.statusCode, 200);
		assert.equal(respuesta.headers["cache-control"], "no-store");
		const estado = respuesta.json();
		assert.equal(estado.abierto, false);
		assert.equal(estado.siguiente_apertura, apertura().inicio.toISOString());
		assert.equal(estado.recogida.fecha, apertura().fecha);
		assert.equal(estado.recogida.opciones[0].hora, "07:00");
		assert.equal(estado.recogida.opciones.at(-1).hora, "18:59");
		assert.equal((await app.inject("/horario/estado?recogida=false")).statusCode, 400);
		assert.equal("recogida" in (await app.inject("/horario/estado")).json(), false);
	});

	it("Un programado no se prepara antes de abrir, pero se puede cancelar y recuperar el stock", async () => {
		const pedido = await pedir();
		await assert.rejects(() => servicio.cambiarEstado(pedido.id, "preparando"), (error) => error.statusCode === 409 && /programado para la apertura/.test(error.message));
		await servicio.cambiarEstado(pedido.id, "cancelado");
		assert.equal((await pool.query("SELECT stock FROM productos WHERE id = $1", [producto.id])).rows[0].stock, 100);
		const siguiente = await pedir();
		await pool.query("UPDATE pedidos SET atender_desde = now() - interval '1 minute' WHERE id = $1", [siguiente.id]);
		assert.equal((await servicio.cambiarEstado(siguiente.id, "preparando")).estado, "preparando");
	});

	it("La ficha admite festivos válidos, conserva los omitidos y rechaza tramos nocturnos", async () => {
		const ficha = (await pool.query("SELECT datos FROM negocio WHERE id = 1")).rows[0].datos;
		const put = (payload) => app.inject({ method: "PUT", url: "/admin/negocio", headers: sesion(), payload });
		assert.equal((await put({ ...ficha, dias_cerrado: ["2026-02-30"] })).statusCode, 400);
		assert.equal((await put({ ...ficha, horario: { ...horario, lunes: "19:00–07:00" } })).statusCode, 400);
		const { dias_cerrado: _dias, ...antigua } = ficha;
		assert.equal((await put(antigua)).statusCode, 200);
		assert.deepEqual((await pool.query("SELECT datos->'dias_cerrado' AS dias FROM negocio WHERE id = 1")).rows[0].dias, [hoy]);
	});
});
