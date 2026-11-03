// Identificador anónimo de este móvil (no contiene datos personales).
// Sirve para detectar si un cliente con un pedido en curso pide desde otra mesa.
const CLAVE = "delicias.dispositivo";
let enMemoria: string | null = null;

export function idDispositivo(): string {
	try {
		let id = localStorage.getItem(CLAVE);
		if (!id) {
			id = crypto.randomUUID();
			localStorage.setItem(CLAVE, id);
		}
		return id;
	} catch {
		enMemoria ??= crypto.randomUUID();
		return enMemoria;
	}
}
