# Sistema de Tickets de Soporte

## Requisitos
- Node.js 18+

## Configuración
1. Copia `.env.example` a `.env` y ajusta valores.
2. Instala dependencias:
   ```bash
   npm install
   ```

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
- Listado: `http://localhost:3000/tickets`
- Admin: `http://localhost:3000/admin` (usuario/contraseña por defecto en `.env`)

## Funciones
- Crear ticket con imagen opcional, AnyDesk y correo opcional.
- Referencia única y estado inicial "Pendiente".
- Filtros por Estado, Prioridad y Tipo de Soporte.
- Vista detalle con imagen y AnyDesk.
- Edición pública vía token (no cambia estado).
- Panel admin para cambiar estado.
- Envío de correo (si configuras SMTP).
