export function etiquetaMesa(
	numero: number,
	nombre: string | null | undefined,
	{ conNumero = false }: { conNumero?: boolean } = {},
) {
	const nombrePorDefecto = `Mesa ${numero}`;
	if (!nombre || nombre === nombrePorDefecto) return nombrePorDefecto;
	return conNumero ? `${nombre} (mesa ${numero})` : nombre;
}
