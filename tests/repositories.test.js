/**
 * Tests para los Repositorios
 * Demuestra cómo usar inyección de dependencias para testing aislado
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock del pool de PostgreSQL
const createMockPool = () => ({
    query: vi.fn(),
    connect: vi.fn(),
});

// Importar repositorios
const BaseRepository = require('../src/repositories/BaseRepository');
const TicketRepository = require('../src/repositories/TicketRepository');
const CommentRepository = require('../src/repositories/CommentRepository');
const NotificationRepository = require('../src/repositories/NotificationRepository');
const UserRepository = require('../src/repositories/UserRepository');
const PermissionRepository = require('../src/repositories/PermissionRepository');

describe('BaseRepository', () => {
    it('debe requerir un pool de conexión', () => {
        expect(() => new BaseRepository()).toThrow('Pool de base de datos es requerido');
    });

    it('debe crear instancia correctamente con pool', () => {
        const mockPool = createMockPool();
        const repo = new BaseRepository(mockPool);
        expect(repo.pool).toBe(mockPool);
    });

    it('queryOne debe retornar la primera fila', async () => {
        const mockPool = createMockPool();
        mockPool.query.mockResolvedValue({ rows: [{ id: 1, name: 'test' }] });

        const repo = new BaseRepository(mockPool);
        const result = await repo.queryOne('SELECT * FROM test WHERE id = $1', [1]);

        expect(result).toEqual({ id: 1, name: 'test' });
        expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM test WHERE id = $1', [1]);
    });

    it('queryOne debe retornar null si no hay resultados', async () => {
        const mockPool = createMockPool();
        mockPool.query.mockResolvedValue({ rows: [] });

        const repo = new BaseRepository(mockPool);
        const result = await repo.queryOne('SELECT * FROM test WHERE id = $1', [999]);

        expect(result).toBeNull();
    });

    it('queryAll debe retornar todas las filas', async () => {
        const mockPool = createMockPool();
        const mockData = [{ id: 1 }, { id: 2 }, { id: 3 }];
        mockPool.query.mockResolvedValue({ rows: mockData });

        const repo = new BaseRepository(mockPool);
        const result = await repo.queryAll('SELECT * FROM test');

        expect(result).toEqual(mockData);
    });

    it('withTransaction debe hacer rollback en caso de error', async () => {
        const mockClient = {
            query: vi.fn(),
            release: vi.fn(),
        };
        const mockPool = createMockPool();
        mockPool.connect.mockResolvedValue(mockClient);

        mockClient.query.mockImplementation((sql) => {
            if (sql === 'BEGIN' || sql === 'ROLLBACK') {
                return Promise.resolve();
            }
            throw new Error('DB Error');
        });

        const repo = new BaseRepository(mockPool);

        await expect(repo.withTransaction(async (client) => {
            await client.query('INSERT INTO test VALUES (1)');
        })).rejects.toThrow('DB Error');

        expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
        expect(mockClient.release).toHaveBeenCalled();
    });
});

describe('TicketRepository', () => {
    let mockPool;
    let ticketRepo;

    beforeEach(() => {
        mockPool = createMockPool();
        ticketRepo = new TicketRepository(mockPool);
    });

    it('debe exponer constantes de tipos de soporte', () => {
        expect(TicketRepository.SUPPORT_TYPES).toContain('Hardware');
        expect(TicketRepository.SUPPORT_TYPES).toContain('Software');
    });

    it('debe exponer constantes de prioridades', () => {
        expect(TicketRepository.PRIORITIES).toHaveLength(4);
    });

    it('debe exponer constantes de estados', () => {
        expect(TicketRepository.STATUSES).toContain('Pendiente');
        expect(TicketRepository.STATUSES).toContain('Resuelto');
    });

    it('findById debe buscar ticket por ID', async () => {
        const mockTicket = { id: 1, reference: 'T-241213-ABC123' };
        mockPool.query.mockResolvedValue({ rows: [mockTicket] });

        const result = await ticketRepo.findById(1);

        expect(result).toEqual(mockTicket);
        expect(mockPool.query).toHaveBeenCalledWith(
            'SELECT * FROM tickets WHERE id = $1',
            [1]
        );
    });

    it('findById debe retornar null si no existe', async () => {
        mockPool.query.mockResolvedValue({ rows: [] });

        const result = await ticketRepo.findById(999);

        expect(result).toBeNull();
    });

    it('updateStatus debe lanzar error para estado inválido', async () => {
        await expect(ticketRepo.updateStatus(1, 'EstadoInvalido'))
            .rejects.toThrow('Estado inválido');
    });

    it('updateStatus debe actualizar estado válido', async () => {
        const mockTicket = { id: 1, status: 'Resuelto' };
        mockPool.query.mockResolvedValue({ rows: [mockTicket] });

        const result = await ticketRepo.updateStatus(1, 'Resuelto');

        expect(result.status).toBe('Resuelto');
    });

    it('count debe retornar el número de tickets', async () => {
        mockPool.query.mockResolvedValue({ rows: [{ total: '42' }] });

        const result = await ticketRepo.count({});

        expect(result).toBe(42);
    });
});

describe('CommentRepository', () => {
    let mockPool;
    let commentRepo;

    beforeEach(() => {
        mockPool = createMockPool();
        commentRepo = new CommentRepository(mockPool);
    });

    it('findByTicketId debe incluir comentarios internos si se solicita', async () => {
        const mockComments = [{ id: 1, is_internal: false }, { id: 2, is_internal: true }];
        mockPool.query.mockResolvedValue({ rows: mockComments });

        await commentRepo.findByTicketId(1, true);

        const query = mockPool.query.mock.calls[0][0];
        expect(query).not.toContain('is_internal = false');
    });

    it('findByTicketId debe filtrar comentarios internos por defecto', async () => {
        mockPool.query.mockResolvedValue({ rows: [] });

        await commentRepo.findByTicketId(1, false);

        const query = mockPool.query.mock.calls[0][0];
        expect(query).toContain('is_internal = false');
    });
});

describe('NotificationRepository', () => {
    let mockPool;
    let notificationRepo;

    beforeEach(() => {
        mockPool = createMockPool();
        notificationRepo = new NotificationRepository(mockPool);
    });

    it('countUnread debe retornar el conteo correcto', async () => {
        mockPool.query.mockResolvedValue({ rows: [{ count: '5' }] });

        const result = await notificationRepo.countUnread(1);

        expect(result).toBe(5);
    });

    it('markAsRead debe actualizar la notificación correcta', async () => {
        mockPool.query.mockResolvedValue({ rowCount: 1 });

        await notificationRepo.markAsRead(100, 1);

        expect(mockPool.query).toHaveBeenCalledWith(
            'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
            [100, 1]
        );
    });
});

describe('UserRepository', () => {
    let mockPool;
    let userRepo;

    beforeEach(() => {
        mockPool = createMockPool();
        userRepo = new UserRepository(mockPool);
    });

    it('exists debe retornar true si usuario existe', async () => {
        mockPool.query.mockResolvedValue({ rows: [{ exists: true }] });

        const result = await userRepo.exists('admin');

        expect(result).toBe(true);
    });

    it('exists debe retornar false si usuario no existe', async () => {
        mockPool.query.mockResolvedValue({ rows: [{ exists: false }] });

        const result = await userRepo.exists('noexiste');

        expect(result).toBe(false);
    });

    it('findAllTechnicians debe ordenar por rol y nombre', async () => {
        mockPool.query.mockResolvedValue({ rows: [] });

        await userRepo.findAllTechnicians();

        const query = mockPool.query.mock.calls[0][0];
        expect(query).toContain('ORDER BY');
        expect(query).toContain("WHEN 'admin' THEN 1");
    });
});

describe('PermissionRepository', () => {
    let mockPool;
    let permissionRepo;

    beforeEach(() => {
        mockPool = createMockPool();
        permissionRepo = new PermissionRepository(mockPool);
    });

    it('userHasPermission debe retornar boolean', async () => {
        mockPool.query.mockResolvedValue({ rows: [{ has_permission: true }] });

        const result = await permissionRepo.userHasPermission(1, 'view_tickets');

        expect(result).toBe(true);
    });

    it('userHasAnyPermission debe verificar array de permisos', async () => {
        mockPool.query.mockResolvedValue({ rows: [{ has_permission: false }] });

        const result = await permissionRepo.userHasAnyPermission(1, ['manage_users', 'manage_roles']);

        expect(result).toBe(false);
        expect(mockPool.query).toHaveBeenCalledWith(
            expect.stringContaining('p.name = ANY($2)'),
            [1, ['manage_users', 'manage_roles']]
        );
    });
});
