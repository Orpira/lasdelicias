import React, { useEffect, useState } from "react";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
	collection,
	addDoc,
	updateDoc,
	deleteDoc,
	doc,
	getDocs,
} from "firebase/firestore";
import { db } from "../firebase/firebase";

interface Producto {
	id?: string;
	nombre: string;
	descripcion: string;
	precio: number;
	categoria: "Desayunos" | "Almuerzos" | "Pastelería" | "Bebidas";
	valoracion: number;
	imagen: string;
}

const categorias = [
	{ nombre: "Desayunos", emoji: "🥐" },
	{ nombre: "Almuerzos", emoji: "🍽️" },
	{ nombre: "Pastelería", emoji: "🧁" },
	{ nombre: "Bebidas", emoji: "☕" },
];

const ADMIN_PASSWORD = "admin123";

export default function AdminProductos() {
	const [productos, setProductos] = useState<Producto[]>([]);
	const [form, setForm] = useState<Producto>({
		nombre: "",
		descripcion: "",
		precio: 0,
		categoria: "Desayunos",
		valoracion: 1,
		imagen: "",
	});
	const [fileImg, setFileImg] = useState<File | null>(null);
	const [previewImg, setPreviewImg] = useState<string>("");
	const [editId, setEditId] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		const fetchProductos = async () => {
			const querySnapshot = await getDocs(collection(db, "productos"));
			const data: Producto[] = querySnapshot.docs.map((doc) => ({
				id: doc.id,
				...doc.data(),
			})) as Producto[];
			setProductos(data);
		};
		fetchProductos();
	}, []);

	const handleChange = (
		e: React.ChangeEvent<
			HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
		>
	) => {
		const { name, value, type, files } = e.target as HTMLInputElement;
		if (type === "file" && files && files[0]) {
			setFileImg(files[0]);
			setPreviewImg(URL.createObjectURL(files[0]));
		} else {
			setForm((prev) => ({
				...prev,
				[name]:
					name === "precio" || name === "valoracion" ? Number(value) : value,
			}));
			if (name === "imagen") {
				setPreviewImg(value);
			}
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		try {
			let imageUrl = form.imagen;
			if (fileImg) {
				const storage = getStorage();
				const storageRef = ref(
					storage,
					`productos/${Date.now()}_${fileImg.name}`
				);
				await uploadBytes(storageRef, fileImg);
				imageUrl = await getDownloadURL(storageRef);
			}
			const { nombre, descripcion, precio, categoria, valoracion } = form;
			const data = {
				nombre,
				descripcion,
				precio,
				categoria,
				valoracion,
				imagen: imageUrl,
			};
			if (editId) {
				await updateDoc(doc(db, "productos", editId), data);
			} else {
				await addDoc(collection(db, "productos"), data);
			}
			setForm({
				nombre: "",
				descripcion: "",
				precio: 0,
				categoria: "Desayunos",
				valoracion: 1,
				imagen: "",
			});
			setFileImg(null);
			setPreviewImg("");
			setEditId(null);
			const querySnapshot = await getDocs(collection(db, "productos"));
			const dataProductos: Producto[] = querySnapshot.docs.map((doc) => ({
				id: doc.id,
				...doc.data(),
			})) as Producto[];
			setProductos(dataProductos);
		} catch (err) {
			alert("Error al guardar producto");
		}
		setLoading(false);
	};

	const handleEdit = (prod: Producto) => {
		setForm({ ...prod });
		setEditId(prod.id || null);
	};

	const handleDelete = async (id: string) => {
		if (window.confirm("¿Seguro que deseas eliminar este producto?")) {
			await deleteDoc(doc(db, "productos", id));
			const querySnapshot = await getDocs(collection(db, "productos"));
			const dataProductos: Producto[] = querySnapshot.docs.map((doc) => ({
				id: doc.id,
				...doc.data(),
			})) as Producto[];
			setProductos(dataProductos);
			if (editId === id) {
				setEditId(null);
				setForm({
					nombre: "",
					descripcion: "",
					precio: 0,
					categoria: "Desayunos",
					valoracion: 1,
					imagen: "",
				});
			}
		}
	};

	const [autenticado, setAutenticado] = useState(false);
	const [inputPassword, setInputPassword] = useState("");
	const [errorLogin, setErrorLogin] = useState("");

	return !autenticado ? (
		<div className="max-w-sm mx-auto mt-20 p-6 bg-white rounded shadow flex flex-col items-center">
			<h2 className="text-2xl font-bold mb-4 text-pink-700">
				Acceso Administrador
			</h2>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					if (inputPassword === ADMIN_PASSWORD) {
						setAutenticado(true);
						setErrorLogin("");
					} else {
						setErrorLogin("Contraseña incorrecta");
					}
				}}
				className="flex flex-col gap-3 w-full"
			>
				<input
					type="password"
					value={inputPassword}
					onChange={(e) => setInputPassword(e.target.value)}
					placeholder="Contraseña de administrador"
					className="border rounded px-3 py-2"
					required
				/>
				{errorLogin && (
					<span className="text-xs text-red-500">{errorLogin}</span>
				)}
				<button
					type="submit"
					className="bg-pink-600 text-white px-4 py-2 rounded font-bold hover:bg-pink-700 transition"
				>
					Ingresar
				</button>
			</form>
		</div>
	) : (
		<div className="max-w-2xl mx-auto p-6 bg-white rounded shadow mt-10">
			<h2 className="text-2xl font-bold mb-4 text-pink-700">
				Administrar Productos
			</h2>
			<form onSubmit={handleSubmit} className="mb-6 flex flex-col gap-3">
				<input
					name="nombre"
					value={form.nombre}
					onChange={handleChange}
					placeholder="Ej: Medialuna de manteca"
					className="border rounded px-3 py-2"
					required
				/>
				<textarea
					name="descripcion"
					value={form.descripcion}
					onChange={handleChange}
					placeholder="Ej: Masa suave y hojaldrada, ideal para desayunos."
					className="border rounded px-3 py-2"
					required
				/>
				<div className="flex flex-col">
					<input
						name="precio"
						type="number"
						min={0}
						value={form.precio}
						onChange={handleChange}
						placeholder="Ej: 1.50"
						className="border rounded px-3 py-2"
						required
					/>
					<span className="text-xs text-gray-500 mt-1">
						Precio en euros (€) del producto.
					</span>
				</div>
				<select
					name="categoria"
					value={form.categoria}
					onChange={handleChange}
					className="border rounded px-3 py-2"
				>
					<option value="" disabled>
						Selecciona una categoría
					</option>
					{categorias.map((cat) => (
						<option key={cat.nombre} value={cat.nombre}>
							{cat.emoji} {cat.nombre}
						</option>
					))}
				</select>
				<div className="flex flex-col">
					<input
						name="valoracion"
						type="number"
						min={1}
						max={5}
						value={form.valoracion}
						onChange={handleChange}
						placeholder="Ej: 5 (máxima valoración)"
						className="border rounded px-3 py-2"
						required
					/>
					<span className="text-xs text-gray-500 mt-1">
						Valoración del producto (1 = baja, 5 = excelente).
					</span>
				</div>
				<input
					name="imagen"
					value={form.imagen}
					onChange={handleChange}
					placeholder="Ej: /images/medialuna.jpg o https://... (opcional si subes archivo)"
					className="border rounded px-3 py-2"
				/>
				<input
					type="file"
					accept="image/*"
					onChange={handleChange}
					className="border rounded px-3 py-2"
					placeholder="Selecciona una imagen desde tu dispositivo"
				/>
				{previewImg && (
					<div className="flex flex-col items-center mt-2">
						<span className="text-xs text-gray-500 mb-1">Vista previa:</span>
						<img
							src={previewImg}
							alt="preview"
							className="w-24 h-24 object-cover rounded shadow"
						/>
					</div>
				)}
				<button
					type="submit"
					disabled={loading}
					className="bg-pink-600 text-white px-4 py-2 rounded font-bold hover:bg-pink-700 transition"
				>
					{editId ? "Guardar cambios" : "Agregar producto"}
				</button>
				{editId && (
					<button
						type="button"
						onClick={() => {
							setEditId(null);
							setForm({
								nombre: "",
								descripcion: "",
								precio: 0,
								categoria: "Desayunos",
								valoracion: 1,
								imagen: "",
							});
						}}
						className="bg-gray-200 text-pink-700 px-4 py-2 rounded font-bold hover:bg-gray-300 transition mt-2"
					>
						Cancelar edición
					</button>
				)}
			</form>
			<ul className="divide-y">
				{productos.map((prod) => (
					<li
						key={prod.id}
						className="py-3 flex flex-col sm:flex-row sm:items-center gap-2"
					>
						<div className="flex-1">
							<span className="font-bold text-pink-700">{prod.nombre}</span>{" "}
							<span className="text-xs text-gray-500">({prod.categoria})</span>
							<div className="text-sm text-gray-600">{prod.descripcion}</div>
							<div className="text-sm">
								Precio: €{prod.precio.toFixed(2)} | Valoración:{" "}
								{prod.valoracion} |{" "}
								<img
									src={prod.imagen}
									alt="img"
									className="inline-block w-10 h-10 object-cover rounded"
								/>
							</div>
						</div>
						<div className="flex gap-2">
							<button
								onClick={() => handleEdit(prod)}
								className="bg-yellow-200 text-yellow-800 px-3 py-1 rounded font-bold hover:bg-yellow-300 transition"
							>
								Editar
							</button>
							<button
								onClick={() => handleDelete(prod.id!)}
								className="bg-red-200 text-red-800 px-3 py-1 rounded font-bold hover:bg-red-300 transition"
							>
								Eliminar
							</button>
						</div>
					</li>
				))}
			</ul>
		</div>
	);
}
