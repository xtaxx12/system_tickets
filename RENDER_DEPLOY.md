# 🚀 Guía de Despliegue en Render

## Índice
1. [Requisitos previos](#requisitos-previos)
2. [Crear cuenta en Render](#1-crear-cuenta-en-render)
3. [Crear base de datos PostgreSQL](#2-crear-base-de-datos-postgresql)
4. [Desplegar la aplicación](#3-desplegar-la-aplicación)
5. [Configurar variables de entorno](#4-configurar-variables-de-entorno)
6. [Verificar despliegue](#5-verificar-despliegue)
7. [Configurar dominio personalizado](#6-opcional-dominio-personalizado)
8. [CI/CD automático](#7-cicd-automático)
9. [Monitoreo y logs](#8-monitoreo-y-logs)
10. [Troubleshooting](#troubleshooting)

---

## Requisitos previos

- ✅ Cuenta de GitHub con el repositorio
- ✅ Código actualizado en la rama `main`
- ✅ Archivos de configuración (ya incluidos en el proyecto)

---

## 1. Crear cuenta en Render

1. Ve a [render.com](https://render.com)
2. Click en **"Get Started for Free"**
3. Selecciona **"GitHub"** para conectar tu cuenta
4. Autoriza Render para acceder a tus repositorios

---

## 2. Crear base de datos PostgreSQL

### Paso a paso:

1. En el Dashboard de Render, click en **"New +"** → **"PostgreSQL"**

2. Configura la base de datos:
   | Campo | Valor |
   |-------|-------|
   | Name | `tickets-db` |
   | Database | `tickets` |
   | User | `tickets_user` |
   | Region | `Oregon (US West)` |
   | Plan | `Free` |

3. Click en **"Create Database"**

4. **¡IMPORTANTE!** Espera a que el estado sea **"Available"** (puede tomar 1-2 minutos)

5. Copia los datos de conexión (los necesitarás después):
   - **Internal Database URL** (para la app)
   - **External Database URL** (para acceso externo)

### Datos que necesitarás:
```
Host: dpg-xxxxx-a.oregon-postgres.render.com
Port: 5432
Database: tickets
User: tickets_user
Password: (generada automáticamente)
```

---

## 3. Desplegar la aplicación

### Opción A: Deploy automático con Blueprint (Recomendado)

1. En el Dashboard, click en **"New +"** → **"Blueprint"**
2. Conecta tu repositorio `system_tickets`
3. Render detectará el archivo `render.yaml` automáticamente
4. Click en **"Apply"**

### Opción B: Deploy manual

1. Click en **"New +"** → **"Web Service"**

2. Conecta tu repositorio GitHub

3. Configura el servicio:
   | Campo | Valor |
   |-------|-------|
   | Name | `tickets-app` |
   | Region | `Oregon (US West)` |
   | Branch | `main` |
   | Runtime | `Node` |
   | Build Command | `npm ci` |
   | Start Command | `npm start` |
   | Plan | `Free` |

4. Click en **"Create Web Service"**

---

## 4. Configurar variables de entorno

En el Dashboard de tu Web Service, ve a **"Environment"** y agrega:

### Variables obligatorias:

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Entorno de ejecución |
| `PORT` | `3000` | Puerto (Render lo maneja) |
| `SESSION_SECRET` | `(generar)` | Secreto de sesión |
| `ADMIN_USER` | `admin` | Usuario administrador |
| `ADMIN_PASSWORD` | `(tu contraseña)` | Contraseña segura |
| `PGHOST` | `(de tu BD)` | Host de PostgreSQL |
| `PGPORT` | `5432` | Puerto de PostgreSQL |
| `PGUSER` | `tickets_user` | Usuario de BD |
| `PGPASSWORD` | `(de tu BD)` | Contraseña de BD |
| `PGDATABASE` | `tickets` | Nombre de BD |
| `PGSSLMODE` | `require` | SSL obligatorio |
| `APP_BASE_URL` | `https://tickets-app.onrender.com` | URL de tu app |

### Generar SESSION_SECRET:

Ejecuta en tu terminal:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Variables opcionales (Email):

| Variable | Valor |
|----------|-------|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `tu-email@gmail.com` |
| `SMTP_PASS` | `tu-app-password` |
| `SMTP_FROM` | `Sistema Tickets <noreply@tudominio.com>` |

---

## 5. Verificar despliegue

### Esperar el build:

1. Ve a la pestaña **"Events"** de tu servicio
2. Espera a que el build termine (5-10 minutos la primera vez)
3. El estado debe cambiar a **"Live"**

### Probar la aplicación:

1. Click en la URL de tu servicio (ej: `https://tickets-app.onrender.com`)

2. Verifica los endpoints de salud:
   ```
   https://tickets-app.onrender.com/health
   https://tickets-app.onrender.com/health/ready
   ```

3. Accede al panel de administración:
   ```
   https://tickets-app.onrender.com/admin
   ```
   - Usuario: `admin`
   - Contraseña: la que configuraste en `ADMIN_PASSWORD`

---

## 6. (Opcional) Dominio personalizado

1. En tu servicio, ve a **"Settings"** → **"Custom Domains"**

2. Click en **"Add Custom Domain"**

3. Ingresa tu dominio (ej: `tickets.tuempresa.com`)

4. Configura los DNS en tu proveedor:
   ```
   Tipo: CNAME
   Nombre: tickets (o @ para dominio raíz)
   Valor: tickets-app.onrender.com
   ```

5. Render generará automáticamente el certificado SSL

---

## 7. CI/CD Automático

### Ya está configurado:

El archivo `.github/workflows/ci.yml` ejecuta automáticamente:

| Evento | Acción |
|--------|--------|
| Push a `develop` | Lint + Tests |
| Push a `main` | Lint + Tests + Deploy |
| Pull Request | Lint + Tests |

### Flujo de trabajo:

```
feature/xxx → develop → main → Deploy automático
```

### Ver estado del pipeline:

1. Ve a tu repositorio en GitHub
2. Click en **"Actions"**
3. Verás el estado de cada ejecución

---

## 8. Monitoreo y logs

### Ver logs en tiempo real:

1. En el Dashboard de Render, ve a tu servicio
2. Click en **"Logs"**

### Endpoints de monitoreo:

| Endpoint | Descripción |
|----------|-------------|
| `/health` | Estado básico |
| `/health/ready` | Estado + conexión BD |
| `/health/metrics` | Métricas de memoria |

### Configurar alertas:

1. Ve a **"Settings"** → **"Health Checks"**
2. Configura el path: `/health`
3. Render reiniciará automáticamente si falla

---

## Troubleshooting

### ❌ Error: "Build failed"

**Solución:**
```bash
# Verifica que package.json tenga:
"engines": {
  "node": ">=18.0.0"
}

# Y que el start command sea correcto:
"start": "node src/server.js"
```

### ❌ Error: "Database connection failed"

**Verificar:**
1. La BD está en estado "Available"
2. Las variables `PG*` están correctas
3. `PGSSLMODE=require` está configurado

**Probar conexión:**
```bash
# Desde tu máquina local con la External URL
psql "postgres://user:pass@host:5432/tickets?sslmode=require"
```

### ❌ Error: "Application failed to respond"

**Verificar:**
1. El puerto es `3000` (o usa `process.env.PORT`)
2. El health check path es `/health`
3. Revisa los logs para más detalles

### ❌ La app tarda en responder (cold start)

**Nota:** El plan Free de Render "duerme" después de 15 minutos de inactividad. La primera request puede tardar 30-60 segundos.

**Solución:** Upgrade a plan Starter ($7/mes) para evitar cold starts.

### ❌ Error: "SESSION_SECRET too short"

**Solución:**
```bash
# Genera un secreto de 64+ caracteres:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Resumen de URLs

Una vez desplegado, tendrás:

| Recurso | URL |
|---------|-----|
| Aplicación | `https://tickets-app.onrender.com` |
| Admin Panel | `https://tickets-app.onrender.com/admin` |
| Health Check | `https://tickets-app.onrender.com/health` |
| Dashboard Render | `https://dashboard.render.com` |

---

## Costos

| Servicio | Plan Free | Plan Starter |
|----------|-----------|--------------|
| Web Service | ✅ (con cold starts) | $7/mes |
| PostgreSQL | ✅ (90 días, 1GB) | $7/mes |

**Recomendación:** Empieza con Free para probar, upgrade cuando tengas usuarios reales.

---

## Soporte

- 📚 [Documentación de Render](https://render.com/docs)
- 💬 [Comunidad de Render](https://community.render.com)
- 🐛 [Issues del proyecto](https://github.com/xtaxx12/system_tickets/issues)
