const express = require('express');
const bcrypt = require('bcryptjs');
const { getPool } = require('../db');
const { STATUSES, listTickets, findByReference, updateStatusById } = require('../models/tickets');

const router = express.Router();

function requireAdmin(req, res, next) {
	if (req.session && req.session.user && req.session.user.role === 'admin') return next();
	return res.redirect('/admin/login');
}

router.get('/login', (req, res) => {
	res.render('admin/login', { title: 'Acceso Admin', error: null });
});

router.post('/login', async (req, res) => {
	const { username, password } = req.body;
	if (!username || !password) return res.render('admin/login', { title: 'Acceso Admin', error: 'Credenciales inválidas' });
	const { rows } = await getPool().query('SELECT * FROM users WHERE username = $1', [username]);
	const user = rows[0];
	if (!user) return res.render('admin/login', { title: 'Acceso Admin', error: 'Usuario o contraseña incorrectos' });
	const ok = bcrypt.compareSync(password, user.password_hash);
	if (!ok) return res.render('admin/login', { title: 'Acceso Admin', error: 'Usuario o contraseña incorrectos' });
	req.session.user = { id: user.id, username: user.username, role: user.role };
	res.redirect('/admin');
});

router.post('/logout', (req, res) => {
	req.session.destroy(() => {
		res.redirect('/admin/login');
	});
});

router.get('/', requireAdmin, async (req, res) => {
	const { status, priority, support_type } = req.query;
	const tickets = await listTickets({ status, priority, support_type }, 200, 0);
	res.render('admin/list', { title: 'Panel Admin', tickets, filters: { status, priority, support_type }, STATUSES, user: req.session.user });
});

router.get('/tickets/:reference', requireAdmin, async (req, res) => {
	const ticket = await findByReference(req.params.reference);
	if (!ticket) return res.status(404).send('Ticket no encontrado');
	res.render('admin/detail', { title: `Admin - ${ticket.reference}`, ticket, STATUSES, user: req.session.user });
});

router.post('/tickets/:reference/estado', requireAdmin, async (req, res) => {
	const ticket = await findByReference(req.params.reference);
	if (!ticket) return res.status(404).send('Ticket no encontrado');
	const { status } = req.body;
	try {
		await updateStatusById(ticket.id, status);
		res.redirect(`/admin/tickets/${ticket.reference}`);
	} catch (e) {
		res.status(400).send('Estado inválido');
	}
});

module.exports = router;

