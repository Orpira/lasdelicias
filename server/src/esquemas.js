import { z } from "zod";

const telefono = z
	.string()
	.transform((t) => t.replace(/[\s().-]/g, ""))
	.pipe(z.string().regex(/^\+?\d{9,15}$/, "Teléfono no válido"));

export const CATEGORIAS = ["Desayunos", "Almuerzos", "Comida casera", "Pastelería", "Bebidas"];
export const ESTADOS = ["nuevo", "preparando", "listo", "entregado", "cancelado"];

const ahora = () => Date.now();

export const esquemaNuevoPedido = z
	.object({
		items: z
			.array(z.object({ producto_id: z.uuid(), cantidad: z.number().int().min(1).max(50) }))
			.min(1, "El pedido está vacío")
			.max(40),
		nombre: z.string().trim().min(1, "Falta el nombre").max(60),
		telefono: telefono.optional(),
		tipo: z.enum(["mesa", "recoger"]),
		mesa_token: z.string().regex(/^[a-f0-9]{16}$/, "Código de mesa no válido").optional(),
		dispositivo: z.string().regex(/^[a-zA-Z0-9-]{8,64}$/).optional(),
		hora_recogida: z.iso.datetime({ offset: true }).optional(),
		notas: z.string().trim().max(300).optional(),
	})
	.superRefine((p, ctx) => {
		if (p.tipo === "mesa" && !p.mesa_token) {
			ctx.addIssue({ code: "custom", path: ["mesa_token"], message: "Escanea el QR de tu mesa para pedir desde ella" });
		}
		if (p.tipo === "recoger") {
			if (!p.telefono) {
				ctx.addIssue({ code: "custom", path: ["telefono"], message: "Necesitamos tu teléfono para avisarte" });
			}
			if (p.hora_recogida) {
				const t = Date.parse(p.hora_recogida);
				if (t < ahora() - 5 * 60_000 || t > ahora() + 48 * 3_600_000) {
					ctx.addIssue({ code: "custom", path: ["hora_recogida"], message: "La hora de recogida debe ser en las próximas 48 h" });
				}
			}
		}
	});

// Pedidos que crea n8n (agente de WhatsApp): mismo formato, tipo "whatsapp"
export const esquemaPedidoN8n = z.object({
	items: z
		.array(z.object({ producto_id: z.uuid(), cantidad: z.number().int().min(1).max(50) }))
		.min(1)
		.max(40),
	nombre: z.string().trim().min(1).max(60),
	telefono,
	hora_recogida: z.iso.datetime({ offset: true }).optional(),
	notas: z.string().trim().max(300).optional(),
});

export const esquemaEstado = z.object({ estado: z.enum(ESTADOS) });

export const esquemaIdCuenta = z.string({ error: "Cuenta no válida" }).refine(
	(valor) => /^[1-9]\d{0,18}$/.test(valor) && BigInt(valor) <= 9223372036854775807n,
	"Cuenta no válida",
);
export const esquemaIdPedido = z.uuid({ error: "Pedido no válido" });
export const esquemaCobro = z.object({
	metodo_pago: z.enum(["efectivo", "tarjeta", "bizum", "otro"], { error: "Elige un método de pago válido" }),
	forzar: z.boolean({ error: "La confirmación de entrega debe ser verdadera o falsa" }).default(false),
}, { error: "Indica los datos del cobro" });
export const esquemaAnularCuenta = z.object({
	motivo: z.string({ error: "Indica el motivo de la anulación" }).trim().min(1, "Indica el motivo de la anulación").max(300, "El motivo no puede superar los 300 caracteres"),
}, { error: "Indica el motivo de la anulación" });
export const esquemaListadoCuentas = z.object({
	estado: z.enum(["abierta", "cobrada", "anulada"], { error: "Estado de cuenta no válido" }).default("abierta"),
});
export const esquemaInicioStreamMesa = z.object({
	desde: z.iso.datetime({ offset: true, error: "La fecha de conexión no es válida" }).optional(),
	cuenta: esquemaIdCuenta.optional(),
});

export const esquemaLogin = z.object({
	email: z.email().transform((e) => e.toLowerCase()),
	password: z.string().min(1).max(200),
});

