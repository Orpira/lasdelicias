// Cliente de la API de Las Delicias (backend propio en el servidor)
const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3001").replace(/\/$/, "");

const CLAVE_TOKEN = "delicias.token";

export function leerToken(): string | null {
	try {
		return localStorage.getItem(CLAVE_TOKEN);
	} catch {
		return null;
	}
}

export function guardarToken(token: string | null) {
	try {
		if (token) localStorage.setItem(CLAVE_TOKEN, token);
		else localStorage.removeItem(CLAVE_TOKEN);
	} catch {
		/* almacenamiento no disponible: la sesión dura lo que la pestaña */
	}
}

export class ErrorApi extends Error {
	status: number;
	constructor(mensaje: string, status: number) {
		super(mensaje);
		this.status = status;
	}
}

type Opciones = { metodo?: string; cuerpo?: unknown; auth?: boolean; formData?: FormData };

async function solicitar(ruta: string, { metodo = "GET", cuerpo, auth = false, formData }: Opciones = {}): Promise<Response> {
	const cabeceras: Record<string, string> = {};
	if (cuerpo !== undefined) cabeceras["Content-Type"] = "application/json";
	if (auth) {
		const token = leerToken();
		if (token) cabeceras.Authorization = `Bearer ${token}`;
	}
	let res: Response;
	try {
		res = await fetch(`${API_URL}${ruta}`, {
			method: metodo,
			headers: cabeceras,
			body: formData ?? (cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined),
		});
	} catch {
		throw new ErrorApi("No hay conexión con el servidor. Inténtalo de nuevo.", 0);
	}
	if (!res.ok) {
		const datos = await res.json().catch(() => ({}));
		if (res.status === 401 && auth) guardarToken(null);
		throw new ErrorApi(datos.error ?? `Error ${res.status}`, res.status);
	}
	return res;
}

export async function api<T>(ruta: string, opciones: Opciones = {}): Promise<T> {
	const res = await solicitar(ruta, opciones);
	if (res.status === 204) return undefined as T;
	const datos = await res.json().catch(() => ({}));
	return datos as T;
}

export async function apiArchivo(ruta: string, opciones: Opciones = {}): Promise<Blob> {
	return (await solicitar(ruta, opciones)).blob();
}

/**
 * Escucha un stream SSE de la API. Usa fetch (no EventSource) para poder
 * enviar el token del personal en la cabecera. Reconecta solo si se corta.
 * Devuelve una función para cerrar.
 */
export function escuchar(
	ruta: string,
	alRecibir: (evento: string, datos: unknown) => void,
	{ auth = false, alCambiarConexion }: { auth?: boolean; alCambiarConexion?: (conectado: boolean) => void } = {},
): () => void {
	const control = new AbortController();
	let activo = true;

	async function conectar() {
		while (activo) {
			try {
				const cabeceras: Record<string, string> = { Accept: "text/event-stream" };
				const token = auth ? leerToken() : null;
				if (token) cabeceras.Authorization = `Bearer ${token}`;
				const res = await fetch(`${API_URL}${ruta}`, { headers: cabeceras, signal: control.signal });
				if (!activo) return;
				if (res.status === 401) {
					guardarToken(null);
					alCambiarConexion?.(false);
					return;
				}
				if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
				alCambiarConexion?.(true);

				const lector = res.body.pipeThrough(new TextDecoderStream()).getReader();
				let bufer = "";
				for (;;) {
					const { value, done } = await lector.read();
					if (done || !activo) break;
					bufer += value;
					let corte: number;
					while ((corte = bufer.indexOf("\n\n")) !== -1) {
						const bloque = bufer.slice(0, corte);
						bufer = bufer.slice(corte + 2);
						let evento = "message";
						let datos = "";
						for (const linea of bloque.split("\n")) {
							if (linea.startsWith("event: ")) evento = linea.slice(7);
							else if (linea.startsWith("data: ")) datos += linea.slice(6);
						}
						if (datos) {
							let contenido: unknown;
							try {
								contenido = JSON.parse(datos);
							} catch (error) {
								console.warn("Se recibió un mensaje en directo con JSON no válido", error);
								continue;
							}
							alRecibir(evento, contenido);
						}
					}
				}
			} catch (error) {
				if (!activo) return;
				console.warn("Se interrumpió la conexión en directo; se intentará de nuevo", error);
			}
			if (!activo) return;
			alCambiarConexion?.(false);
			if (activo) await new Promise((r) => setTimeout(r, 3000));
		}
	}

	conectar();
	return () => {
		activo = false;
		control.abort();
	};
}

export const euros = (n: number) =>
	n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });

export const hora = (iso: string) =>
	new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
