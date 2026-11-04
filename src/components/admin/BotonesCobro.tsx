import { Banknote, CreditCard, Ellipsis, Smartphone } from "lucide-react";
import { METODOS_PAGO } from "../../lib/cuentas";
import type { MetodoPago } from "../../types/producto";

const ICONOS = { efectivo: Banknote, tarjeta: CreditCard, bizum: Smartphone, otro: Ellipsis };

export default function BotonesCobro({ alCobrar, bloqueado = false, titulo = "Registrar cobro" }: {
	alCobrar: (metodo: MetodoPago) => void;
	bloqueado?: boolean;
	titulo?: string;
}) {
	return (
		<fieldset disabled={bloqueado} className="min-w-0">
			<legend className="mb-2 text-sm font-bold">{titulo}</legend>
			<div className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2">
				{METODOS_PAGO.map((metodo) => {
					const Icono = ICONOS[metodo.id];
					return (
						<button key={metodo.id} type="button" onClick={() => alCobrar(metodo.id)}
							aria-label={`${titulo} con ${metodo.nombre}`}
							className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-delicias px-3 py-3 font-bold text-white transition-colors hover:bg-delicias-oscuro disabled:opacity-50">
							<Icono className="h-4 w-4 shrink-0" aria-hidden="true" /> {metodo.nombre}
						</button>
					);
				})}
			</div>
		</fieldset>
	);
}
