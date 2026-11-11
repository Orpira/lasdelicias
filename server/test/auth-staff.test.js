import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { crearAutenticadorStaff } from "../src/auth-staff.js";

describe("Revocación y permisos de sesiones del personal", () => {
	async function escenario() {
		let activo = true;
		let rol = "admin";
		let falloBase = false;
		const pool = {
			async query(_sql, params) {
				assert.deepEqual(params, ["staff-1"]);
				if (falloBase) throw new Error("PostgreSQL no disponible");
				return { rows: activo ? [{ id: "staff-1", nombre: "Prueba", rol }] : [] };
			},
		};
		const app = Fastify();
		await app.register(jwt, { secret: "solo-pruebas-sesion-personal" });
		app.decorate("autenticar", crearAutenticadorStaff(pool));
		app.decorate("soloAdmin", async (request, reply) => {
			if (request.user.rol !== "admin") return reply.code(403).send({ error: "Solo admin" });
		});
		app.get("/privada", { onRequest: [app.autenticar] }, async (request) => ({ rol: request.user.rol }));
		app.get("/admin", { onRequest: [app.autenticar, app.soloAdmin] }, async () => ({ ok: true }));
		await app.ready();
		const token = app.jwt.sign({ sub: "staff-1", rol: "admin" }, { expiresIn: "14h" });
		const solicitar = (url, bearer = token) => app.inject({ url, headers: { authorization: `Bearer ${bearer}` } });
		return { app, solicitar, desactivar: () => { activo = false; }, cambiarRol: (nuevo) => { rol = nuevo; }, romperBase: () => { falloBase = true; } };
	}

	it("desactiva inmediatamente el acceso con un JWT aún válido", async () => {
		const e = await escenario();
		try {
			assert.equal((await e.solicitar("/admin")).statusCode, 200);
			e.desactivar();
			assert.equal((await e.solicitar("/admin")).statusCode, 401);
			assert.equal((await e.solicitar("/privada")).statusCode, 401);
		} finally { await e.app.close(); }
	});

	it("aplica el rol vigente sin esperar a que caduque el JWT", async () => {
		const e = await escenario();
		try {
			e.cambiarRol("barra");
			assert.equal((await e.solicitar("/admin")).statusCode, 403);
			assert.equal((await e.solicitar("/privada")).json().rol, "barra");
		} finally { await e.app.close(); }
	});

	it("rechaza tokens inválidos y no oculta errores de PostgreSQL como 401", async () => {
		const e = await escenario();
		try {
			assert.equal((await e.solicitar("/privada", "invalido")).statusCode, 401);
			e.romperBase();
			assert.equal((await e.solicitar("/privada")).statusCode, 500);
		} finally { await e.app.close(); }
	});
});
