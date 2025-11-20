const { getPool, ensureDatabaseInitialized } = require('./src/db');
const { v4: uuidv4 } = require('uuid');

// Datos de ejemplo
const SUPPORT_TYPES = [
	'Hardware',
	'Software',
	'Red e Internet',
	'Acceso y Permisos',
	'Correo Electrónico',
	'Otro',
];

const PRIORITIES = [
	'Baja – No es urgente',
	'Media – Puede esperar unas horas',
	'Alta – Necesito ayuda pronto',
	'Crítica – Bloquea mi trabajo',
];

const STATUSES = ['Pendiente', 'En Proceso', 'Resuelto', 'Cerrado'];

const DEPARTMENTS = [
	'Recursos Humanos',
	'Contabilidad',
	'Ventas',
	'Marketing',
	'Operaciones',
	'IT',
	'Administración',
	'Logística',
	'Atención al Cliente',
	'Desarrollo',
];

const NAMES = [
	'Juan Pérez',
	'María García',
	'Carlos López',
	'Ana Martínez',
	'Luis Rodríguez',
	'Carmen Fernández',
	'José González',
	'Laura Sánchez',
	'Miguel Torres',
	'Isabel Ramírez',
	'Francisco Flores',
	'Patricia Díaz',
	'Antonio Morales',
	'Rosa Jiménez',
	'Manuel Ruiz',
];

const SUBJECTS = {
	'Hardware': [
		'Impresora no funciona',
		'Monitor parpadeando',
		'Teclado con teclas dañadas',
		'Mouse no responde',
		'Computadora muy lenta',
		'Disco duro con ruidos extraños',
		'Pantalla azul al iniciar',
		'Ventilador haciendo ruido',
	],
	'Software': [
		'Excel se cierra inesperadamente',
		'No puedo instalar programa',
		'Actualización de Windows fallida',
		'Antivirus bloqueando aplicación',
		'Navegador muy lento',
		'Error al abrir archivos PDF',
		'Aplicación no responde',
		'Licencia de Office expirada',
	],
	'Red e Internet': [
		'No tengo conexión a internet',
		'WiFi muy lenta',
		'No puedo acceder a carpetas compartidas',
		'VPN no conecta',
		'Página web no carga',
		'Conexión intermitente',
		'No puedo imprimir en red',
		'Error de DNS',
	],
	'Acceso y Permisos': [
		'No puedo acceder al sistema',
		'Olvidé mi contraseña',
		'Necesito permisos para carpeta',
		'Usuario bloqueado',
		'No tengo acceso a la aplicación',
		'Solicitud de nuevo usuario',
		'Cambio de permisos',
		'Acceso denegado a recurso',
	],
	'Correo Electrónico': [
		'No puedo enviar correos',
		'Buzón lleno',
		'Correos van a spam',
		'No recibo correos',
		'Error al configurar Outlook',
		'Firma de correo no aparece',
		'Problema con archivos adjuntos',
		'Correos duplicados',
	],
	'Otro': [
		'Consulta general',
		'Solicitud de información',
		'Problema no especificado',
		'Asesoría técnica',
		'Capacitación requerida',
		'Sugerencia de mejora',
	],
};

