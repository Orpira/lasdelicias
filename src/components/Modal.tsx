import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export default function Modal({ titulo, alCerrar, bloqueado = false, children }: {
	titulo: string;
	alCerrar: () => void;
	bloqueado?: boolean;
	children: ReactNode;
}) {
	const ventana = useRef<HTMLDialogElement>(null);
	const identificador = useId();
	useEffect(() => {
		const dialogo = ventana.current;
		if (!dialogo) return;
		dialogo.showModal();
		return () => dialogo.close();
	}, []);

	return (
		<dialog ref={ventana} aria-labelledby={identificador}
			onCancel={(evento) => { evento.preventDefault(); if (!bloqueado) alCerrar(); }}
			className="m-auto w-[calc(100%_-_2rem)] max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-0 text-tinta shadow-2xl backdrop:bg-tinta/60">
			<header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-white px-5 py-4">
				<h2 id={identificador} className="min-w-0 break-words text-xl font-extrabold tracking-titular">{titulo}</h2>
				<button type="button" onClick={alCerrar} disabled={bloqueado} aria-label="Cerrar"
					className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-merengue text-delicias hover:bg-delicias-claro disabled:opacity-50">
					<X className="h-5 w-5" aria-hidden="true" />
				</button>
			</header>
			<div className="p-5">{children}</div>
		</dialog>
	);
}
