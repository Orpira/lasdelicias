// Firma de los webhooks que la API envía a n8n (HMAC-SHA256 con marca de tiempo).
//
// Cabeceras enviadas:
//   X-Delicias-Evento:    id único del evento (UUID) → n8n descarta los repetidos
//   X-Delicias-Timestamp: segundos Unix del envío   → n8n rechaza los antiguos (anti-replay)
//   X-Delicias-Firma:     v1=<hex de HMAC-SHA256(secreto, "<timestamp>.<evento>.<cuerpo>")>
//
// El secreto ya no viaja en ninguna cabecera: quien intercepte una petición no puede
// firmar otras, y repetirla tal cual se detecta por el id y la marca de tiempo.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const TOLERANCIA_FIRMA_S = 300;

export function calcularFirma(secreto, timestamp, eventoId, cuerpo) {
	return `v1=${createHmac("sha256", secreto).update(`${timestamp}.${eventoId}.${cuerpo}`).digest("hex")}`;
}

/** Prepara el cuerpo y las cabeceras firmadas de un evento. */
export function firmarEvento(secreto, evento, ahora = Date.now()) {
	const eventoId = randomUUID();
	const timestamp = Math.floor(ahora / 1000);
	const cuerpo = JSON.stringify({ ...evento, evento_id: eventoId, enviado_en: new Date(ahora).toISOString() });
	return {
		cuerpo,
		cabeceras: {
			"Content-Type": "application/json",
			"X-Delicias-Evento": eventoId,
			"X-Delicias-Timestamp": String(timestamp),
			"X-Delicias-Firma": calcularFirma(secreto, timestamp, eventoId, cuerpo),
		},
	};
}

/**
 * Verificación de referencia (la misma lógica que el nodo "Verificar firma" de n8n).
 * Devuelve null si es válida o el motivo del rechazo.
 */
export function verificarFirma(secreto, { timestamp, eventoId, firma, cuerpo }, ahora = Date.now()) {
	if (!secreto) return "sin secreto configurado";
	const ts = Number(timestamp);
	if (!Number.isInteger(ts)) return "marca de tiempo no válida";
	if (Math.abs(Math.floor(ahora / 1000) - ts) > TOLERANCIA_FIRMA_S) return "marca de tiempo fuera de margen";
	if (!/^[0-9a-f-]{36}$/.test(String(eventoId))) return "id de evento no válido";
	const esperada = Buffer.from(calcularFirma(secreto, ts, eventoId, cuerpo));
	const recibida = Buffer.from(String(firma ?? ""));
	if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return "firma no válida";
	return null;
}
