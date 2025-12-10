# ============================================================================
# Dockerfile para Sistema de Tickets
# ============================================================================
FROM node:20-alpine AS base

# Instalar dependencias del sistema
RUN apk add --no-cache libc6-compat

WORKDIR /app

# ============================================================================
# Etapa de dependencias
# ============================================================================
FROM base AS deps

COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# ============================================================================
# Etapa de producción
# ============================================================================
FROM base AS production

# Usuario no-root por seguridad
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

WORKDIR /app

# Copiar dependencias
COPY --from=deps /app/node_modules ./node_modules

# Copiar código fuente
COPY --chown=appuser:nodejs . .

# Crear directorios necesarios
RUN mkdir -p logs uploads && \
    chown -R appuser:nodejs logs uploads

# Cambiar a usuario no-root
USER appuser

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3000

# Exponer puerto
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Comando de inicio
CMD ["node", "src/server.js"]