const DESCRIPTIONS = {
	'Hardware': [
		'La impresora no imprime desde hace dos días. Ya revisé que tenga papel y tinta.',
		'El monitor parpadea constantemente, especialmente cuando abro varias ventanas.',
		'Varias teclas del teclado no funcionan correctamente, necesito reemplazo.',
		'El mouse se desconecta aleatoriamente y tengo que reiniciar la computadora.',
		'Mi computadora tarda más de 10 minutos en iniciar y las aplicaciones van muy lentas.',
		'El disco duro hace ruidos extraños y a veces la computadora se congela.',
		'Al encender la computadora aparece una pantalla azul con un error.',
		'El ventilador de la computadora hace mucho ruido, parece que está forzado.',
	],
	'Software': [
		'Excel se cierra solo cuando trabajo con archivos grandes. Pierdo información.',
		'Necesito instalar un programa para mi trabajo pero me sale error de permisos.',
		'La actualización de Windows se quedó en 50% y no avanza desde ayer.',
		'El antivirus está bloqueando una aplicación que necesito para trabajar.',
		'Chrome va muy lento y se congela frecuentemente. Ya borré el caché.',
		'No puedo abrir archivos PDF, me sale un error de Adobe Reader.',
		'La aplicación de contabilidad no responde y tengo que cerrarla forzadamente.',
		'Mi licencia de Office expiró y no puedo editar documentos.',
	],
	'Red e Internet': [
		'No tengo conexión a internet desde esta mañana. Ya reinicié el router.',
		'La conexión WiFi es muy lenta, tarda mucho en cargar páginas.',
		'No puedo acceder a las carpetas compartidas del servidor.',
		'La VPN no conecta, me sale error de autenticación.',
		'No puedo acceder al sitio web de la empresa desde mi computadora.',
		'La conexión se cae cada 10 minutos aproximadamente.',
		'No puedo imprimir en la impresora de red, dice que está offline.',
		'Me sale error de DNS al intentar navegar.',
	],
	'Acceso y Permisos': [
		'No puedo iniciar sesión en el sistema, dice que mi usuario no existe.',
		'Olvidé mi contraseña y necesito restablecerla urgentemente.',
		'Necesito acceso a la carpeta de proyectos para revisar documentos.',
		'Mi usuario está bloqueado después de varios intentos fallidos.',
		'No tengo acceso a la aplicación de recursos humanos.',
		'Necesito crear un usuario nuevo para un empleado que acaba de ingresar.',
		'Requiero permisos de administrador para instalar software.',
		'Me sale acceso denegado al intentar abrir un archivo importante.',
	],
	'Correo Electrónico': [
		'No puedo enviar correos, se quedan en la bandeja de salida.',
		'Mi buzón está lleno y no puedo recibir más correos.',
		'Los correos que envío llegan a la carpeta de spam de los destinatarios.',
		'No estoy recibiendo correos desde hace dos días.',
		'No puedo configurar mi correo en Outlook, me sale error.',
		'Mi firma de correo no aparece en los mensajes que envío.',
		'No puedo adjuntar archivos grandes, me sale error.',
		'Recibo todos los correos duplicados.',
	],
	'Otro': [
		'Tengo una consulta sobre el uso del sistema.',
		'Necesito información sobre los procedimientos de TI.',
		'Tengo un problema que no sé cómo clasificar.',
		'Requiero asesoría técnica para un proyecto.',
		'Me gustaría recibir capacitación sobre las herramientas.',
		'Tengo una sugerencia para mejorar el sistema.',
	],
};

function generateReference() {
	const base = uuidv4().split('-')[0].toUpperCase();
	const now = new Date();
	const y = String(now.getFullYear()).slice(-2);
	const m = String(now.getMonth() + 1).padStart(2, '0');
	const d = String(now.getDate()).padStart(2, '0');
	return `T-${y}${m}${d}-${base}`;
}

function randomItem(array) {
	return array[Math.floor(Math.random() * array.length)];
}

function randomDate(daysAgo) {
	const now = new Date();
	const past = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
	const random = new Date(past.getTime() + Math.random() * (now.getTime() - past.getTime()));
	return random;
}

