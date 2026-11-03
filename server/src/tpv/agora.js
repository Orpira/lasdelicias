// Adaptador Ágora — PENDIENTE de confirmar con el negocio
//
// Lo que se sabe:
//   Ágora expone una API HTTP (JSON o XML) en la instalación del propio local.
//   Requiere el módulo "Integration Services" licenciado y activado por su distribuidor.
//   AGORA_URL = dirección de esa API (accesible desde este servidor, p. ej. por VPN)
//   AGORA_TOKEN = token de la API
//
// Falta: activar el módulo, confirmar la ruta de exportación de existencias y el campo
// que usaremos como codigo_tpv. Alternativa inmediata: n8n → POST /n8n/stock.
export default {
	nombre: "agora",
	configurado: (cfg) => Boolean(cfg.agora.url && cfg.agora.token),

	async leerStock() {
		throw new Error("Adaptador de Ágora pendiente: falta activar Integration Services y confirmar el endpoint de stock");
	},
};
