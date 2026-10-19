import type { Response } from 'express';
import type { ValidatedRequest } from '../../middleware/validation.js';
import { getPerson } from '../../middleware/auth/authorization.js';
import { NotFound } from '../../helpers/problem.js';
import { db } from '../../data/database.js';
import { getSectionRoom as getRoom } from '../../services/onlineRooms/onlineRoomService.js';

// The section's online room as the person sees it: whether they can join, and what to show if not
export async function getSectionRoom(req: ValidatedRequest, res: Response) {
	const person = getPerson(req);
	const sectionId: number = req.params.sectionId;
	const isStaff = await req.actor.can('panel', 'check', sectionId);

	const room = await getRoom(db, sectionId, person, { observer: req.query.observer, isStaff });
	if (!room) return NotFound(req, res, `Section ${sectionId} not found`);

	return res.status(200).json(room.display);
}
