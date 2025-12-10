/**
 * Exportación centralizada de middlewares
 */
module.exports = {
	...require('./auth'),
	...require('./security'),
	...require('./errorHandler'),
	...require('./upload'),
};
