# Repository Pattern Implementation

## 📋 Resumen

Este proyecto ahora implementa el **Repository Pattern** para abstraer el acceso a datos. Este patrón proporciona los siguientes beneficios:

- **Inyección de dependencias**: El pool de conexiones se inyecta en el constructor
- **Testing aislado**: Fácil de mockear para tests unitarios
- **Cambio de BD transparente**: Abstracción de la capa de datos
- **Código más limpio**: Separación clara de responsabilidades

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                        Routes (HTTP Layer)                   │
├─────────────────────────────────────────────────────────────┤
│                       Services (Business Logic)              │
├─────────────────────────────────────────────────────────────┤
│                    Repositories (Data Access)                │
├─────────────────────────────────────────────────────────────┤
│                     PostgreSQL Database                      │
└─────────────────────────────────────────────────────────────┘
```

## 📁 Estructura de Repositorios

```
src/repositories/
├── index.js              # Exports y RepositoryContainer
├── BaseRepository.js     # Clase base con métodos comunes
├── TicketRepository.js   # Repositorio de tickets
├── CommentRepository.js  # Repositorio de comentarios
├── NotificationRepository.js # Repositorio de notificaciones
├── UserRepository.js     # Repositorio de usuarios
└── PermissionRepository.js # Repositorio de permisos/roles
```

## 🔧 Uso

### Uso Estándar (con singleton)

Los servicios exportan funciones que usan un singleton interno, manteniendo compatibilidad con el código existente:

```javascript
const ticketService = require('./services/ticketService');

// Uso simple - igual que antes
const ticket = await ticketService.createTicket(data);
```

### Uso con Inyección de Dependencias (para testing)

```javascript
const { TicketService } = require('./services/ticketService');
const { TicketRepository, CommentRepository } = require('./repositories');

// Mock del pool
const mockPool = {
    query: jest.fn(),
    connect: jest.fn(),
};

// Crear repositorios con pool mockeado
const ticketRepo = new TicketRepository(mockPool);
const commentRepo = new CommentRepository(mockPool);

// Inyectar dependencias en el servicio
const ticketService = new TicketService({
    ticketRepository: ticketRepo,
    commentRepository: commentRepo,
});

// Ahora puedes controlar las respuestas del mock
mockPool.query.mockResolvedValue({ rows: [{ id: 1, reference: 'T-123' }] });
const ticket = await ticketService.getTicketByReference('T-123');
```

### Uso del RepositoryContainer

```javascript
const { getPool } = require('./db');
const { getRepositoryContainer } = require('./repositories');

// Obtener el contenedor singleton
const container = getRepositoryContainer(getPool());

// Acceder a repositorios con lazy loading
const tickets = await container.tickets.findAll();
const users = await container.users.findAllTechnicians();
const notifications = await container.notifications.findUnread(userId);
```

## 📚 Métodos de Repositorios

### TicketRepository

| Método | Descripción |
|--------|-------------|
| `create(data)` | Crea un nuevo ticket |
| `findById(id)` | Busca ticket por ID |
| `findByReference(reference)` | Busca ticket por referencia |
| `findByEditToken(token)` | Busca por token de edición |
| `updateByToken(token, updates)` | Actualiza por token |
| `updateStatus(id, status)` | Cambia estado del ticket |
| `findAll(filters, limit, offset)` | Lista tickets paginados |
| `count(filters)` | Cuenta tickets |
| `getStats(filters)` | Obtiene estadísticas |
| `assign(ticketId, technicianId)` | Asigna técnico |
| `delete(id)` | Elimina ticket |

### CommentRepository

| Método | Descripción |
|--------|-------------|
| `create(data)` | Crea un comentario |
| `findById(id)` | Busca por ID |
| `findByTicketId(ticketId, includeInternal)` | Obtiene comentarios de un ticket |
| `countByTicketId(ticketId)` | Cuenta comentarios |
| `delete(id)` | Elimina comentario |

### NotificationRepository

| Método | Descripción |
|--------|-------------|
| `create(data)` | Crea notificación |
| `findUnread(userId, limit)` | Obtiene no leídas |
| `findAll(userId, limit, offset)` | Lista todas |
| `countUnread(userId)` | Cuenta no leídas |
| `markAsRead(id, userId)` | Marca como leída |
| `markAllAsRead(userId)` | Marca todas |
| `cleanOld()` | Limpia antiguas (>30 días) |
| `findUsersByRoles(roles)` | Busca usuarios por roles |

### UserRepository

| Método | Descripción |
|--------|-------------|
| `findById(id)` | Busca por ID |
| `findByUsername(username)` | Busca por username |
| `create(data)` | Crea usuario |
| `update(id, updates)` | Actualiza usuario |
| `delete(id)` | Elimina usuario |
| `findAll(limit, offset)` | Lista todos |
| `findAllTechnicians()` | Lista técnicos |
| `countByRole()` | Cuenta por rol |
| `exists(username)` | Verifica existencia |

### PermissionRepository

| Método | Descripción |
|--------|-------------|
| `getAllPermissions()` | Permisos por categoría |
| `getUserPermissions(userId)` | Permisos de usuario |
| `userHasPermission(userId, permission)` | Verifica permiso |
| `userHasAnyPermission(userId, permissions)` | Verifica algún permiso |
| `getAllRoles()` | Lista todos los roles |
| `getRoleById(roleId)` | Rol con permisos |
| `getRoleByName(name)` | Rol por nombre |
| `createRole(data)` | Crea rol |
| `updateRole(roleId, data)` | Actualiza rol |
| `deleteRole(roleId)` | Elimina rol |
| `countUsersByRole()` | Usuarios por rol |

## 🧪 Testing

Ver `tests/repositories.test.js` para ejemplos de cómo testear con mocks:

```javascript
import { describe, it, expect, vi } from 'vitest';
const TicketRepository = require('../src/repositories/TicketRepository');

// Mock del pool
const createMockPool = () => ({
    query: vi.fn(),
    connect: vi.fn(),
});

describe('TicketRepository', () => {
    it('findById debe buscar ticket por ID', async () => {
        const mockPool = createMockPool();
        const ticketRepo = new TicketRepository(mockPool);
        
        mockPool.query.mockResolvedValue({ 
            rows: [{ id: 1, reference: 'T-241213-ABC123' }] 
        });

        const result = await ticketRepo.findById(1);

        expect(result).toEqual({ id: 1, reference: 'T-241213-ABC123' });
        expect(mockPool.query).toHaveBeenCalledWith(
            'SELECT * FROM tickets WHERE id = $1',
            [1]
        );
    });
});
```

## ⚙️ Transacciones

El `BaseRepository` proporciona un método `withTransaction` para operaciones que requieren transacciones:

```javascript
const result = await ticketRepo.withTransaction(async (client) => {
    // Todas las operaciones usan el mismo cliente
    await client.query('INSERT INTO tickets ...');
    await client.query('INSERT INTO notifications ...');
    
    // Si hay error, se hace rollback automático
    return { success: true };
});
```

## 🔄 Migración desde Modelos

Los archivos en `src/models/` ahora son **legacy** y se mantienen para compatibilidad. Todo el código nuevo debe usar:

1. **Servicios** para lógica de negocio
2. **Repositorios** para acceso a datos

Los modelos existentes pueden ser eliminados gradualmente una vez que todo el código migre a repositorios.