async function seedTickets(count = 30) {
	console.log('🌱 Iniciando seed de la base de datos...\n');
	
	try {
		// Inicializar base de datos
		await ensureDatabaseInitialized();
		console.log('✅ Base de datos inicializada\n');

		const pool = getPool();
		
		// Limpiar tickets existentes (opcional)
		const { rowCount } = await pool.query('SELECT COUNT(*) FROM tickets');
		if (rowCount > 0) {
			console.log(`⚠️  Ya existen ${rowCount} tickets en la base de datos`);
			console.log('   Agregando nuevos tickets...\n');
		}

		// Crear tickets
		console.log(`📝 Creando ${count} tickets de ejemplo...\n`);
		
		for (let i = 0; i < count; i++) {
			const supportType = randomItem(SUPPORT_TYPES);
			const priority = randomItem(PRIORITIES);
			const status = randomItem(STATUSES);
			const name = randomItem(NAMES);
			const department = randomItem(DEPARTMENTS);
			const subject = randomItem(SUBJECTS[supportType]);
			const description = randomItem(DESCRIPTIONS[supportType]);
			const hasAnydesk = Math.random() > 0.6;
			const anydeskCode = hasAnydesk ? `${Math.floor(100000000 + Math.random() * 900000000)}` : null;
			const createdAt = randomDate(30); // Últimos 30 días

			const reference = generateReference();
			const editToken = uuidv4();

			const query = `
				INSERT INTO tickets (
					reference, requester_name, department, support_type, priority, 
					subject, description, has_anydesk, anydesk_code, status, 
					edit_token, created_at, updated_at
				) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
				RETURNING id, reference, status, priority
			`;

			const values = [
				reference,
				name,
				department,
				supportType,
				priority,
				subject,
				description,
				hasAnydesk,
				anydeskCode,
				status,
				editToken,
				createdAt,
				createdAt,
			];

			const result = await pool.query(query, values);
			const ticket = result.rows[0];

			// Agregar algunos comentarios aleatorios
			if (Math.random() > 0.5) {
				const numComments = Math.floor(Math.random() * 3) + 1;
				for (let j = 0; j < numComments; j++) {
					const isInternal = Math.random() > 0.7;
					const commentAuthor = isInternal ? 'Admin' : randomItem(NAMES);
					const commentContent = isInternal 
						? 'Nota interna: Revisando el caso. Requiere seguimiento.'
						: 'Gracias por la actualización. Quedo atento a la solución.';
					
					const commentDate = new Date(createdAt.getTime() + (j + 1) * 60 * 60 * 1000);

					await pool.query(
						`INSERT INTO comments (ticket_id, author_name, content, is_internal, created_at)
						 VALUES ($1, $2, $3, $4, $5)`,
						[ticket.id, commentAuthor, commentContent, isInternal, commentDate]
					);
				}
			}

			console.log(`   ✓ Ticket ${i + 1}/${count}: ${ticket.reference} - ${ticket.status} - ${ticket.priority}`);
		}

		console.log('\n✅ Seed completado exitosamente!');
		console.log(`\n📊 Resumen:`);
		
		const stats = await pool.query(`
			SELECT 
				status,
				COUNT(*) as count
			FROM tickets
			GROUP BY status
			ORDER BY status
		`);

		console.log('\n   Estados:');
		stats.rows.forEach(row => {
			console.log(`   - ${row.status}: ${row.count} tickets`);
		});

		const priorityStats = await pool.query(`
			SELECT 
				CASE 
					WHEN priority LIKE 'Baja%' THEN 'Baja'
					WHEN priority LIKE 'Media%' THEN 'Media'
					WHEN priority LIKE 'Alta%' THEN 'Alta'
					WHEN priority LIKE 'Crítica%' THEN 'Crítica'
				END as priority_level,
				COUNT(*) as count
			FROM tickets
			GROUP BY priority_level
			ORDER BY priority_level
		`);

		console.log('\n   Prioridades:');
		priorityStats.rows.forEach(row => {
			console.log(`   - ${row.priority_level}: ${row.count} tickets`);
		});

		console.log('\n🎉 ¡Base de datos poblada con éxito!\n');

	} catch (error) {
		console.error('❌ Error al ejecutar seed:', error);
		process.exit(1);
	} finally {
		await getPool().end();
		process.exit(0);
	}
}

// Ejecutar seed
const count = process.argv[2] ? parseInt(process.argv[2]) : 30;
seedTickets(count);
