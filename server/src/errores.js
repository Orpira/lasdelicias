export class ErrorOperacion extends Error {
	constructor(mensaje, statusCode = 400) {
		super(mensaje);
		this.statusCode = statusCode;
	}
}
