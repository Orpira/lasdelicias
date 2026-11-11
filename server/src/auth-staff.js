/** Autenticación de personal: JWT válido, cuenta activa y permisos actuales. */
export function crearAutenticadorStaff(pool) {
	return async function autenticar(request, reply) {
		try {
			await request.jwtVerify();
		} catch {
			return reply.code(401).send({ error: "Sesión caducada o no válida" });
		}
		const { rows: [empleado] } = await pool.query(
			"SELECT id, nombre, rol FROM staff WHERE id = $1 AND activo = true",
			[request.user.sub],
		);
		if (!empleado) return reply.code(401).send({ error: "Sesión revocada o usuario desactivado" });
		request.user = { ...request.user, nombre: empleado.nombre, rol: empleado.rol };
	};
}
