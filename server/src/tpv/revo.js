// Adaptador Revo XEF — PENDIENTE de confirmar con el negocio
//
// Lo que se sabe de su API:
//   Catálogo: https://api.revoxef.works/catalog/v1
//   Cabeceras: Tenant: <REVO_TENANT>, Authorization: Bearer <REVO_TOKEN>
//   Token: panel de Revo → Ajustes → Integraciones → Acceso API
//
// Falta: confirmar el endpoint de existencias del módulo de stock de su cuenta y el campo
// que usaremos como codigo_tpv (id del producto). Mientras tanto, si usan Revo,
// el puente puede hacerse con n8n → POST /n8n/stock.
export default {
	nombre: "revo",
	configurado: (cfg) => Boolean(cfg.revo.tenant && cfg.revo.token),

	async leerStock() {
		throw new Error("Adaptador de Revo pendiente: falta confirmar el endpoint de stock de la cuenta del negocio");
	},
};
