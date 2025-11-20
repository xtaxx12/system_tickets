# 🌱 Seed de Base de Datos - Sistema de Tickets

Este script permite poblar la base de datos con tickets de ejemplo para pruebas y desarrollo.

## 📋 Características

El seed genera tickets realistas con:

- **Nombres aleatorios** de solicitantes
- **Departamentos** variados (RRHH, IT, Ventas, etc.)
- **Tipos de soporte** (Hardware, Software, Red, Accesos, Email, Otro)
- **Prioridades** (Baja, Media, Alta, Crítica)
- **Estados** (Pendiente, En Proceso, Resuelto, Cerrado)
- **Fechas** distribuidas en los últimos 30 días
- **Comentarios** aleatorios (públicos e internos)
- **Códigos AnyDesk** cuando aplica

## 🚀 Uso

### Opción 1: Generar 30 tickets (por defecto)
```bash
npm run seed
```

### Opción 2: Generar 50 tickets
```bash
npm run seed:50
```

### Opción 3: Generar 100 tickets
```bash
npm run seed:100
```

### Opción 4: Cantidad personalizada
```bash
node seed.js 75
```

## 📊 Datos Generados

### Tipos de Soporte
- Hardware (impresoras, monitores, teclados, etc.)
- Software (Excel, Windows, aplicaciones, etc.)
- Red e Internet (WiFi, VPN, conexiones, etc.)
- Acceso y Permisos (usuarios, contraseñas, etc.)
- Correo Electrónico (Outlook, envío, recepción, etc.)
- Otro (consultas generales)

### Prioridades
- **Baja** – No es urgente
- **Media** – Puede esperar unas horas
- **Alta** – Necesito ayuda pronto
- **Crítica** – Bloquea mi trabajo

### Estados
- **Pendiente** - Ticket recién creado
- **En Proceso** - Siendo atendido
- **Resuelto** - Problema solucionado
- **Cerrado** - Ticket finalizado

### Departamentos
- Recursos Humanos
- Contabilidad
- Ventas
- Marketing
- Operaciones
- IT
- Administración
- Logística
- Atención al Cliente
- Desarrollo

## 📝 Ejemplo de Salida

```
🌱 Iniciando seed de la base de datos...

✅ Base de datos inicializada

📝 Creando 30 tickets de ejemplo...

   ✓ Ticket 1/30: T-241120-A1B2C3D4 - Pendiente - Alta – Necesito ayuda pronto
   ✓ Ticket 2/30: T-241120-E5F6G7H8 - En Proceso - Media – Puede esperar unas horas
   ✓ Ticket 3/30: T-241120-I9J0K1L2 - Resuelto - Baja – No es urgente
   ...

✅ Seed completado exitosamente!

📊 Resumen:

   Estados:
   - Cerrado: 8 tickets
   - En Proceso: 7 tickets
   - Pendiente: 9 tickets
   - Resuelto: 6 tickets

   Prioridades:
   - Alta: 8 tickets
   - Baja: 7 tickets
   - Crítica: 6 tickets
   - Media: 9 tickets

🎉 ¡Base de datos poblada con éxito!
```

## ⚠️ Notas Importantes

1. **No elimina tickets existentes** - El seed agrega nuevos tickets sin borrar los anteriores
2. **Requiere base de datos configurada** - Asegúrate de tener PostgreSQL corriendo
3. **Variables de entorno** - Usa las mismas variables que el servidor principal
4. **Comentarios aleatorios** - Aproximadamente 50% de los tickets tendrán comentarios

## 🔧 Configuración

El seed usa las mismas variables de entorno que la aplicación:

```env
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=admin123
PGDATABASE=tickets
```

## 🎯 Casos de Uso

- **Desarrollo**: Probar la interfaz con datos realistas
- **Testing**: Validar filtros, búsquedas y paginación
- **Demos**: Mostrar el sistema con datos de ejemplo
- **Performance**: Probar con grandes volúmenes de datos

## 🧹 Limpiar Base de Datos

Si necesitas empezar desde cero:

```sql
-- Conectarse a PostgreSQL
psql -U postgres -d tickets

-- Eliminar todos los tickets y comentarios
TRUNCATE TABLE comments, tickets RESTART IDENTITY CASCADE;
```

## 💡 Tips

- Ejecuta el seed varias veces para tener más variedad de datos
- Usa `seed:100` para probar con volúmenes más grandes
- Los tickets tienen fechas distribuidas en los últimos 30 días
- Aproximadamente 60% de los tickets tienen AnyDesk instalado
- Los comentarios internos representan ~30% del total

---

**¡Listo para poblar tu base de datos!** 🚀
