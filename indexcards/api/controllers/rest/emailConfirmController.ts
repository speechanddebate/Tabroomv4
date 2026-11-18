import type { Response } from 'express';
import { db } from '../../data/database.js';
import logger from '../../helpers/logger.js';
import { Gone, NotFound } from '../../helpers/problem.js';
import type { ValidatedRequest } from '../../middleware/validation.js';
import { checkConfirmationToken, confirmWithToken, type TokenCheck } from '../../services/profile/emailConfirm.js';

/** A link that was never good and one a resend or address change replaced look the same, so ids and addresses don't leak */
function refused(req: ValidatedRequest, res: Response, check: TokenCheck) {
	if (check.result === 'expired') return Gone(req, res, 'This link has expired. Log in to get a new code.');
	return NotFound(req, res, 'This link no longer works. Log in to get a new code.');
}

export async function status(req: ValidatedRequest, res: Response) {
	const check = await checkConfirmationToken(db, req.params.token as string);
	if (check.result === 'ready') return res.json({ email: check.email, confirmed: false });
	if (check.result === 'alreadyConfirmed') return res.json({ email: check.email, confirmed: true });
	return refused(req, res, check);
}

export async function confirm(req: ValidatedRequest, res: Response) {
	const check = await confirmWithToken(db, req.params.token as string);
	if (check.result === 'ready') {
		logger.info('Email confirmed from the email link', { 'event.name': 'account.email.confirmed', person: check.personId });
	}
	if (check.result === 'ready' || check.result === 'alreadyConfirmed') return res.json({ confirmed: true, email: check.email });
	return refused(req, res, check);
}