export const esquemaProducto = z.object({
	nombre: z.string().trim().min(1).max(80),
	descripcion: z.string().trim().max(300).default(""),
	precio: z.number().min(0).max(1000),
	categoria: z.enum(CATEGORIAS),
	valoracion: z.number().int().min(1).max(5).default(5),
	imagen_url: z.string().trim().max(500).default(""),
	sin_gluten: z.boolean().default(false),
	alergenos: z.array(z.string().trim().min(1).max(40)).max(14).default([]),
	disponible: z.boolean().default(true),
	orden: z.number().int().default(0),
	// null = sin control de unidades
	stock: z.number().int().min(0).max(100000).nullable().default(null),
	stock_minimo: z.number().int().min(0).max(100000).default(0),
	codigo_tpv: z
		.string()
		.trim()
		.max(64)
		.nullable()
		.default(null)
		.transform((c) => c || null),
});

// Stock enviado por n8n desde la caja: [{ codigo_tpv, stock }]
export const esquemaStockExterno = z.object({
	origen: z.string().trim().min(1).max(30).default("n8n"),
	articulos: z
		.array(z.object({ codigo_tpv: z.string().trim().min(1).max(64), stock: z.number().min(0) }))
		.min(1)
		.max(5000),
});

const dia = z.string().trim().max(40).nullable();
export const esquemaNegocio = z.object({
	nombre: z.string().trim().min(1).max(80),
	titular: z.string().trim().min(1).max(160).nullable().optional(),
	nif: z.string().trim().min(1).max(30).nullable().optional(),
	email_contacto: z.email().max(254).nullable().optional(),
	conservacion_meses: z.number().int().min(1).max(60).nullable().optional(),
	lema: z.string().trim().max(80).default(""),
	descripcion: z.string().trim().max(600).default(""),
	direccion: z.string().trim().max(150),
	referencia: z.string().trim().max(150).default(""),
	telefono: z.string().trim().max(20),
	whatsapp: z.string().trim().max(20).default(""),
	instagram: z.string().trim().max(40).default(""),
	servicios: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
	horario: z.object({
		lunes: dia, martes: dia, miercoles: dia, jueves: dia, viernes: dia, sabado: dia, domingo: dia,
	}),
	// Fichas externas donde también se puede opinar (Páginas Amarillas, Google…)
	resenas_externas: z
		.array(z.object({ sitio: z.string().trim().min(1).max(40), url: z.url() }))
		.max(5)
		.default([]),
});

export const esquemaOpinion = z.object({
	nombre: z.string().trim().min(1, "Escribe tu nombre").max(40),
	puntuacion: z.number().int().min(1, "Elige de 1 a 5 estrellas").max(5),
	comentario: z.string().trim().max(500, "Máximo 500 caracteres").default(""),
	pedido_codigo: z.string().regex(/^[a-z0-9]{10}$/).optional(),
	web: z.string().optional(), // campo trampa para bots: las personas no lo ven
});

export const esquemaEstadoOpinion = z.object({ estado: z.enum(["publicada", "oculta"]) });

export const esquemaMesaNueva = z.object({
	numero: z.number().int().min(1).max(999).optional(),
	nombre: z.string().trim().max(40).optional(),
});

export const esquemaMesaCambio = z
	.object({
		nombre: z.string().trim().min(1, "El nombre no puede estar vacío").max(40).optional(),
		activa: z.boolean().optional(),
	})
	.refine((c) => c.nombre !== undefined || c.activa !== undefined, "No hay cambios");

export const esquemaLlamada = z.object({ motivo: z.enum(["atencion", "cuenta"]).default("atencion") });

export const esquemaDispositivo = z.object({ dispositivo: z.string().regex(/^[a-zA-Z0-9-]{8,64}$/) });
export const tokenMesa = (t) => /^[a-f0-9]{16}$/.test(String(t));

/** Valida y lanza un 400 con el primer mensaje legible si falla. */
export function validar(esquema, datos) {
	const r = esquema.safeParse(datos ?? {});
	if (!r.success) {
		const primero = r.error.issues[0];
		const err = new Error(primero?.message ?? "Datos no válidos");
		err.statusCode = 400;
		err.detalles = r.error.issues.map((i) => ({ campo: i.path.join("."), mensaje: i.message }));
		throw err;
	}
	return r.data;
}
