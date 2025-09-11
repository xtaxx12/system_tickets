const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const dotenv = require('dotenv');

// Cargar variables de entorno
dotenv.config();

const { ensureDatabaseInitialized } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Crear carpetas necesarias en runtime
const uploadDir = path.join(__dirname, '..', 'uploads');
const publicDir = path.join(__dirname, '..', 'public');
if (!fs.existsSync(uploadDir)) {
	fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(publicDir)) {
	fs.mkdirSync(publicDir, { recursive: true });
}

// Configuración de Express
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
	session({
		secret: process.env.SESSION_SECRET || 'change_me',
		resave: false,
		saveUninitialized: false,
		cookie: { maxAge: 1000 * 60 * 60 * 8 },
	})
);

app.use('/public', express.static(publicDir));
app.use('/uploads', express.static(uploadDir));

// Rutas
const publicRouter = require('./routes/public');
const adminRouter = require('./routes/admin');

app.use('/', publicRouter);
app.use('/admin', adminRouter);

// 404
app.use((req, res) => {
	res.status(404).render('partials/404', { title: 'No encontrado' });
});

// Inicializar DB y arrancar servidor
ensureDatabaseInitialized();

app.listen(PORT, () => {
	console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
