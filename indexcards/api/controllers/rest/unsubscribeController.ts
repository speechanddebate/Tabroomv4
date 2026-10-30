import type { Response } from 'express';
import config from '../../config.js';
import { db } from '../../data/database.js';
import logger from '../../helpers/logger.js';
import { NotFound } from '../../helpers/problem.js';
import type { ValidatedRequest } from '../../middleware/validation.js';
import personRepo from '../../repos/personRepo.js';
import { maskEmail, matchesUnsubscribeToken, verifyUnsubscribeToken } from '../../services/notifications/unsubscribe.js';

/** The person a token is for, or null when it is not ours, expired, for nobody, or issued to an address they no longer have */
async function personForToken(token: string) {
	const claims = await verifyUnsubscribeToken(token);
	if (!claims) return null;

	const person = await db.selectFrom('person')
		.select(['id', 'email', 'no_email'])
		.where('id', '=', claims.id)
		.executeTakeFirst();
	if (!person || !matchesUnsubscribeToken(person, claims)) return null;

	return person;
}

// Every refusal is the same 404, so a token tells nothing about whether its id exists
const notRecognized = (req: ValidatedRequest, res: Response) => NotFound(req, res, 'This unsubscribe link is not recognized');

/**
 * Who the link is for and whether it was already used. Changes nothing: link prefetchers
 * and security scanners fetch every link in an email, so a GET must never opt someone out.
 * A browser that opened the link (a mail client that showed the header URL instead of
 * POSTing it) is sent to the page that has the button
 */
async function status(req: ValidatedRequest, res: Response) {
	const { token } = req.params as { token: string };

	if (req.accepts(['json', 'html']) === 'html') {
		return res.redirect(302, `${config.schemats_url}/unsubscribe/${encodeURIComponent(token)}`);
	}

	const person = await personForToken(token);
	if (!person) return notRecognized(req, res);

	return res.json({ email: maskEmail(person.email), noEmail: person.no_email === 1 });
}

/**
 * Opts the person out of Tabroom email. Also the RFC 8058 one-click target: mail providers
 * POST here with no cookie and a form body, which passes CSRF because only cookie sessions
 * are checked. Using a link twice is fine
 */
async function unsubscribe(req: ValidatedRequest, res: Response) {
	const { token } = req.params as { token: string };

	const person = await personForToken(token);
	if (!person) return notRecognized(req, res);

	if (person.no_email !== 1) {
		await personRepo.updatePerson(db, person.id, { no_email: 1 });
		logger.info(`Person ${person.id} unsubscribed from email through their link`);
	}

	return res.json({ unsubscribed: true, email: maskEmail(person.email) });
}

export default { status, unsubscribe };
