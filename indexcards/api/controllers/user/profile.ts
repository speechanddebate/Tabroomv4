import type { Response } from 'express';
import type { UserProfileUpdate } from '@tabroom/types';
import { BadRequest, Conflict, Forbidden, NotFound } from '../../helpers/problem.js';
import logger from '../../helpers/logger.js';
import type { ValidatedRequest } from '../../middleware/validation.js';
import { getPerson } from '../../middleware/auth/authorization.js';
import { db } from '../../data/database.js';
import { getProfile, updateProfile } from '../../services/profile/profileService.js';

export async function show(req: ValidatedRequest, res: Response) {
	const profile = await getProfile(db, getPerson(req).id);
	if (!profile) return NotFound(req, res, 'Your account was not found');
	res.json(profile);
}

export async function update(req: ValidatedRequest, res: Response) {
	const person = getPerson(req);
	const changes = req.body as UserProfileUpdate;
	const outcome = await updateProfile(db, person.id, changes);

	if (outcome.result === 'notFound') return NotFound(req, res, 'Your account was not found');
	if (outcome.result === 'forcedPasswordChange') return Forbidden(req, res, 'Change your password before editing your profile');
	if (outcome.result === 'invalid') return BadRequest(req, res, 'Some fields need attention', outcome.issues);
	if (outcome.result === 'phoneTaken') return Conflict(req, res, 'That phone number is already in use on another account', { issues: outcome.issues });

	const by = req.auth.su ? ` by ${req.auth.su.email} while su'd as ${person.email}` : '';
	logger.info(`Profile changed${by}: ${Object.keys(changes).join(', ')}`, {
		'event.name': 'account.profile.changed',
		person: person.id,
	});
	res.json(outcome.profile);
}
