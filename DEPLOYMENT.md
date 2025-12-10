# Guía de Despliegue - Sistema de Tickets

## Requisitos

- Docker y Docker Compose
- Git
- Servidor con al menos 1GB RAM

## Despliegue Rápido con Docker

### 1. Clonar repositorio

```bash
git clone https://github.com/tu-usuario/system_tickets.git
cd system_tickets
```

### 2. Configurar variables de entorno

```bash
# Copiar plantilla
cp .env.production .env

# Editar con tus valores
nano .env
```

**Variables obligatorias:**
- `PGPASSWORD` - Contraseña de PostgreSQL
- `SESSION_SECRET` - Secreto de sesión (mínimo 64 caracteres)
- `ADMIN_PASSWORD` - Contraseña del administrador

Generar secreto seguro:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Iniciar servicios

```bash
docker-compose up -d
```

### 4. Verificar estado

```bash
# Ver logs
docker-compose logs -f app

# Health check
curl http://localhost:3000/health
```

## Comandos Útiles

```bash
# Ver estado de contenedores
docker-compose ps

# Reiniciar aplicación
docker-compose restart app

# Ver logs en tiempo real
docker-compose logs -f

# Detener todo
docker-compose down

# Reconstruir después de cambios
docker-compose build --no-cache
docker-compose up -d
```

## Backup de Base de Datos

```bash
# Crear backup
./scripts/backup-db.sh

# Restaurar backup
gunzip -c backups/tickets_backup_FECHA.sql.gz | \
  docker-compose exec -T postgres psql -U tickets tickets
```

## Configuración con Nginx (Reverse Proxy)

```nginx
server {
    listen 80;
    server_name tu-dominio.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name tu-dominio.com;

    ssl_certificate /etc/letsencrypt/live/tu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tu-dominio.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Uploads
    client_max_body_size 10M;
}
```

## SSL con Let's Encrypt

```bash
# Instalar certbot
sudo apt install certbot python3-certbot-nginx

# Obtener certificado
sudo certbot --nginx -d tu-dominio.com
```

## Monitoreo

### Endpoints de Health Check

| Endpoint | Descripción |
|----------|-------------|
| `/health` | Estado básico del servidor |
| `/health/ready` | Estado completo (incluye BD) |
| `/health/metrics` | Métricas de memoria y uptime |

### Logs

Los logs se guardan en:
- `logs/combined.log` - Todos los logs
- `logs/error.log` - Solo errores

## Actualización

```bash
# Obtener cambios
git pull origin main

# Reconstruir y reiniciar
docker-compose build
docker-compose up -d
```

## Troubleshooting

### La aplicación no inicia

```bash
# Ver logs detallados
docker-compose logs app

# Verificar conexión a BD
docker-compose exec postgres pg_isready
```

### Error de conexión a base de datos

```bash
# Verificar que PostgreSQL esté corriendo
docker-compose ps postgres

# Verificar credenciales
docker-compose exec postgres psql -U tickets -c "SELECT 1"
```

### Limpiar todo y empezar de nuevo

```bash
docker-compose down -v  # -v elimina volúmenes
docker-compose up -d
```
