# 🔒 Mejoras de Seguridad Rápidas
## Implementación Inmediata (1-2 horas)

---

## 1. Instalar Dependencias de Seguridad

```bash
npm install helmet express-rate-limit express-validator csurf compression winston
```

---

## 2. Crear archivo de configuración de entorno

**Crear: `config/validateEnv.js`**
```javascript
function validateEnv() {
    const requiredEnvVars = [
        'SESSION_SECRET',
        'PGHOST',
        'PGUSER',
        'PGPASSWORD',
        'PGDATABASE'
    ];

    if (process.env.NODE_ENV === 'production') {
        const missing = requiredEnvVars.filter(varName => !process.env[varName]);
        
        if (missing.length > 0) {
            console.error('❌ Missing required environment variables:');
            missing.forEach(varName => console.error(`   - ${varName}`));
            process.exit(1);
        }
        
        console.log('✅ All required environment variables are set');
    }
}

module.exports = { validateEnv };
```

---

## 3. Actualizar src/server.js

**Agregar al inicio del archivo:**
```javascript
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const { validateEnv } = require('../config/validateEnv');

// Validar variables de entorno
validateEnv();
```

**Después de `dotenv.config()` y antes de las rutas:**
```javascript
// Seguridad con Helmet
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.tailwindcss.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

// Compresión
app.use(compression());

// Rate limiting para login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // 5 intentos
    message: 'Demasiados intentos de login. Intente de nuevo en 15 minutos.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiting general
const generalLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 100, // 100 requests
    message: 'Demasiadas solicitudes. Intente de nuevo más tarde.',
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/admin/login', loginLimiter);
app.use(generalLimiter);

// Mejorar configuración de sesión
app.use(
    session({
        secret: process.env.SESSION_SECRET || (() => {
            if (process.env.NODE_ENV === 'production') {
                throw new Error('SESSION_SECRET must be set in production');
            }
            console.warn('⚠️  Using default session secret (development only)');
            return 'dev-secret-change-me';
        })(),
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 1000 * 60 * 60 * 8, // 8 horas
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', // HTTPS en producción
            sameSite: 'strict',
        },
    })
);
```

**Agregar endpoint de health:**
```javascript
// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});
```

**Agregar manejo global de errores (antes del app.listen):**
```javascript
// Manejo global de errores
app.use((err, req, res, next) => {
    console.error('Error:', err);
    
    // No exponer detalles en producción
    const message = process.env.NODE_ENV === 'production'
        ? 'Ha ocurrido un error. Por favor intente de nuevo.'
        : err.message;
    
    res.status(err.status || 500).render('partials/error', {
        title: 'Error',
        message: message,
        error: process.env.NODE_ENV === 'production' ? {} : err
    });
});

// Manejo de promesas no capturadas
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});
```

---

## 4. Crear vista de error

**Crear: `src/views/partials/error.ejs`**
```html
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><%= title %></title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { font-family: 'Inter', system-ui, -apple-system, sans-serif; }
    </style>
</head>
<body class="bg-gray-50 flex items-center justify-center min-h-screen">
    <div class="max-w-md w-full mx-4">
        <div class="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 text-center">
            <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                </svg>
            </div>
            <h1 class="text-2xl font-bold text-gray-900 mb-2">Error</h1>
            <p class="text-gray-600 mb-6"><%= message %></p>
            <a href="/" class="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                </svg>
                Volver al Inicio
            </a>
        </div>
    </div>
</body>
</html>
```

---

## 5. Actualizar .env.example

```env
# Base de Datos
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=your_secure_password_here
PGDATABASE=tickets
PGSSLMODE=disable

# Seguridad
SESSION_SECRET=generate_a_random_string_here_min_32_chars
NODE_ENV=development

# Servidor
PORT=3000

# Admin
ADMIN_USER=admin
ADMIN_PASSWORD=change_this_password

# Email (Opcional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=soporte@example.com
APP_BASE_URL=http://localhost:3000
```

---

## 6. Actualizar src/db.js

**Reemplazar la configuración del Pool:**
```javascript
function getPool() {
    if (!pool) {
        // Validar credenciales en producción
        if (process.env.NODE_ENV === 'production') {
            if (!process.env.PGPASSWORD || process.env.PGPASSWORD === 'admin123') {
                throw new Error('PGPASSWORD must be set to a secure value in production');
            }
        }

        pool = new Pool({
            host: process.env.PGHOST || 'localhost',
            port: Number(process.env.PGPORT || 5432),
            user: process.env.PGUSER || 'postgres',
            password: process.env.PGPASSWORD,
            database: process.env.PGDATABASE || 'tickets',
            ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
            max: 20, // máximo de conexiones
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        // Manejo de errores del pool
        pool.on('error', (err) => {
            console.error('Unexpected error on idle client', err);
        });
    }
    return pool;
}
```

---

## 7. Crear script de generación de secretos

**Crear: `scripts/generate-secrets.js`**
```javascript
const crypto = require('crypto');

console.log('\n🔐 Secretos Generados para Producción:\n');
console.log('SESSION_SECRET=' + crypto.randomBytes(32).toString('hex'));
console.log('\n📝 Copia estos valores a tu archivo .env de producción\n');
```

**Ejecutar:**
```bash
node scripts/generate-secrets.js
```

---

## 8. Actualizar package.json

**Agregar scripts:**
```json
{
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "prod": "NODE_ENV=production node src/server.js",
    "generate-secrets": "node scripts/generate-secrets.js",
    "seed": "node seed.js",
    "seed:50": "node seed.js 50",
    "seed:100": "node seed.js 100",
    "clear-db": "node clear-db.js"
  }
}
```

---

## 9. Crear .gitignore actualizado

```
# Dependencies
node_modules/

# Environment
.env
.env.local
.env.production

# Uploads
uploads/*
!uploads/.gitkeep

# Logs
logs/
*.log
npm-debug.log*

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Build
dist/
build/

# Database
*.sqlite
*.db
```

---

## 10. Checklist de Implementación

- [ ] Instalar dependencias de seguridad
- [ ] Crear config/validateEnv.js
- [ ] Actualizar src/server.js con mejoras
- [ ] Crear vista de error
- [ ] Actualizar .env.example
- [ ] Mejorar configuración de DB
- [ ] Generar secretos seguros
- [ ] Actualizar package.json
- [ ] Actualizar .gitignore
- [ ] Probar en desarrollo
- [ ] Documentar cambios

---

## 🚀 Después de Implementar

1. **Generar secretos:**
   ```bash
   npm run generate-secrets
   ```

2. **Actualizar .env con valores seguros**

3. **Probar en desarrollo:**
   ```bash
   npm run dev
   ```

4. **Verificar endpoints:**
   - http://localhost:3000/health
   - Intentar login múltiples veces (rate limit)
   - Verificar headers de seguridad

5. **Revisar logs:**
   - No debe haber warnings de seguridad
   - Variables de entorno validadas

---

## ⏱️ Tiempo Estimado

- **Instalación:** 5 minutos
- **Configuración:** 30 minutos
- **Testing:** 15 minutos
- **Total:** ~1 hora

---

## 📈 Mejora de Seguridad

**Antes:** 🔴 Riesgo ALTO  
**Después:** 🟡 Riesgo MEDIO  

**Próximos pasos:** Implementar tests, logging avanzado, y monitoreo.
