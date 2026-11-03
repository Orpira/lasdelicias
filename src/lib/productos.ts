// Carta compartida entre la portada y la carta (una sola petición por visita)
import { useEffect, useState } from "react";
import { api } from "./api";
import type { Producto } from "../types/producto";

let cache: Promise<Producto[]> | null = null;

export function useProductos() {
	const [productos, setProductos] = useState<Producto[] | null>(null);
	const [error, setError] = useState("");
	useEffect(() => {
		cache ??= api<Producto[]>("/productos").catch((e) => {
			cache = null;
			throw e;
		});
		cache.then(setProductos).catch((e) => setError(e.message));
	}, []);
	return { productos, error };
}
