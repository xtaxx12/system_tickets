#!/bin/bash
# ============================================================================
# Script de backup de base de datos
# ============================================================================
set -e

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/tickets_backup_$TIMESTAMP.sql"

# Crear directorio de backups si no existe
mkdir -p "$BACKUP_DIR"

echo "📦 Creando backup de base de datos..."

# Backup usando docker-compose
docker-compose exec -T postgres pg_dump -U "${PGUSER:-tickets}" "${PGDATABASE:-tickets}" > "$BACKUP_FILE"

# Comprimir backup
gzip "$BACKUP_FILE"

echo "✅ Backup creado: ${BACKUP_FILE}.gz"

# Eliminar backups antiguos (más de 7 días)
echo "🧹 Eliminando backups antiguos..."
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +7 -delete

echo "📋 Backups disponibles:"
ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null || echo "No hay backups"
