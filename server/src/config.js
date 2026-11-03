// Configuración leída de variables de entorno (ver .env.example)

function requerida(nombre) {
	const valor = process.env[nombre];
	if (!valor) {
		console.error(`Falta la variable de entorno ${nombre}`);
		process.exit(1);
	}
	return valor;
}

export const config = {
	puerto: Number(process.env.PORT ?? 3001),
	host: process.env.HOST ?? "0.0.0.0",
	databaseUrl: requerida("DATABASE_URL"),
	jwtSecret: requerida("JWT_SECRET"),
	// Orígenes del frontend permitidos (separados por comas)
	corsOrigenes: (process.env.CORS_ORIGINS ?? "http://localhost:5173")
		.split(",")
		.map((o) => o.trim())
		.filter(Boolean),
	// URL pública de la API, para construir las URLs de las imágenes subidas
	urlPublica: (process.env.PUBLIC_URL ?? "http://localhost:3001").replace(/\/$/, ""),
	uploadsDir: process.env.UPLOADS_DIR ?? "./uploads",
	// n8n: adónde enviar los eventos y con qué secreto firmarlos
	n8nWebhookUrl: process.env.N8N_WEBHOOK_URL ?? "",
	n8nWebhookSecret: process.env.N8N_WEBHOOK_SECRET ?? "",
	// Clave con la que n8n llama a la API (pedidos por WhatsApp, cambios de estado)
	n8nApiKey: process.env.N8N_API_KEY ?? "",
	zonaHoraria: "Europe/Madrid",
	// Integración con la caja (TPV). "ninguno" = sin conexión (stock gestionado en la app o vía n8n)
	tpv: {
		proveedor: (process.env.TPV_PROVEEDOR ?? "ninguno").toLowerCase(),
		intervaloMin: Math.max(1, Number(process.env.TPV_INTERVALO_MIN ?? 5)),
		loyverse: { token: process.env.LOYVERSE_TOKEN ?? "", tiendaId: process.env.LOYVERSE_STORE_ID ?? "" },
		revo: { tenant: process.env.REVO_TENANT ?? "", token: process.env.REVO_TOKEN ?? "" },
		agora: { url: process.env.AGORA_URL ?? "", token: process.env.AGORA_TOKEN ?? "" },
	},
};
