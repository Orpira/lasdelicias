import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";
import Fastify from "fastify";
import jwt from "@fastify/jwt";

const urlPruebas = process.env.DATABASE_URL_TEST;

describe("Cierre diario con criterio de venta", {
	skip: !urlPruebas && "Define DATABASE_URL_TEST con una base PostgreSQL dedicada a pruebas",
}, () => {
	let base, pool, app, cierres, administrador, productos, esquema, numero = 0;
	const fecha = "2000-01-03";
	const eurosCentimos = (valor) => Math.round(Number(valor) * 100);

	before(async () => {
		esquema = `pruebas_cobro_${randomUUID().replaceAll("-", "")}`;
		base = new pg.Client({ connectionString: urlPruebas });
		await base.connect();
		await base.query(`CREATE SCHEMA "${esquema}"`);
		await base.query(`SET search_path TO "${esquema}", public`);
		const url = new URL(urlPruebas);
		url.searchParams.set("options", `-csearch_path=${esquema},public`);
		process.env.DATABASE_URL = url.toString();
		process.env.JWT_SECRET = "clave-exclusiva-de-pruebas";
		process.env.N8N_API_KEY = randomUUID();
		process.env.N8N_WEBHOOK_URL = "";
		process.env.TPV_PROVEEDOR = "ninguno";
		({ pool } = await import("../src/db.js"));
		cierres = await import("../src/cierres.js");
		for (const archivo of (await readdir(new URL("../migrations/", import.meta.url))).filter((nombre) => nombre.endsWith(".sql")).sort()) {
			await base.query(await readFile(new URL(`../migrations/${archivo}`, import.meta.url), "utf8"));
		}
		({ rows: [administrador] } = await pool.query(
			"INSERT INTO staff (email, nombre, password_hash, rol) VALUES ('admin@pruebas.invalid', 'Admin', 'no-se-usa', 'admin') RETURNING id, rol",
		));
		({ rows: productos } = await pool.query(
			"INSERT INTO productos (nombre, precio, categoria) VALUES ('Café', 3.25, 'Bebidas'), ('Tarta', 2.10, 'Pastelería') RETURNING *",
		));
		app = Fastify();
		await app.register(jwt, { secret: process.env.JWT_SECRET });
		app.decorate("autenticar", async (request) => request.jwtVerify());
		app.decorate("soloAdmin", async (request, reply) => {
			if (request.user.rol !== "admin") return reply.code(403).send({ error: "Solo un administrador puede hacer esto" });
		});
		app.setErrorHandler((error, request, reply) => reply.code(error.statusCode ?? 500).send({ error: error.message }));
		await app.register((await import("../src/rutas/staff.js")).default);
		await app.ready();
	});

	after(async () => {
		await app?.close();
		await pool?.end();
		if (base && esquema) await base.query(`DROP SCHEMA IF EXISTS "${esquema}" CASCADE`).catch(() => {});
		await base?.end();
	});

	beforeEach(async () => {
		await pool.query("TRUNCATE cierres_diarios, pedidos, cuentas CASCADE");
		await pool.query("UPDATE negocio SET datos = datos || '{\"cierre_incluye_listos\":false}'::jsonb WHERE id = 1");
		numero = 0;
	});

	const sesion = (usuario = administrador) => ({
		authorization: `Bearer ${app.jwt.sign({ sub: usuario.id, rol: usuario.rol })}`,
	});

	async function pedido(estado, { pagado = false, metodo = null, tipo = "recoger", total = 3.25 } = {}) {
		const { rows: [nuevo] } = await pool.query(
			`INSERT INTO pedidos (codigo, fecha, numero_dia, nombre_cliente, tipo, mesa_numero, estado, total, pagado_at, metodo_pago)
			 VALUES ($1, $2::date, $3, 'Cliente', $4, $5, $6, $7, ${pagado ? "now()" : "NULL"}, $8) RETURNING *`,
			[randomUUID().replaceAll("-", "").slice(0, 10), fecha, ++numero, tipo, tipo === "mesa" ? 1 : null, estado, total, metodo],
		);
		await pool.query(
			"INSERT INTO pedido_items (pedido_id, producto_id, nombre, precio_unitario, cantidad) VALUES ($1, $2, $3, $4, 1)",
			[nuevo.id, productos[0].id, productos[0].nombre, productos[0].precio],
		);
		return nuevo;
	}

	it("usa solo cobrados por defecto", async () => {
		const negocio = (await pool.query("SELECT datos FROM negocio WHERE id = 1")).rows[0].datos;
		assert.equal(negocio.cierre_incluye_listos, false);
		assert.deepEqual(cierres.estadosQueCuentan(false), ["cobrado"]);
		assert.equal((await cierres.consultarCierre(fecha)).criterio_configurado, false);
	});

	it("cuenta solo pedidos cobrados en todos los desgloses", async () => {
		await pedido("entregado", { pagado: true, metodo: "efectivo" });
		await pedido("entregado");
		await pedido("listo");
		await pedido("nuevo");
		await pedido("cancelado");
		const entregados = (await cierres.consultarCierre(fecha, { incluye_listos: "false" })).resumen;
		assert.equal(entregados.totales.pedidos, 1);
		assert.equal(eurosCentimos(entregados.totales.importe), 325);
		assert.deepEqual(entregados.entregados, { pedidos: 2, importe: 6.5 });
		assert.deepEqual(entregados.listos_sin_recoger, { pedidos: 1, importe: 3.25 });
		assert.equal(entregados.en_curso.pedidos, 2);
		assert.equal(entregados.cancelados.pedidos, 1);
		const listos = (await cierres.consultarCierre(fecha, { incluye_listos: "true" })).resumen;
		assert.equal(eurosCentimos(listos.totales.importe), eurosCentimos(entregados.totales.importe));
		assert.equal(listos.en_curso.pedidos, 2);
	});

	it("calcula el cobro por método y la pendiente de cobro", async () => {
		await pedido("entregado", { pagado: true, metodo: "efectivo", total: 3.25 });
		await pedido("entregado", { pagado: true, metodo: "tarjeta", total: 2.10 });
		await pedido("entregado", { total: 4 });
		const resumen = (await cierres.consultarCierre(fecha)).resumen;
		assert.equal(resumen.cobro.total_cobrado, 5.35);
		assert.deepEqual(resumen.cobro.por_metodo.map((fila) => fila.pedidos), [1, 1, 0, 0]);
		assert.deepEqual(resumen.pendiente_cobro.entregados_sin_cobrar, { pedidos: 1, importe: 4 });
	});

	it("mantiene el criterio cobrado aunque se reciba la configuración antigua", async () => {
		const respuesta = await app.inject({ method: "PATCH", url: "/admin/negocio/cierre", headers: sesion(), payload: { cierre_incluye_listos: true } });
		assert.equal(respuesta.statusCode, 200);
		const cierre = await app.inject({ method: "POST", url: "/admin/cierres", headers: sesion(), payload: { fecha } });
		assert.equal(cierre.statusCode, 201);
		await app.inject({ method: "PATCH", url: "/admin/negocio/cierre", headers: sesion(), payload: { cierre_incluye_listos: false } });
		const historico = await app.inject({ url: `/admin/cierres/${fecha}`, headers: sesion() });
		assert.equal(historico.json().resumen.criterio.incluye_listos, false);
		assert.equal((await cierres.consultarCierre(fecha)).criterio_configurado, false);
	});

	it("bloquea el cierre de hoy por pedidos no cobrados", async () => {
		await pedido("listo");
		await pool.query("UPDATE negocio SET datos = datos || '{\"cierre_incluye_listos\":true}'::jsonb WHERE id = 1");
		const hoy = (await pool.query("SELECT (now() AT TIME ZONE 'Europe/Madrid')::date::text AS fecha")).rows[0].fecha;
		const cierre = await app.inject({ method: "POST", url: "/admin/cierres", headers: sesion(), payload: { fecha: hoy } });
		assert.equal(cierre.statusCode, 409);
	});

	it("permite forzar un cierre con cuenta abierta", async () => {
		await pool.query("INSERT INTO cuentas (mesa_numero, total) VALUES (1, 12.4)");
		const hoy = (await pool.query("SELECT (now() AT TIME ZONE 'Europe/Madrid')::date::text AS fecha")).rows[0].fecha;
		const bloqueado = await app.inject({ method: "POST", url: "/admin/cierres", headers: sesion(), payload: { fecha: hoy } });
		assert.equal(bloqueado.statusCode, 409);
		const forzado = await app.inject({ method: "POST", url: "/admin/cierres", headers: sesion(), payload: { fecha: hoy, forzar: true } });
		assert.equal(forzado.statusCode, 201);
	});
});
