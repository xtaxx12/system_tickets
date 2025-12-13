# Sistema de Tickets de Soporte

[![CI/CD](https://github.com/xtaxx12/system_tickets/actions/workflows/ci.yml/badge.svg)](https://github.com/xtaxx12/system_tickets/actions/workflows/ci.yml)

Sistema completo de gestión de tickets con control de acceso basado en roles, permisos granulares, y arquitectura de producción.

## 🚀 Demo

**Producción:** https://tickets-app-m6jd.onrender.com

## Requisitos

- Node.js 20+
- PostgreSQL 16+

## Configuración

1. Copia `.env.example` a `.env` y ajusta valores:
   ```bash
   cp .env.example .env
   ```
2. Instala dependencias:
   ```bash
   npm install
   ```
3. La base de datos se inicializa automáticamente al ejecutar la aplicación.

## Ejecutar

```bash
# Desarrollo
npm run dev

# Producción
npm start

# Tests
npm test              # Todos los tests
npm run test:unit     # Solo unit tests
npm run test:coverage # Con cobertura
```

## 🐳 Docker

```bash
# Build
docker build -t tickets-app .

# Run
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://... \
  -e SESSION_SECRET=... \
  tickets-app
```

## Accesos

- Público: `http://localhost:3000/`
- Listado público: `http://localhost:3000/tickets`
- Panel Admin: `http://localhost:3000/admin`
- Health Check: `http://localhost:3000/health`

## 🏗️ Arquitectura

### Capas de la Aplicación

```
┌─────────────────────────────────────────────────────────┐
│                      Routes                              │
│              (public.js, admin.js, health.js)           │
├─────────────────────────────────────────────────────────┤
│                    Middlewares                           │
│    (auth, security, errorHandler, upload, validators)   │
├─────────────────────────────────────────────────────────┤
│                     Services                             │
│   (ticketService, userService, roleService, email)      │
├─────────────────────────────────────────────────────────┤
│                      Models                              │
│    (tickets, comments, notifications, permissions)      │
├─────────────────────────────────────────────────────────┤
│                     Database                             │
│                    (PostgreSQL)                          │
└─────────────────────────────────────────────────────────┘
```

### Estructura del Proyecto

```
system_tickets/
├── .github/
│   └── workflows/
│       └── ci.yml              # CI/CD Pipeline
├── src/
│   ├── config/
│   │   └── index.js            # Configuración centralizada
│   ├── middleware/
│   │   ├── auth.js             # Autenticación y permisos
│   │   ├── security.js         # Headers de seguridad, rate limiting
│   │   ├── errorHandler.js     # Manejo centralizado de errores
│   │   ├── upload.js           # Subida de archivos
│   │   └── requestLogger.js    # Logging de requests
│   ├── models/
│   │   ├── tickets.js          # Modelo de tickets
│   │   ├── comments.js         # Modelo de comentarios
│   │   ├── notifications.js    # Modelo de notificaciones
│   │   └── permissions.js      # Modelo de permisos y roles
│   ├── routes/
│   │   ├── public.js           # Rutas públicas
│   │   ├── admin.js            # Rutas administrativas
│   │   └── health.js           # Health checks
│   ├── services/
│   │   ├── ticketService.js    # Lógica de tickets
│   │   ├── userService.js      # Lógica de usuarios
│   │   ├── roleService.js      # Lógica de roles
│   │   └── emailService.js     # Envío de emails
│   ├── utils/
│   │   └── logger.js           # Winston logger
│   ├── validators/
│   │   └── index.js            # Validación con Zod
│   ├── views/                  # Templates EJS
│   ├── db.js                   # Conexión y migraciones
│   └── server.js               # Entry point
├── tests/
│   ├── unit/                   # Tests unitarios
│   ├── integration/            # Tests de integración
│   └── helpers/                # Utilidades de test
├── Dockerfile                  # Multi-stage build
├── .dockerignore
└── vitest.config.js
```

## 🔒 Seguridad

### Middlewares Implementados

- **Helmet**: Headers de seguridad HTTP
- **Rate Limiting**: 100 req/15min general, 5 req/15min login
- **CORS**: Configuración de orígenes permitidos
- **XSS Protection**: Sanitización de inputs
- **SQL Injection**: Queries parametrizadas
- **CSRF**: Protección en formularios
- **Session Security**: Cookies seguras, regeneración de sesión

### Validación

Validación de datos con **Zod**:
- Tickets: nombre, departamento, prioridad, descripción
- Usuarios: username, password, role
- Comentarios: contenido, longitud máxima
- Roles: nombre, permisos

## 🧪 Testing

### Suite de Tests (216 tests)

| Categoría | Tests | Descripción |
|-----------|-------|-------------|
| Unit | 42 | Validadores Zod |
| Integration - Routes | 44 | Rutas públicas y admin |
| Integration - Services | 51 | Servicios de negocio |
| Critical Flows | 17 | Flujos completos E2E |
| Negative Cases | 42 | Validación de errores |
| Security | 20 | Auth, permisos, XSS, SQLi |

### Ejecutar Tests

```bash
# Todos los tests
npm test

# Solo unitarios (sin DB)
npm run test:unit

# Con cobertura (requiere PostgreSQL)
npm run test:coverage

# Watch mode
npm run test:watch
```

### Cobertura

Mínimo requerido: **55%** (configurado en `vitest.config.js`)

## 🔄 CI/CD Pipeline

### Jobs del Pipeline

```
┌──────────────┐    ┌────────────────────┐    ┌─────────────┐
│  Unit Tests  │───▶│ Integration Tests  │───▶│Docker Build │
└──────────────┘    └────────────────────┘    └──────┬──────┘
                                                      │
┌────────────────┐                                    │
│ Security Audit │────────────────────────────────────┤
└────────────────┘                                    │
                                                      ▼
                    ┌──────────────────┐    ┌──────────────┐
                    │ Deploy to Render │───▶│ Health Check │
                    └──────────────────┘    └──────────────┘
                         (solo main)
```

### Triggers

- **Push/PR a `develop`**: Tests + Docker Build
- **Push/PR a `main`**: Tests + Docker Build + Deploy + Health Check

### Secrets Requeridos (GitHub)

| Secret | Descripción |
|--------|-------------|
| `RENDER_DEPLOY_HOOK` | Webhook URL de Render |
| `APP_URL` | URL de la aplicación en producción |

## 📊 Health Checks

```bash
# Básico
GET /health
# Response: { "status": "ok", "timestamp": "..." }

# Con verificación de DB
GET /health/ready
# Response: { "status": "ok", "database": "connected" }

# Métricas
GET /health/metrics
# Response: { "memory": {...}, "uptime": ... }
```

## 🎫 Características Principales

### Gestión de Tickets
- Creación con imagen adjunta opcional
- Información de AnyDesk
- Prioridades: Baja, Media, Alta, Crítica
- Tipos: Hardware, Software, Red, Otro
- Estados: Pendiente, En Proceso, Resuelto, Cerrado
- Referencia única automática (ej: `TKT-2024-0001`)
- Edición pública mediante token único
- Comentarios públicos e internos

### Sistema de Usuarios y Roles
- **Administrador**: Acceso total
- **Supervisor**: Gestión de tickets y asignaciones
- **Técnico**: Visualización y atención
- Roles personalizables con 14 permisos granulares

### Sistema de Notificaciones
- Notificaciones en tiempo real por rol
- Alertas de nuevos tickets, asignaciones, comentarios
- Indicador visual de no leídas

### Panel Administrativo
- Dashboard con estadísticas en tiempo real
- Filtros avanzados por estado, prioridad, técnico
- Paginación (15 tickets por página)

## 📧 Notificaciones por Email

Configuración SMTP opcional en `.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-email@gmail.com
SMTP_PASS=tu-password
```

## Variables de Entorno

```env
# Base de datos
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=password
PGDATABASE=tickets

# Servidor
PORT=3000
NODE_ENV=production
SESSION_SECRET=tu-secreto-seguro-minimo-32-caracteres

# Admin por defecto
ADMIN_USER=admin
ADMIN_PASSWORD=admin123

# Logging
LOG_LEVEL=info
```

## 📝 Logging

Logging estructurado con **Winston**:
- Niveles: error, warn, info, debug
- Archivos: `logs/error.log`, `logs/combined.log`
- Formato JSON en producción
- Colores en desarrollo

## Licencia

MIT
