import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import pg from "pg";
import Fastify from "fastify";
import jwt from "@fastify/jwt";

const urlPruebas = process.env.DATABASE_URL_TEST;
const dias = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
const horario = Object.fromEntries(dias.map((dia) => [dia, "00:00–23:59"]));

describe("Tokens de mesa e idempotencia de pedidos", {
	skip: !urlPruebas && "Define DATABASE_URL_TEST con una base PostgreSQL dedicada a pruebas",
}, () => {
	let conexionBase, esquema, pool, app, producto, mesa;

	before(async () => {
		esquema = `pruebas_seguridad_${randomUUID().replaceAll("-", "")}`;
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
		for (const archivo of (await readdir(new URL("../migrations/", import.meta.url))).filter((nombre) => nombre.endsWith(".sql")).sort()) {
			await conexionBase.query(await readFile(new URL(`../migrations/${archivo}`, import.meta.url), "utf8"));
		}
		({ rows: [producto] } = await pool.query("INSERT INTO productos (nombre, precio, categoria, stock) VALUES ('Café de seguridad', 2.5, 'Bebidas', 100) RETURNING id"));
		({ rows: [mesa] } = await pool.query("SELECT numero, token FROM mesas WHERE numero = 1"));
		await pool.query("UPDATE negocio SET datos = datos || jsonb_build_object('horario', $1::jsonb, 'dias_cerrado', '[]'::jsonb) WHERE id = 1", [horario]);
		app = Fastify();
		await app.register(jwt, { secret: process.env.JWT_SECRET });
		app.decorate("autenticar", async (request) => request.jwtVerify());
		app.decorate("soloAdmin", async () => {});
		app.setErrorHandler((error, request, reply) => reply.code(error.statusCode ?? 500).send({ error: error.message }));
		await app.register((await import("../src/rutas/publicas.js")).default);
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
	});

	const cuerpo = (cambios = {}) => ({
		items: [{ producto_id: producto.id, cantidad: 2 }], nombre: "Cliente", telefono: "600000000", tipo: "recoger", ...cambios,
	});
	const pedir = (clave, payload = cuerpo()) => app.inject({
		method: "POST", url: "/pedidos", payload, headers: clave === undefined ? {} : { "idempotency-key": clave },
	});
	const contar = async () => (await pool.query("SELECT count(*)::int AS n FROM pedidos")).rows[0].n;
	const stock = async () => (await pool.query("SELECT stock FROM productos WHERE id = $1", [producto.id])).rows[0].stock;

	it("Los tokens de mesa tienen 128 bits y los QR antiguos de 16 caracteres no sirven", async () => {
		assert.match(mesa.token, /^[a-f0-9]{32}$/);
		const { rows } = await pool.query("SELECT nuevo_token_mesa() AS t FROM generate_series(1, 200)");
		assert.equal(new Set(rows.map((r) => r.t)).size, 200);
		for (const { t } of rows) assert.match(t, /^[a-f0-9]{32}$/);
		assert.equal((await app.inject({ url: `/mesas/qr/${mesa.token}` })).statusCode, 200);
		assert.equal((await app.inject({ url: `/mesas/qr/${mesa.token.slice(0, 16)}` })).statusCode, 404);
		await assert.rejects(pool.query("UPDATE mesas SET token = 'abcdef0123456789' WHERE numero = 1"), /mesas_token_formato/);
	});

	it("Un reintento con la misma Idempotency-Key devuelve el pedido original sin duplicarlo", async () => {
		const clave = randomUUID();
		const primero = await pedir(clave);
		assert.equal(primero.statusCode, 201);
		const repetido = await pedir(clave);
		assert.equal(repetido.statusCode, 200);
		assert.equal(repetido.headers["idempotent-replayed"], "true");
		assert.equal(repetido.json().codigo, primero.json().codigo);
		assert.equal(await contar(), 1);
		assert.equal(await stock(), 98);
	});

	it("Dos envíos simultáneos con la misma clave crean un único pedido", async () => {
		const clave = randomUUID();
		const respuestas = await Promise.all([pedir(clave), pedir(clave), pedir(clave)]);
		assert.deepEqual(respuestas.map((r) => r.statusCode).sort(), [200, 200, 201]);
		assert.equal(new Set(respuestas.map((r) => r.json().codigo)).size, 1);
		assert.equal(await contar(), 1);
	});

	it("Rechaza reutilizar la clave con otro contenido y las claves mal formadas", async () => {
		const clave = randomUUID();
		assert.equal((await pedir(clave)).statusCode, 201);
		assert.equal((await pedir(clave, cuerpo({ nombre: "Otra persona" }))).statusCode, 422);
		assert.equal((await pedir("corta")).statusCode, 400);
		assert.equal((await pedir("con espacios no permitidos 1234")).statusCode, 400);
		assert.equal((await pedir()).statusCode, 201, "sin clave se sigue aceptando");
		assert.equal(await contar(), 2);
	});

	it("n8n también puede reintentar sin duplicar pedidos de WhatsApp", async () => {
		const headers = { "x-api-key": process.env.N8N_API_KEY, "idempotency-key": "wamid_HBgLMzQ2MDA" };
		const { tipo: _tipo, ...payload } = cuerpo();
		const a = await app.inject({ method: "POST", url: "/n8n/pedidos", headers, payload });
		const b = await app.inject({ method: "POST", url: "/n8n/pedidos", headers, payload });
		assert.deepEqual([a.statusCode, b.statusCode], [201, 200]);
		assert.equal(await contar(), 1);
	});

	it("Las rutas públicas rechazan campos desconocidos, también dentro de las líneas", async () => {
		assert.equal((await pedir(undefined, cuerpo({ total: 0 }))).statusCode, 400);
		assert.equal((await pedir(undefined, cuerpo({ items: [{ producto_id: producto.id, cantidad: 1, precio: 0 }] }))).statusCode, 400);
		const llamada = await app.inject({ method: "POST", url: `/mesas/qr/${mesa.token}/llamar`, payload: { motivo: "cuenta", mesa: 9 } });
		assert.equal(llamada.statusCode, 400);
		assert.equal(await contar(), 0);
	});
});
