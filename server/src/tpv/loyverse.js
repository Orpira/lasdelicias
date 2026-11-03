// Adaptador Loyverse (API pública v1.0)
// Enlace: en cada producto de la carta, codigo_tpv = variant_id del artículo en Loyverse.
// Credenciales: LOYVERSE_TOKEN (Back Office → Integraciones → Tokens de acceso)
//               LOYVERSE_STORE_ID (opcional, si hay varias tiendas)
const BASE = "https://api.loyverse.com/v1.0";

export default {
	nombre: "loyverse",
	configurado: (cfg) => Boolean(cfg.loyverse.token),

	async leerStock(cfg) {
		const articulos = [];
		let cursor = null;
		do {
			const params = new URLSearchParams({ limit: "250" });
			if (cfg.loyverse.tiendaId) params.set("store_ids", cfg.loyverse.tiendaId);
			if (cursor) params.set("cursor", cursor);
			const res = await fetch(`${BASE}/inventory?${params}`, {
				headers: { Authorization: `Bearer ${cfg.loyverse.token}`, Accept: "application/json" },
				signal: AbortSignal.timeout(15_000),
			});
			if (!res.ok) throw new Error(`Loyverse respondió ${res.status}`);
			const datos = await res.json();
			for (const nivel of datos.inventory_levels ?? []) {
				articulos.push({ codigo: nivel.variant_id, stock: nivel.in_stock });
			}
			cursor = datos.cursor ?? null;
		} while (cursor);
		return articulos;
	},
};
