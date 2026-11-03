import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config.js";
import { pool } from "./db.js";
import { migrar } from "./migrate.js";
import { iniciarEscucha } from "./eventos.js";
import { iniciarSincronizacionTpv } from "./tpv/index.js";
import { iniciarAnonimizacion } from "./privacidad.js";
import rutasPublicas from "./rutas/publicas.js";
import rutasStaff from "./rutas/staff.js";
import rutasN8n from "./rutas/n8n.js";

const app = Fastify({
	logger: { level: process.env.LOG_LEVEL ?? "info" },
	trustProxy: true, // detrás de Caddy/Nginx: IP real para el límite de peticiones
	bodyLimit: 64 * 1024,
});

await app.register(cors, {
	origin: config.corsOrigenes,
	methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
});
await app.register(rateLimit, { global: false });
await app.register(jwt, { secret: config.jwtSecret });
await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

app.decorate("autenticar", async (request, reply) => {
	try {
		await request.jwtVerify();
	} catch {
		return reply.code(401).send({ error: "Sesión caducada o no válida" });
	}
});
app.decorate("soloAdmin", async (request, reply) => {
	if (request.user?.rol !== "admin") {
		return reply.code(403).send({ error: "Solo un administrador puede hacer esto" });
	}
});

app.setErrorHandler((err, request, reply) => {
	// uuid mal formado en la URL
	if (err.code === "22P02") return reply.code(404).send({ error: "No encontrado" });
	// valor único repetido (p. ej. dos productos con el mismo código de caja)
	if (err.code === "23505") return reply.code(409).send({ error: "Ya existe otro registro con ese valor (¿código de caja repetido?)" });
	const status = err.statusCode ?? 500;
	if (status >= 500) request.log.error(err);
	return reply.code(status).send({
		error: status >= 500 ? "Error interno del servidor" : err.message,
		...(err.detalles ? { detalles: err.detalles } : {}),
	});
});

app.get("/health", async () => {
	await pool.query("SELECT 1");
	return { ok: true };
});

await app.register(rutasPublicas);
await app.register(rutasStaff);
await app.register(rutasN8n);

await migrar();
const pararEscucha = iniciarEscucha(app.log);
const pararTpv = iniciarSincronizacionTpv(app.log);
const pararAnonimizacion = iniciarAnonimizacion(app.log);

async function apagar(senal) {
	app.log.info(`${senal} recibido, cerrando…`);
	pararTpv();
	await pararAnonimizacion();
	await pararEscucha();
	await app.close();
	await pool.end();
	process.exit(0);
}
process.on("SIGTERM", () => apagar("SIGTERM"));
process.on("SIGINT", () => apagar("SIGINT"));

await app.listen({ port: config.puerto, host: config.host });
