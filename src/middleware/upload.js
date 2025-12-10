/**
 * Configuración segura de uploads
 */
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { ValidationError } = require('./errorHandler');

// Tipos MIME permitidos
const ALLOWED_MIME_TYPES = {
	'image/jpeg': 'jpg',
	'image/jpg': 'jpg',
	'image/png': 'png',
	'image/gif': 'gif',
	'image/webp': 'webp',
};

// Configuración de almacenamiento
const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, path.join(__dirname, '..', '..', 'uploads'));
	},
	filename: (req, file, cb) => {
		// Generar nombre único y seguro
		const uniqueId = crypto.randomBytes(16).toString('hex');
		const timestamp = Date.now();
		const ext = ALLOWED_MIME_TYPES[file.mimetype] || 'bin';
		cb(null, `${timestamp}-${uniqueId}.${ext}`);
	},
});

// Filtro de archivos
const fileFilter = (req, file, cb) => {
	// Verificar tipo MIME
	if (!ALLOWED_MIME_TYPES[file.mimetype]) {
		return cb(new ValidationError('Tipo de archivo no permitido. Solo se aceptan imágenes (JPG, PNG, GIF, WebP)'), false);
	}

	// Verificar extensión
	const ext = path.extname(file.originalname).toLowerCase().slice(1);
	if (!config.uploads.allowedTypes.test(ext)) {
		return cb(new ValidationError('Extensión de archivo no permitida'), false);
	}

	cb(null, true);
};

// Configuración de Multer
const upload = multer({
	storage,
	fileFilter,
	limits: {
		fileSize: config.uploads.maxSize,
		files: 1,
	},
});

// Middleware para manejar errores de Multer
function handleUploadError(err, req, res, next) {
	if (err instanceof multer.MulterError) {
		if (err.code === 'LIMIT_FILE_SIZE') {
			return next(new ValidationError(`El archivo excede el tamaño máximo de ${config.uploads.maxSize / 1024 / 1024}MB`));
		}
		if (err.code === 'LIMIT_FILE_COUNT') {
			return next(new ValidationError('Solo se permite un archivo'));
		}
		return next(new ValidationError(`Error de upload: ${err.message}`));
	}
	next(err);
}

module.exports = {
	upload,
	handleUploadError,
	ALLOWED_MIME_TYPES,
};
