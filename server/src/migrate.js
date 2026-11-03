// Aplica en orden los .sql de /migrations que aún no se hayan aplicado
// y, si la carta está vacía, la rellena con seed/productos.json.
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool } from "./db.js";

const raiz = path.dirname(fileURLToPath(import.meta.url));
const dirMigraciones = path.join(raiz, "..", "migrations");
const seedProductos = path.join(raiz, "..", "seed", "productos.json");

export async function migrar() {
	const client = await pool.connect();
	try {
		// Evita que dos arranques simultáneos migren a la vez
		await client.query("SELECT pg_advisory_lock(727001)");
		await client.query(`CREATE TABLE IF NOT EXISTS _migraciones (
			nombre text PRIMARY KEY,
			aplicada_en timestamptz NOT NULL DEFAULT now()
		)`);
		const { rows } = await client.query("SELECT nombre FROM _migraciones");
		const aplicadas = new Set(rows.map((r) => r.nombre));
		const archivos = (await readdir(dirMigraciones)).filter((f) => f.endsWith(".sql")).sort();

		for (const archivo of archivos) {
			if (aplicadas.has(archivo)) continue;
			const sql = await readFile(path.join(dirMigraciones, archivo), "utf8");
			await client.query("BEGIN");
			try {
				await client.query(sql);
				await client.query("INSERT INTO _migraciones (nombre) VALUES ($1)", [archivo]);
				await client.query("COMMIT");
				console.log(`Migración aplicada: ${archivo}`);
			} catch (err) {
				await client.query("ROLLBACK");
				throw new Error(`Falló la migración ${archivo}: ${err.message}`);
			}
		}

		const { rows: cuenta } = await client.query("SELECT count(*)::int AS n FROM productos");
		if (cuenta[0].n === 0) {
			const productos = JSON.parse(await readFile(seedProductos, "utf8"));
			let orden = 0;
			for (const p of productos) {
				await client.query(
					`INSERT INTO productos (nombre, descripcion, precio, categoria, valoracion, imagen_url, orden,
					                       stock, stock_minimo)
					 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
					[p.nombre, p.descripcion, p.precio, p.categoria, p.valoracion, p.imagen ?? "", orden++,
						p.stock ?? null, p.stock_minimo ?? 0],
				);
			}
			console.log(`Carta inicial cargada: ${productos.length} productos`);
		}
	} finally {
		await client.query("SELECT pg_advisory_unlock(727001)").catch(() => {});
		client.release();
	}
}

// Ejecución directa: npm run migrate
if (process.argv[1] === fileURLToPath(import.meta.url)) {
	migrar()
		.then(() => pool.end())
		.catch((err) => {
			console.error(err.message);
			process.exit(1);
		});
}
