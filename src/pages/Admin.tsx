import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { House } from "lucide-react";
import { api, guardarToken, leerToken } from "../lib/api";
import PanelPedidos from "../components/admin/PanelPedidos";
import GestionCarta from "../components/admin/GestionCarta";
import QrMesas from "../components/admin/QrMesas";
import PantallaCocina from "../components/admin/PantallaCocina";
import ModeracionOpiniones from "../components/admin/ModeracionOpiniones";

export interface Usuario {
	sub?: string;
	id?: string;
	nombre: string;
	rol: "admin" | "barra";
}

// Cada pestaña tiene su dirección: /admin/barra, /admin/cocina, /admin/carta, /admin/mesas
const PESTANAS = ["barra", "cocina", "carta", "mesas", "opiniones"] as const;
type Pestana = (typeof PESTANAS)[number];
const esPestana = (p: unknown): p is Pestana => PESTANAS.includes(p as Pestana);

function pestanaRecordada(): Pestana {
	try {
		const p = localStorage.getItem("delicias.pestana");
		return esPestana(p) ? p : "barra";
	} catch {
		return "barra";
	}
}

export default function Admin() {
	const [usuario, setUsuario] = useState<Usuario | null>(null);
	const [comprobando, setComprobando] = useState(Boolean(leerToken()));
	const { pestana: enUrl } = useParams();
	const navigate = useNavigate();
	const pestana: Pestana = esPestana(enUrl) ? enUrl : "barra";
	const setPestana = (p: Pestana) => navigate(`/admin/${p}`);

	// Cada tablet recuerda su pantalla (la de cocina abre directamente en "Cocina")
	useEffect(() => {
		if (!esPestana(enUrl)) return;
		try {
			localStorage.setItem("delicias.pestana", enUrl);
		} catch {
			/* ignorar */
		}
	}, [enUrl]);

	useEffect(() => {
		if (!leerToken()) return;
		api<Usuario>("/auth/yo", { auth: true })
			.then(setUsuario)
			.catch(() => guardarToken(null))
			.finally(() => setComprobando(false));
	}, []);

	const salir = useCallback(() => {
		guardarToken(null);
		setUsuario(null);
	}, []);

	if (!enUrl) return <Navigate to={`/admin/${pestanaRecordada()}`} replace />;
	if (!esPestana(enUrl)) return <Navigate to="/admin/barra" replace />;
	if (comprobando) return <p className="text-center py-24 text-gray-500">Comprobando sesión…</p>;
	if (!usuario) return <Login alEntrar={setUsuario} />;

	const pestanas: { id: Pestana; texto: string }[] = [
		{ id: "barra", texto: "📋 Barra" },
		{ id: "cocina", texto: "👩‍🍳 Cocina" },
		{ id: "carta", texto: "🥐 Carta" },
		{ id: "mesas", texto: "🪑 QR de mesas" },
		...(usuario.rol === "admin" ? [{ id: "opiniones" as const, texto: "⭐ Opiniones" }] : []),
	];

	return (
		<div className="min-h-screen bg-gray-100 text-gray-800">
			<header className="bg-white shadow-sm print:hidden">
				<div className="max-w-[1600px] mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
					<Link to="/" title="Volver a la web" aria-label="Volver a la web"
						className="flex items-center gap-2 pr-3 mr-1 border-r border-gray-200">
						<img src="/logo-las-delicias.webp" alt="" className="h-9 w-auto rounded-md" />
						<House className="w-4 h-4 text-gray-500" aria-hidden="true" />
					</Link>
					<nav className="flex flex-wrap gap-2 flex-1">
						{pestanas.map((p) => (
							<button key={p.id} onClick={() => setPestana(p.id)}
								className={`px-4 py-2 rounded-lg font-bold ${pestana === p.id ? "bg-delicias text-white" : "bg-gray-100 hover:bg-gray-200"}`}>
								{p.texto}
							</button>
						))}
					</nav>
					<span className="text-sm text-gray-600">{usuario.nombre} · {usuario.rol === "admin" ? "Administración" : "Barra"}</span>
					<button onClick={salir} className="text-sm px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200">Salir</button>
				</div>
			</header>
			{pestana === "barra" && <PanelPedidos alCaducar={salir} />}
			{pestana === "cocina" && <PantallaCocina alCaducar={salir} />}
			{pestana === "carta" && <GestionCarta esAdmin={usuario.rol === "admin"} />}
			{pestana === "mesas" && <QrMesas esAdmin={usuario.rol === "admin"} />}
			{pestana === "opiniones" && usuario.rol === "admin" && <ModeracionOpiniones />}
		</div>
	);
}

function Login({ alEntrar }: { alEntrar: (u: Usuario) => void }) {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [enviando, setEnviando] = useState(false);

	async function entrar(e: FormEvent) {
		e.preventDefault();
		setError("");
		setEnviando(true);
		try {
			const r = await api<{ token: string; usuario: Usuario }>("/auth/login", {
				metodo: "POST",
				cuerpo: { email, password },
			});
			guardarToken(r.token);
			alEntrar(r.usuario);
		} catch (err) {
			setError(err instanceof Error ? err.message : "No se pudo entrar");
		} finally {
			setEnviando(false);
		}
	}

	return (
		<div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
			<form onSubmit={entrar} className="w-full max-w-sm bg-white rounded-2xl shadow p-6 flex flex-col gap-3 text-gray-800">
				<img src="/logo-las-delicias.webp" alt="Las Delicias" className="w-40 mx-auto rounded-lg mb-2" />
				<h1 className="text-xl font-bold text-center">Acceso del personal</h1>
				<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required
					autoComplete="username" className="border rounded-lg px-3 py-2 bg-white" />
				<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña" required
					autoComplete="current-password" className="border rounded-lg px-3 py-2 bg-white" />
				{error && <p className="text-sm text-red-600" role="alert">{error}</p>}
				<button disabled={enviando} className="py-3 rounded-xl bg-delicias text-white font-bold hover:bg-delicias-oscuro disabled:opacity-60">
					{enviando ? "Entrando…" : "Entrar"}
				</button>
				<Link to="/" className="mt-1 inline-flex items-center justify-center gap-2 text-sm font-semibold text-gray-600 hover:text-delicias">
					<House className="w-4 h-4" aria-hidden="true" /> Volver a la web
				</Link>
			</form>
		</div>
	);
}
