export interface CifrasCierre {
	pedidos: number;
	importe: number;
}

export interface GrupoCierre extends CifrasCierre {
	nombre: string;
}

export type CriterioCierre = "cobrados" | "entregados" | "entregados_y_listos";

export interface DesgloseCierre extends CifrasCierre {
	pedidos: number;
}

export interface ResumenCierre {
	fecha: string;
	zona_horaria: string;
	criterio: { valor: CriterioCierre; descripcion: string };
	totales: CifrasCierre & { ticket_medio: number };
	cobro: {
		total_cobrado: number;
		por_metodo: (CifrasCierre & { metodo: "efectivo" | "tarjeta" | "bizum" | "otro" })[];
	};
	pendiente_cobro: {
		entregados_sin_cobrar: CifrasCierre;
		cuentas_abiertas: CifrasCierre;
	};
	anuladas: { cuentas: number; importe: number; detalle: { id: string; mesa_numero: number; importe: number; motivo: string | null }[] };
	cobrados: CifrasCierre;
	entregados_sin_cobrar: CifrasCierre;
	listos_sin_recoger: CifrasCierre;
	cancelados: CifrasCierre;
	en_curso: CifrasCierre;
	por_tipo: (GrupoCierre & { tipo: "mesa" | "recoger" | "whatsapp" })[];
	por_categoria: (GrupoCierre & { unidades: number })[];
	por_producto: (GrupoCierre & { producto_id: string | null; categoria: string; unidades: number })[];
	por_hora: (CifrasCierre & { hora: number })[];
}

export interface InformeCierre {
	resumen: ResumenCierre;
	guardado: boolean;
	cerrado_at: string | null;
	cerrado_por: string | null;
	origen: "personal" | "n8n" | null;
	criterio_configurado: CriterioCierre;
	hoy: string;
}
