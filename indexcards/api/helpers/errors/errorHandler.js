import logger from '../logger.js';
import { sendEmail } from '../../services/notifications/channels/email.js';
import { Forbidden, ServiceUnavailable, Unauthorized } from '../problem.js';
import config from '../../config.js';

/**
 * Mails the stack to ERROR_DESTINATION straight through sendEmail, never the queue, so the
 * report still goes out when Redis or the workers are down and is delivered immediately.
 * Error mail is a stopgap; the long-term home for these is logging and alerting, not inboxes
 */
async function mailAdmins(subject, text) {
	const addresses = config.ERROR_DESTINATION ?? [];
	if (addresses.length === 0) return;
	// sendEmail logs each rejected or retried send itself, so nothing to report here
	await Promise.allSettled(addresses.map((to) => sendEmail({ to, from: 'error-handler@tabroom.com', subject, text })));
}

export const errorHandler = (err, req, res, next) => {
	// MariaDB aborted a query that ran past db.pool.queryTimeout. Expected under load, so no admin email.
	// The DB logger already warned with the query, and the request logger records the 503
	if (err.code === 'ER_STATEMENT_TIMEOUT') {
		return ServiceUnavailable(req, res, 'The request took too long to process. Please try again later.');
	}

	// auth failures thrown from handlers, e.g. getPerson() or req.actor.assert()
	if (err.code === 'AUTH_UNAUTHENTICATED') {
		return Unauthorized(req, res, err.message);
	}
	if (err.code === 'AUTH_FORBIDDEN') {
		return Forbidden(req, res, err.message);
	}

	logger.error('Error while processing request', {
		message: err.message,
		url: req.originalUrl,
		method: req.method,
		stack: err.stack,
	});

	// Production bugs should find their way to Palmer
	if (
		process.env.NODE_ENV === 'production'
		|| req.originalUrl === '/v1/admin/mailtest/error'
	) {

		logger.info('Sending mail');

		const text = `
Host
${config.dockerhost}

Request URL
${req?.originalUrl}

Stack
${err.stack}

Login Session
${JSON.stringify({ auth: req.auth, person: req.person }, null, 4)}

Request Parameters
${JSON.stringify(req.params, null, 4)}

Request Body
${JSON.stringify(req.body, null, 4)}

Raw Full Error Object
${JSON.stringify(err, Object.getOwnPropertyNames(err))}`;

		// Not awaited, so the 500 response is not held for the relay
		void mailAdmins('Indexcards Bug Tripped', text).catch((error) => {
			logger.error('Error mail to the admins failed', { message: error.message });
		});
		err.message += ` Also, this stack was emailed to the admins to ${config.ERROR_DESTINATION}`;
	}

	return res.status(500).json({
		message          : err.message || 'Internal server error',
		host             : config.dockerhost,
		logCorrelationId : req.uuid,
		url              : req.originalUrl,
		path             : req.path,
		stack            : err.stack,
		env              : process.env,
		status           : 500,
		error            : true,
	});
};

export default errorHandler;
