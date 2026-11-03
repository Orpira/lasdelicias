export type Categoria = "Desayunos" | "Almuerzos" | "Comida casera" | "Pastelería" | "Bebidas";

export interface Producto {
	id: string;
	nombre: string;
	descripcion: string;
	precio: number;
	categoria: Categoria;
	valoracion: number;
	imagen_url: string;
	sin_gluten: boolean;
	alergenos: string[];
	disponible: boolean;
	orden?: number;
	/** null = sin control de unidades (solo en el panel) */
	stock?: number | null;
	stock_minimo?: number;
	/** Código del artículo en la caja (TPV) */
	codigo_tpv?: string | null;
	/** Pocas unidades: cuántas quedan (carta pública) */
	quedan?: number | null;
}

export const CATEGORIAS: { nombre: Categoria; emoji: string }[] = [
	{ nombre: "Desayunos", emoji: "🥐" },
	{ nombre: "Almuerzos", emoji: "🥪" },
	{ nombre: "Comida casera", emoji: "🍲" },
	{ nombre: "Pastelería", emoji: "🧁" },
	{ nombre: "Bebidas", emoji: "☕" },
];

export type EstadoPedido = "nuevo" | "preparando" | "listo" | "entregado" | "cancelado";

export interface LineaPedido {
	producto_id: string | null;
	nombre: string;
	categoria?: Categoria | null;
	precio_unitario: number;
	cantidad: number;
}

export interface Pedido {
	id?: string; // solo lo ve el personal
	telefono?: string; // solo lo ve el personal
	codigo: string;
	fecha: string;
	numero_dia: number;
	nombre_cliente: string;
	tipo: "mesa" | "recoger" | "whatsapp";
	mesa_numero: number | null;
	mesa_nombre?: string | null;
	mesa_anterior: number | null;
	cambio_mesa: "declarado" | "detectado" | null;
	hora_recogida: string | null;
	notas: string;
	estado: EstadoPedido;
	total: number;
	created_at: string;
	updated_at: string;
	items: LineaPedido[];
}

export interface LlamadaMesa {
	id: string;
	mesa_numero: number;
	mesa_nombre?: string | null;
	motivo: "atencion" | "cuenta";
	atendida: boolean;
	created_at: string;
}
