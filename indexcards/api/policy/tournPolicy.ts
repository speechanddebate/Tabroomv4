import tournRepo from '../repos/tournRepo.js';
import { NotFound, BadRequest } from '../helpers/problem.js';
import { db } from '../data/database.js';
import { isPositiveId } from '../middleware/validation.js';

import type { Request, Response, NextFunction } from 'express';

// both run before the route's ValidateRequest, so they check the id themselves

/**
 * 404 for a hidden tourn, for everyone. These routes are the public view of a tourn (its invite,
 * schedule, results), and a hidden tourn has none, even for its own staff
 */
export async function requirePublicTourn(req: Request, res: Response, next: NextFunction) {

	if (!isPositiveId(req.params.tournId)) return BadRequest(req, res, 'tournId must be a positive integer');

	const tourn = await tournRepo.getTourn(db, req.params.tournId as string);

	if (!tourn?.id || tourn?.hidden) {
		return NotFound(req, res, 'No such tournament found');
	}
	req.tourn = tourn;
	next();
}

/**
 * requirePublicTourn for attendees: judges, coaches, and students can't find a hidden tourn,
 * but anyone on its staff (tourn.staff) and site admins still can
 */
export async function requirePublicForAttn(req: Request, res: Response, next: NextFunction) {

	if (!isPositiveId(req.params.tournId)) return BadRequest(req, res, 'tournId must be a positive integer');

	const tourn = await tournRepo.getTourn(db, req.params.tournId as string, { unpublished: true });

	if (!tourn?.id || (tourn.hidden && !await req.actor.can('tourn', 'staff', tourn.id))) {
		return NotFound(req, res, 'No such tournament found');
	}
	req.tourn = tourn;
	next();
}