# Sistema de Tickets de Soporte

Sistema completo de gestión de tickets con control de acceso basado en roles y permisos granulares.

## Requisitos
- Node.js 18+
- PostgreSQL 12+

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
- Desarrollo:
  ```bash
  npm run dev
  ```
- Producción:
  ```bash
  npm start
  ```

## Accesos
- Público: `http://localhost:3000/`
- Listado público: `http://localhost:3000/tickets`
- Panel Admin: `http://localhost:3000/admin`
  - Usuario por defecto: `admin` / Contraseña: configurada en `.env`

## Características Principales

### 🎫 Gestión de Tickets
- Creación de tickets con:
  - Imagen adjunta opcional
  - Información de AnyDesk
  - Notificación por correo electrónico
  - Prioridades: Baja, Media, Alta
  - Tipos de soporte: Hardware, Software, Red, Otro
- Referencia única generada automáticamente (ej: `TKT-2024-0001`)
- Estados: Pendiente, En Proceso, Resuelto, Cerrado
- Asignación de tickets a técnicos
- Edición pública mediante token único
- Comentarios públicos e internos
- Vista detallada con historial completo

### 👥 Sistema de Usuarios y Roles
- Roles predefinidos del sistema:
  - **Administrador**: Acceso total al sistema
  - **Supervisor**: Gestión de tickets y asignaciones
  - **Técnico**: Visualización y atención de tickets
- Roles personalizables con permisos granulares
- Gestión completa de usuarios (crear, editar rol, eliminar)
- Perfil de usuario con cambio de contraseña

### 🔐 Permisos Granulares
Sistema de 14 permisos específicos organizados en 5 categorías:

**Gestión de Tickets:**
- Ver tickets
- Asignar tickets a técnicos
- Cambiar estado de tickets
- Eliminar tickets

**Comentarios:**
- Agregar comentarios públicos
- Agregar comentarios internos

**Estadísticas:**
- Ver estadísticas del sistema
- Ver reportes

**Administración:**
- Gestionar usuarios (crear, editar, eliminar)
- Gestionar roles y permisos

**Notificaciones:**
- Recibir notificaciones de nuevos tickets
- Recibir notificaciones de asignaciones
- Recibir notificaciones de comentarios
- Recibir notificaciones de cambios de estado

### 🔔 Sistema de Notificaciones
- Notificaciones en tiempo real por rol
- Alertas específicas según permisos del usuario:
  - Nuevos tickets creados
  - Tickets asignados
  - Nuevos comentarios
  - Cambios de estado
  - Tickets de alta prioridad sin asignar
- Indicador visual de notificaciones no leídas
- Marcar como leídas individualmente o todas a la vez

### 📊 Panel Administrativo
- Dashboard con estadísticas en tiempo real:
  - Total de tickets por estado
  - Estadísticas personales del usuario
  - Distribución por prioridad y tipo
- Filtros avanzados:
  - Por estado, prioridad, tipo de soporte
  - Por técnico asignado
  - "Mis Tickets" (filtro personal)
- Paginación (15 tickets por página)
- Búsqueda y ordenamiento

### 🛠️ Gestión de Roles y Permisos
- Interfaz visual para configurar permisos por rol
- Creación de roles personalizados
- Edición de permisos para roles existentes
- No se pueden eliminar roles del sistema
- No se pueden eliminar roles con usuarios asignados
- Asignación y cambio de roles de usuarios desde el panel

### 📧 Notificaciones por Email
- Confirmación de creación de ticket
- Actualizaciones de estado
- Respuestas a comentarios
- Configuración SMTP opcional

## Estructura del Proyecto

```
system_tickets/
├── src/
│   ├── db.js                    # Configuración y migraciones de BD
│   ├── app.js                   # Aplicación Express
│   ├── models/
│   │   ├── tickets.js           # Modelo de tickets
│   │   ├── comments.js          # Modelo de comentarios
│   │   ├── notifications.js     # Modelo de notificaciones
│   │   └── permissions.js       # Modelo de permisos y roles
│   ├── routes/
│   │   ├── public.js            # Rutas públicas
│   │   └── admin.js             # Rutas administrativas
│   └── views/
│       ├── public/              # Vistas públicas
│       │   ├── index.ejs
│       │   ├── list.ejs
│       │   ├── detail.ejs
│       │   └── edit.ejs
│       └── admin/               # Vistas administrativas
│           ├── login.ejs
│           ├── list.ejs
│           ├── detail.ejs
│           ├── perfil.ejs
│           ├── usuarios.ejs
│           ├── roles.ejs
│           └── role-edit.ejs
├── uploads/                     # Imágenes adjuntas
├── .env                         # Variables de entorno
├── .env.example                 # Ejemplo de configuración
└── package.json
```

## Variables de Entorno

```env
# Base de datos
DATABASE_URL=postgresql://usuario:password@localhost:5432/tickets

# Servidor
PORT=3000
SESSION_SECRET=tu-secreto-seguro

# Admin por defecto
ADMIN_USER=admin
ADMIN_PASS=admin123

# SMTP (opcional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tu-email@gmail.com
SMTP_PASS=tu-password
SMTP_FROM=soporte@tuempresa.com

# URL base para emails
APP_BASE_URL=http://localhost:3000
```

## API de Permisos

Los middlewares de permisos disponibles en el backend:

```javascript
// Requiere un permiso específico
requirePermission('assign_tickets')

// Requiere cualquiera de los permisos listados
requireAnyPermission('view_tickets', 'view_statistics')

// Agrega permisos del usuario al request
addUserPermissions
```

## Inicialización de la Base de Datos

Al ejecutar la aplicación por primera vez, se crean automáticamente:
- Tablas de la base de datos (tickets, users, comments, notifications, roles, permissions)
- Roles del sistema (admin, supervisor, tecnico)
- Permisos predefinidos (14 permisos en 5 categorías)
- Usuario administrador por defecto
- Relaciones entre roles y permisos

## Uso

1. Accede al panel admin: `http://localhost:3000/admin`
2. Inicia sesión con las credenciales de administrador
3. Gestiona roles y permisos en `/admin/roles`
4. Crea usuarios con roles específicos en `/admin/usuarios`
5. Los usuarios recibirán notificaciones según sus permisos

## Seguridad

- Contraseñas hasheadas con bcrypt
- Sesiones seguras con express-session
- Validación de permisos en backend y frontend
- Protección contra cambios no autorizados
- Usuarios no pueden modificar su propio rol
- Roles del sistema protegidos contra eliminación

## Licencia

MIT
