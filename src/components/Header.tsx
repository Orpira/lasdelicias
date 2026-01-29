<header>
	{/* Contenedor principal en fila */}
	<div className="bg-gray-800 text-slate-700 flex items-center justify-between w-full">
		{/* Bloque de texto (título + párrafo) */}
		<div className="flex flex-col w-full">
			<h1 className="w-full sm:text-6xl  leading-tight text-white drop-shadow-lg pl-14">
				WebWiz Quiz
			</h1>

			<p className="w-full mt-1 text-xs sm:text-xl leading-tight text-slate-400 drop-shadow-lg pl-14">
				Domina la magia del código, un quiz a la vez.
			</p>
		</div>

		{/* Logo con marco ovalado dorado */}
		<div className="hidden sm:flex items-center justify-center mr-8">
			<div
				className="border-4 border-yellow-400 rounded-full p-2 bg-white flex items-center justify-center"
				style={{ width: "110px", height: "80px", borderRadius: "50%" }}
			>
				<img
					src="/logo.webp"
					alt="Logo Las Delicias"
					className="object-cover w-20 h-16 rounded-full"
				/>
			</div>
		</div>
	</div>
</header>;
