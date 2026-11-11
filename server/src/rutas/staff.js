// Rutas del personal del local: login, panel de pedidos, llamadas de mesa y gestión de la carta
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { query } from "../db.js";
import { config } from "../config.js";
import {
	esquemaEstado,
	esquemaEstadoOpinion,
	esquemaGuardarCierre,
	esquemaLogin,
	esquemaMesaCambio,
	esquemaMesaNueva,
	esquemaNegocio,
	esquemaProducto,
	esquemaStaffCambio,
	esquemaStaffNuevo,
	validar,
} from "../esquemas.js";
import { cambiarEstado, obtenerPedidoPorId, pedidosDelPanel } from "../pedidos-servicio.js";
import { anularCuenta, cobrarCuenta, cobrarPedido, listarCuentas, obtenerCuenta, pendientesDeCobro } from "../cuentas.js";
import { configurarCierre, consultarCierre, csvCierre, guardarCierre } from "../cierres.js";
import { abrirSSE, suscribirPanel } from "../eventos.js";
import { estadoTpv, sincronizarAhora } from "../tpv/index.js";

const EXTENSIONES = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
// Hash ficticio para que un email inexistente tarde lo mismo que uno existente
const HASH_FALSO = bcrypt.hashSync("no-existe", 10);

export default async function rutasStaff(app) {
	app.post(
		"/auth/login",
		{ config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
		async (request, reply) => {
			const { email, password } = validar(esquemaLogin, request.body);
			const { rows } = await query(
				"SELECT id, email, nombre, rol, password_hash FROM staff WHERE email = $1 AND activo",
				[email],
			);
			const usuario = rows[0];
			const ok = await bcrypt.compare(password, usuario?.password_hash ?? HASH_FALSO);
			if (!usuario || !ok) return reply.code(401).send({ error: "Email o contraseña incorrectos" });
			const token = app.jwt.sign(
				{ sub: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
				{ expiresIn: "14h" }, // un turno largo
			);
			return { token, usuario: { id: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol } };
		},
	);

	// --- A partir de aquí, todo requiere sesión del personal ---
	app.register(async (privado) => {
		privado.addHook("onRequest", privado.autenticar);

		privado.get("/auth/yo", async (request) => request.user);

		// Panel de pedidos
		privado.get("/admin/pedidos", async () => pedidosDelPanel());

		privado.patch("/admin/pedidos/:id", async (request) => {
			const { estado } = validar(esquemaEstado, request.body);
			return cambiarEstado(request.params.id, estado);
		});

		privado.get("/admin/cuentas", async (request) => listarCuentas(request.query.estado));
		privado.get("/admin/cuentas/:id", async (request, reply) => {
			const cuenta = await obtenerCuenta(request.params.id);
			if (!cuenta) return reply.code(404).send({ error: "Cuenta no encontrada" });
			return cuenta;
		});
		privado.post("/admin/cuentas/:id/cobrar", async (request) =>
			cobrarCuenta(request.params.id, request.body, request.user));
		privado.post("/admin/pedidos/:id/cobrar", async (request) => {
			const id = await cobrarPedido(request.params.id, request.body);
			return obtenerPedidoPorId(id);
		});
		privado.get("/admin/pendientes-cobro", async () => pendientesDeCobro());

		privado.get("/admin/cierres/:fecha", async (request, reply) => {
			reply.header("Cache-Control", "no-store");
			return consultarCierre(request.params.fecha, request.query);
		});
		privado.get("/admin/cierres/:fecha/csv", async (request, reply) => {
			const datos = await consultarCierre(request.params.fecha, request.query);
			return reply.header("Cache-Control", "no-store")
				.type("text/csv; charset=utf-8")
				.header("Content-Disposition", `attachment; filename="cierre-${datos.resumen.fecha}.csv"`)
				.send(csvCierre(datos));
		});

		privado.get("/admin/stream", async (request, reply) => {
			const raw = abrirSSE(request, reply);
			suscribirPanel(raw);
		});

		// Llamadas desde las mesas
		privado.get("/admin/llamadas", async () => {
			const { rows } = await query(
				`SELECT l.id, l.mesa_numero, m.nombre AS mesa_nombre, l.motivo, l.atendida, l.created_at
				 FROM llamadas_mesa l
				 LEFT JOIN mesas m ON m.numero = l.mesa_numero
				 WHERE NOT l.atendida ORDER BY l.created_at`,
			);
			return rows;
		});

		privado.patch("/admin/llamadas/:id", async (request, reply) => {
			const { rowCount } = await query("UPDATE llamadas_mesa SET atendida = true WHERE id = $1", [
				Number(request.params.id),
			]);
			if (!rowCount) return reply.code(404).send({ error: "Llamada no encontrada" });
			return { ok: true };
		});

		// Mesas (activas e inactivas) con cuántos pedidos tienen en curso
		privado.get("/admin/mesas", async () => {
			const { rows } = await query(
				`SELECT m.numero, m.nombre, m.token, m.activa,
				        (SELECT count(*)::int FROM pedidos p
				         WHERE p.mesa_numero = m.numero AND p.estado IN ('nuevo','preparando','listo')) AS pedidos_en_curso
				 FROM mesas m ORDER BY m.numero`,
			);
			return rows;
		});

		// Nuevo código para el QR de una mesa: el impreso anterior deja de funcionar
		privado.post("/admin/mesas/:numero/regenerar", async (request, reply) => {
			const { rows } = await query(
				"UPDATE mesas SET token = nuevo_token_mesa() WHERE numero = $1 RETURNING numero, nombre, token",
				[Number(request.params.numero)],
			);
			if (!rows[0]) return reply.code(404).send({ error: "Mesa no encontrada" });
			return rows[0];
		});

		// Disponibilidad rápida (agotado / disponible): la puede tocar cualquiera del personal
		privado.patch("/admin/productos/:id/disponible", async (request, reply) => {
			const disponible = Boolean(request.body?.disponible);
			const { rows } = await query(
				"UPDATE productos SET disponible = $2 WHERE id = $1 RETURNING id, disponible",
				[request.params.id, disponible],
			);
			if (!rows[0]) return reply.code(404).send({ error: "Producto no encontrado" });
			return rows[0];
		});

		privado.get("/admin/productos", async () => {
			const { rows } = await query(
				`SELECT id, nombre, descripcion, precio, categoria, valoracion, imagen_url,
				        sin_gluten, alergenos, disponible, orden, stock, stock_minimo, codigo_tpv
				 FROM productos WHERE activo ORDER BY categoria, orden, nombre`,
			);
			return rows;
		});

		// --- Gestión de la carta: solo administradores ---
		privado.register(async (admin) => {
			admin.addHook("onRequest", admin.soloAdmin);

			admin.post("/admin/cuentas/:id/anular", async (request) =>
				anularCuenta(request.params.id, request.body, request.user));

			admin.patch("/admin/negocio/cierre", async (request) => configurarCierre(request.body, request.user));
			admin.post("/admin/cierres", async (request, reply) => {
				const { fecha, forzar } = validar(esquemaGuardarCierre, request.body);
				const datos = await guardarCierre(fecha, { usuario: request.user, forzar });
				return reply.code(datos.creado ? 201 : 200).send(datos);
			});

			// Estado de la conexión con la caja y sincronización manual
			admin.get("/admin/tpv", async () => estadoTpv());
			admin.post("/admin/tpv/sincronizar", async (request, reply) => {
				try {
					return await sincronizarAhora();
				} catch (err) {
					return reply.code(409).send({ error: err.message });
				}
			});

			// Gestión temporal de cuentas del personal
			admin.get("/admin/staff", async () => {
				const { rows } = await query(
					`SELECT id, email, nombre, rol, activo, created_at
					 FROM staff ORDER BY activo DESC, nombre, email`,
				);
				return rows;
			});

			admin.post("/admin/staff", async (request, reply) => {
				const datos = validar(esquemaStaffNuevo, request.body);
				const passwordHash = await bcrypt.hash(datos.password, 12);
				const { rows } = await query(
					`INSERT INTO staff (email, nombre, password_hash, rol)
					 VALUES ($1, $2, $3, $4)
					 RETURNING id, email, nombre, rol, activo, created_at`,
					[datos.email, datos.nombre, passwordHash, datos.rol],
				);
				return reply.code(201).send(rows[0]);
			});

			admin.put("/admin/staff/:id", async (request, reply) => {
				const datos = validar(esquemaStaffCambio, request.body);
				if (request.params.id === String(request.user.sub) && (!datos.activo || datos.rol !== "admin")) {
					return reply.code(400).send({ error: "No puedes desactivar ni retirar tu propio rol de administrador" });
				}
				const parametros = [request.params.id, datos.email, datos.nombre, datos.rol, datos.activo];
				const passwordSql = datos.password ? ", password_hash = $6" : "";
				if (datos.password) parametros.push(await bcrypt.hash(datos.password, 12));
				const { rows } = await query(
					`UPDATE staff
					 SET email = $2, nombre = $3, rol = $4, activo = $5${passwordSql}
					 WHERE id = $1
					 RETURNING id, email, nombre, rol, activo, created_at`,
					parametros,
				);
				if (!rows[0]) return reply.code(404).send({ error: "Usuario no encontrado" });
				return rows[0];
			});

			admin.delete("/admin/staff/:id", async (request, reply) => {
				if (request.params.id === request.user.sub) {
					return reply.code(400).send({ error: "No puedes desactivar tu propio usuario" });
				}
				const { rows } = await query(
					"UPDATE staff SET activo = false WHERE id = $1 RETURNING id",
					[request.params.id],
				);
				if (!rows[0]) return reply.code(404).send({ error: "Usuario no encontrado" });
				return reply.code(204).send();
			});

			// Añadir una mesa (número libre siguiente si no se indica). Si existía desactivada, se reactiva.
			admin.post("/admin/mesas", async (request, reply) => {
				const { numero, nombre } = validar(esquemaMesaNueva, request.body);
				const { rows } = await query(
					`INSERT INTO mesas (numero, nombre)
					 VALUES (COALESCE($1, (SELECT COALESCE(max(numero), 0) + 1 FROM mesas)), $2)
					 ON CONFLICT (numero) DO UPDATE
					   SET activa = true, nombre = COALESCE(NULLIF($2, ''), mesas.nombre)
					 RETURNING numero, nombre, token, activa`,
					[numero ?? null, nombre ?? ""],
				);
				const mesa = rows[0];
				if (!mesa.nombre) {
					await query("UPDATE mesas SET nombre = $2 WHERE numero = $1", [mesa.numero, `Mesa ${mesa.numero}`]);
					mesa.nombre = `Mesa ${mesa.numero}`;
				}
				return reply.code(201).send({ ...mesa, pedidos_en_curso: 0 });
			});

			// Renombrar o activar/desactivar una mesa
			admin.patch("/admin/mesas/:numero", async (request, reply) => {
				const numero = Number(request.params.numero);
				const cambios = validar(esquemaMesaCambio, request.body);
				if (cambios.activa === false) {
					const { rows: enCurso } = await query(
						`SELECT count(*)::int AS n FROM pedidos
						 WHERE mesa_numero = $1 AND estado IN ('nuevo','preparando','listo')`,
						[numero],
					);
					if (enCurso[0].n > 0) {
						return reply.code(409).send({
							error: `La mesa ${numero} tiene ${enCurso[0].n} pedido(s) en curso. Entrégalos antes de desactivarla.`,
						});
					}
				}
				const { rows } = await query(
					`UPDATE mesas SET nombre = COALESCE($2, nombre), activa = COALESCE($3, activa)
					 WHERE numero = $1 RETURNING numero, nombre, token, activa`,
					[numero, cambios.nombre ?? null, cambios.activa ?? null],
				);
				if (!rows[0]) return reply.code(404).send({ error: "Mesa no encontrada" });
				return { ...rows[0], pedidos_en_curso: 0 };
			});

			// Moderación de opiniones
			admin.get("/admin/opiniones", async (request) => {
				const estado = ["pendiente", "publicada", "oculta"].includes(request.query.estado) ? request.query.estado : "pendiente";
				const { rows } = await query(
					`SELECT id, nombre, puntuacion, comentario, verificada, estado, pedido_codigo, created_at
					 FROM opiniones WHERE estado = $1 ORDER BY created_at DESC LIMIT 200`,
					[estado],
				);
				const { rows: cuentas } = await query("SELECT estado, count(*)::int AS n FROM opiniones GROUP BY estado");
				return { opiniones: rows, cuentas: Object.fromEntries(cuentas.map((c) => [c.estado, c.n])) };
			});

			admin.patch("/admin/opiniones/:id", async (request, reply) => {
				const { estado } = validar(esquemaEstadoOpinion, request.body);
				const { rows } = await query(
					"UPDATE opiniones SET estado = $2, revisada_at = now() WHERE id = $1 RETURNING id, estado",
					[Number(request.params.id), estado],
				);
				if (!rows[0]) return reply.code(404).send({ error: "Opinión no encontrada" });
				return rows[0];
			});

			admin.put("/admin/negocio", async (request) => {
				const datos = validar(esquemaNegocio, request.body);
				if (!Object.hasOwn(request.body, "cierre_incluye_listos")) delete datos.cierre_incluye_listos;
				const { rows } = await query(
					"UPDATE negocio SET datos = datos || $1::jsonb WHERE id = 1 RETURNING datos, updated_at",
					[datos],
				);
				return { ...rows[0].datos, actualizado: rows[0].updated_at };
			});

			admin.post("/admin/productos", async (request, reply) => {
				const p = validar(esquemaProducto, request.body);
				const { rows } = await query(
					`INSERT INTO productos (nombre, descripcion, precio, categoria, valoracion, imagen_url,
					                       sin_gluten, alergenos, disponible, orden, stock, stock_minimo, codigo_tpv)
					 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
					[p.nombre, p.descripcion, p.precio, p.categoria, p.valoracion, p.imagen_url,
						p.sin_gluten, p.alergenos, p.disponible, p.orden, p.stock, p.stock_minimo, p.codigo_tpv],
				);
				return reply.code(201).send(rows[0]);
			});

			admin.put("/admin/productos/:id", async (request, reply) => {
				const p = validar(esquemaProducto, request.body);
				const { rows } = await query(
					`UPDATE productos SET nombre=$2, descripcion=$3, precio=$4, categoria=$5, valoracion=$6,
					        imagen_url=$7, sin_gluten=$8, alergenos=$9, disponible=$10, orden=$11,
					        stock=$12, stock_minimo=$13, codigo_tpv=$14
					 WHERE id = $1 AND activo RETURNING *`,
					[request.params.id, p.nombre, p.descripcion, p.precio, p.categoria, p.valoracion,
						p.imagen_url, p.sin_gluten, p.alergenos, p.disponible, p.orden,
						p.stock, p.stock_minimo, p.codigo_tpv],
				);
				if (!rows[0]) return reply.code(404).send({ error: "Producto no encontrado" });
				return rows[0];
			});

			// Borrado lógico: los pedidos antiguos conservan la referencia
			admin.delete("/admin/productos/:id", async (request, reply) => {
				const { rowCount } = await query("UPDATE productos SET activo = false WHERE id = $1", [
					request.params.id,
				]);
				if (!rowCount) return reply.code(404).send({ error: "Producto no encontrado" });
				return reply.code(204).send();
			});

			admin.post("/admin/imagenes", async (request, reply) => {
				const archivo = await request.file();
				if (!archivo) return reply.code(400).send({ error: "No se recibió ninguna imagen" });
				const ext = EXTENSIONES[archivo.mimetype];
				if (!ext) {
					archivo.file.resume();
					return reply.code(400).send({ error: "Formato no admitido (usa JPG, PNG o WebP)" });
				}
				await mkdir(config.uploadsDir, { recursive: true });
				const nombre = `${randomUUID()}${ext}`;
				const destino = path.join(config.uploadsDir, nombre);
				await pipeline(archivo.file, createWriteStream(destino));
				if (archivo.file.truncated) {
					await unlink(destino).catch(() => {});
					return reply.code(413).send({ error: "La imagen supera los 5 MB" });
				}
				return reply.code(201).send({ url: `${config.urlPublica}/uploads/${nombre}` });
			});
		});
	});
}
