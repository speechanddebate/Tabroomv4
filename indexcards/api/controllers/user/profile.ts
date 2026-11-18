import type { Response } from 'express';
import type { EmailConfirmRequest, UserPasswordChange, UserProfileUpdate } from '@tabroom/types';
import { BadRequest, Conflict, Forbidden, Gone, NotFound } from '../../helpers/problem.js';
import logger from '../../helpers/logger.js';
import type { ValidatedRequest } from '../../middleware/validation.js';
import { getPerson } from '../../middleware/auth/authorization.js';
import { db } from '../../data/database.js';
import { changePassword } from '../../services/AuthService.js';
import { notify } from '../../services/notifications/notify.js';
import { passwordChanged } from '../../services/notifications/templates/account/passwordChanged.js';
import { getProfile, updateProfile } from '../../services/profile/profileService.js';
import { confirmCode, resendConfirmation } from '../../services/profile/emailConfirm.js';
import { maskEmail } from '../../services/notifications/unsubscribe.js';

/** How an account log line credits an admin who is su'd as the person */
const suNote = (req: ValidatedRequest, email: string) => req.auth.su ? ` by ${req.auth.su.email} while su'd as ${email}` : '';

export async function show(req: ValidatedRequest, res: Response) {
	const profile = await getProfile(db, getPerson(req).id);
	if (!profile) return NotFound(req, res, 'Your account was not found');
	res.json(profile);
}

export async function update(req: ValidatedRequest, res: Response) {
	const person = getPerson(req);
	const { currentPassword: _password, ...changes } = req.body as UserProfileUpdate;
	const outcome = await updateProfile(db, person.id, req.body as UserProfileUpdate, { su: Boolean(req.auth.su) });

	if (outcome.result === 'notFound') return NotFound(req, res, 'Your account was not found');
	if (outcome.result === 'forcedPasswordChange') return Forbidden(req, res, 'Change your password before editing your profile');
	if (outcome.result === 'emailWhileSu') return Forbidden(req, res, 'Email changes can\'t be made while su\'d');
	if (outcome.result === 'invalid') return BadRequest(req, res, 'Some fields need attention', outcome.issues);
	if (outcome.result === 'wrongPassword') return Forbidden(req, res, 'That password isn\'t right', { issues: outcome.issues });
	if (outcome.result === 'phoneTaken') return Conflict(req, res, 'That phone number is already in use on another account', { issues: outcome.issues });
	if (outcome.result === 'emailTaken') return Conflict(req, res, 'That email is already in use', { issues: outcome.issues });

	logger.info(`Profile changed${suNote(req, person.email)}: ${Object.keys(changes).join(', ')}`, {
		'event.name': 'account.profile.changed',
		person: person.id,
	});
	if (outcome.emailChanged) {
		logger.info(`Email changed from ${maskEmail(person.email)} to ${maskEmail(outcome.profile.email)}`, {
			'event.name': 'account.email.changed',
			person: person.id,
		});
	}
	res.json(outcome.profile);
}

/** What the person is told when the service turns down the password they chose */
const REFUSED_PASSWORD = {
	sameAsCurrent: 'Choose a password different from your current one',
	bannedWord: 'Choose a password without common speech and debate words, such as debate, speech, or congress',
	isEmailOrName: 'Choose a password that isn\'t your email or your name',
};

export async function changeOwnPassword(req: ValidatedRequest, res: Response) {
	const person = getPerson(req);
	if (req.auth.su) return Forbidden(req, res, 'Passwords can\'t be changed while su\'d');

	const { currentPassword, newPassword } = req.body as UserPasswordChange;
	const outcome = await changePassword(person.id, req.auth.sessionId, currentPassword, newPassword);

	if (outcome === 'notFound') return NotFound(req, res, 'Your account was not found');
	if (outcome === 'wrongPassword') {
		return Forbidden(req, res, 'That password isn\'t right', {
			issues: [{ path: ['currentPassword'], message: 'That password isn\'t right', code: 'custom' }],
		});
	}
	if (outcome !== 'changed') {
		return BadRequest(req, res, 'Some fields need attention', [{ path: ['newPassword'], message: REFUSED_PASSWORD[outcome], code: 'custom' }]);
	}

	logger.info('Password changed, other sessions ended', { 'event.name': 'account.password.changed', person: person.id });

	// The password is already changed; a notice that can't be queued mustn't read as a failed change
	try {
		const { subject, html } = passwordChanged();
		await notify({
			ids: [person.id],
			subject,
			html: html.value,
			kind: 'account',
			priority: 'high',
			channels: { inbox: false, push: false },
		});
	} catch (error) {
		logger.error(`Could not queue the password changed notice for person ${person.id}`, {
			'event.name': 'account.password.notice.exception',
			error,
		});
	}
	res.status(204).end();
}

export async function confirmEmail(req: ValidatedRequest, res: Response) {
	const person = getPerson(req);
	const outcome = await confirmCode(db, person.id, (req.body as EmailConfirmRequest).code);

	if (outcome === 'notFound') return NotFound(req, res, 'Your account was not found');
	if (outcome === 'wrong') {
		return BadRequest(req, res, 'That code isn\'t right', [
			{ path: ['code'], message: 'That code isn\'t right. Check the most recent email we sent.', code: 'custom' },
		]);
	}
	if (outcome === 'expired') return Gone(req, res, 'Your code has expired. Send a new one.');

	if (outcome === 'confirmed') {
		logger.info(`Email confirmed${suNote(req, person.email)}`, { 'event.name': 'account.email.confirmed', person: person.id });
	}
	res.status(204).end();
}

export async function resendEmailConfirmation(req: ValidatedRequest, res: Response) {
	const person = getPerson(req);
	const outcome = await resendConfirmation(db, person.id);

	if (outcome === 'notFound') return NotFound(req, res, 'Your account was not found');
	if (outcome === 'alreadyConfirmed') return Conflict(req, res, 'Your email address is already confirmed');

	logger.info(`Email confirmation sent${suNote(req, person.email)}`, { 'event.name': 'account.email.confirmation_sent', person: person.id });
	res.status(202).end();
}
