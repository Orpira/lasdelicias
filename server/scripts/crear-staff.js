// Crea o actualiza una cuenta del personal.
// Uso: npm run crear-staff -- <email> <nombre> <admin|barra>
// La contraseña se pide por la variable STAFF_PASSWORD para que no quede en el historial:
//   STAFF_PASSWORD='...' npm run crear-staff -- dueno@lasdelicias.es "Dueño" admin
import bcrypt from "bcryptjs";
import { pool } from "../src/db.js";

const [email, nombre, rol = "barra"] = process.argv.slice(2);
const password = process.env.STAFF_PASSWORD;

if (!email || !nombre || !["admin", "barra"].includes(rol) || !password) {
	console.error('Uso: STAFF_PASSWORD="..." npm run crear-staff -- <email> <nombre> <admin|barra>');
	process.exit(1);
}
if (password.length < 10) {
	console.error("La contraseña debe tener al menos 10 caracteres");
	process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
await pool.query(
	`INSERT INTO staff (email, nombre, password_hash, rol) VALUES ($1, $2, $3, $4)
	 ON CONFLICT (email) DO UPDATE SET nombre = EXCLUDED.nombre, password_hash = EXCLUDED.password_hash,
	                                   rol = EXCLUDED.rol, activo = true`,
	[email.toLowerCase(), nombre, hash, rol],
);
console.log(`Cuenta lista: ${email.toLowerCase()} (${rol})`);
await pool.end();
