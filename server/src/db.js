import pg from "pg";
import { config } from "./config.js";

// numeric de Postgres llega como texto; para precios pequeños un number es seguro
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool({
	connectionString: config.databaseUrl,
	max: 10,
});

pool.on("error", (err) => {
	console.error("Error inesperado en el pool de Postgres", err);
});

export function query(text, params) {
	return pool.query(text, params);
}

/** Ejecuta fn dentro de una transacción y devuelve su resultado. */
export async function transaccion(fn) {
	const client = await pool.connect();
	try {
		await client.query("BEGIN");
		const resultado = await fn(client);
		await client.query("COMMIT");
		return resultado;
	} catch (err) {
		await client.query("ROLLBACK").catch(() => {});
		throw err;
	} finally {
		client.release();
	}
}
