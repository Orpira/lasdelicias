// Integración con la caja registradora (TPV)
//
// Arquitectura:
//   ┌ Adaptador de la marca (loyverse.js, revo.js, agora.js…) → lee el stock de la caja
//   │      cada TPV_INTERVALO_MIN minutos (sincronización "pull" desde la API)
//   ├ n8n → POST /n8n/stock (para cajas sin adaptador propio: n8n hace de puente)
//   └ aplicarStockExterno() → única puerta de entrada: actualiza stock y "agotado"
//                              de los productos enlazados por su codigo_tpv
//
// Para añadir una marca nueva: crea tpv/<marca>.js exportando
//   { nombre, configurado(cfg) → boolean, leerStock(cfg) → [{ codigo, stock }] }
// y regístrala en ADAPTADORES.
import { query, transaccion } from "../db.js";
import { config } from "../config.js";
import loyverse from "./loyverse.js";
import revo from "./revo.js";
import agora from "./agora.js";

const ADAPTADORES = { loyverse, revo, agora };

/**
 * Aplica el stock recibido de la caja a los productos enlazados.
 * La caja manda: se sobrescribe el stock y se marca agotado a 0.
 */
export async function aplicarStockExterno(origen, articulos) {
	const resultado = await transaccion(async (client) => {
		let actualizados = 0;
		let sinEnlazar = 0;
		for (const { codigo, stock } of articulos) {
			const unidades = Math.max(0, Math.floor(Number(stock) || 0));
			const { rowCount } = await client.query(
				`UPDATE productos SET stock = $2, disponible = $2 > 0
				 WHERE codigo_tpv = $1 AND activo AND (stock IS DISTINCT FROM $2 OR disponible <> ($2 > 0))`,
				[codigo, unidades],
			);
			if (rowCount) actualizados += rowCount;
			else {
				const { rows } = await client.query("SELECT 1 FROM productos WHERE codigo_tpv = $1 AND activo", [codigo]);
				if (!rows[0]) sinEnlazar++;
			}
		}
		return { actualizados, sinEnlazar };
	});
	await registrar(origen, true, resultado.actualizados, resultado.sinEnlazar, "");
	return resultado;
}

async function registrar(origen, ok, actualizados, sinEnlazar, mensaje) {
	await query(
		`INSERT INTO sincronizaciones_tpv (origen, ok, actualizados, sin_enlazar, mensaje)
		 VALUES ($1, $2, $3, $4, $5)`,
		[origen, ok, actualizados, sinEnlazar, mensaje.slice(0, 500)],
	);
	// Conserva solo el último mes de registros
	await query("DELETE FROM sincronizaciones_tpv WHERE created_at < now() - interval '30 days'");
}

/** Ejecuta una sincronización con el adaptador configurado. */
export async function sincronizarAhora() {
	const adaptador = ADAPTADORES[config.tpv.proveedor];
	if (!adaptador) throw new Error("No hay caja conectada (TPV_PROVEEDOR=ninguno)");
	if (!adaptador.configurado(config.tpv)) throw new Error(`Faltan credenciales de ${adaptador.nombre} en .env`);
	try {
		const articulos = await adaptador.leerStock(config.tpv);
		return await aplicarStockExterno(adaptador.nombre, articulos);
	} catch (err) {
		await registrar(adaptador.nombre, false, 0, 0, err.message).catch(() => {});
		throw err;
	}
}

export async function estadoTpv() {
	const { rows } = await query(
		`SELECT origen, ok, actualizados, sin_enlazar, mensaje, created_at
		 FROM sincronizaciones_tpv ORDER BY created_at DESC LIMIT 10`,
	);
	const { rows: [enlazados] } = await query(
		"SELECT count(*)::int AS n FROM productos WHERE activo AND codigo_tpv IS NOT NULL",
	);
	const adaptador = ADAPTADORES[config.tpv.proveedor];
	return {
		proveedor: adaptador?.nombre ?? "ninguno",
		configurado: adaptador ? adaptador.configurado(config.tpv) : false,
		intervalo_min: config.tpv.intervaloMin,
		productos_enlazados: enlazados.n,
		ultimas: rows,
	};
}

/** Arranca la sincronización periódica si hay una caja configurada. */
export function iniciarSincronizacionTpv(log) {
	const adaptador = ADAPTADORES[config.tpv.proveedor];
	if (!adaptador) {
		log.info("Caja (TPV): sin conexión directa; stock gestionado en la app o vía n8n");
		return () => {};
	}
	if (!adaptador.configurado(config.tpv)) {
		log.warn(`Caja (TPV): ${adaptador.nombre} seleccionado pero faltan credenciales`);
		return () => {};
	}
	const ejecutar = () =>
		sincronizarAhora()
			.then((r) => r.actualizados && log.info(r, `Stock sincronizado desde ${adaptador.nombre}`))
			.catch((err) => log.warn({ err: err.message }, `Fallo al sincronizar con ${adaptador.nombre}`));
	const primero = setTimeout(ejecutar, 10_000);
	const intervalo = setInterval(ejecutar, config.tpv.intervaloMin * 60_000);
	log.info(`Caja (TPV): ${adaptador.nombre}, sincronización cada ${config.tpv.intervaloMin} min`);
	return () => {
		clearTimeout(primero);
		clearInterval(intervalo);
	};
}
