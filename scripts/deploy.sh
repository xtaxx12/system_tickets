#!/bin/bash
# ============================================================================
# Script de despliegue para producción
# ============================================================================
set -e

echo "🚀 Iniciando despliegue..."

# Verificar que existan las variables de entorno necesarias
required_vars=("PGPASSWORD" "SESSION_SECRET" "ADMIN_PASSWORD")
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ Error: Variable $var no está definida"
        exit 1
    fi
done

# Obtener últimos cambios
echo "📥 Obteniendo últimos cambios..."
git pull origin main

# Construir y levantar contenedores
echo "🐳 Construyendo contenedores..."
docker-compose build --no-cache

echo "🔄 Reiniciando servicios..."
docker-compose down
docker-compose up -d

# Esperar a que la aplicación esté lista
echo "⏳ Esperando a que la aplicación esté lista..."
sleep 10

# Verificar health check
echo "🏥 Verificando estado de la aplicación..."
if curl -sf http://localhost:3000/health > /dev/null; then
    echo "✅ Aplicación desplegada correctamente"
else
    echo "❌ Error: La aplicación no responde"
    docker-compose logs app
    exit 1
fi

# Limpiar imágenes antiguas
echo "🧹 Limpiando imágenes antiguas..."
docker image prune -f

echo "🎉 Despliegue completado exitosamente"
