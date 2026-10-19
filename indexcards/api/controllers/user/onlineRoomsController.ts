import type { Response } from 'express';
import type { ValidatedRequest } from '../../middleware/validation.js';
import { getPerson } from '../../middleware/auth/authorization.js';
import { Conflict, NotFound, ServiceUnavailable } from '../../helpers/problem.js';
import { db } from '../../data/database.js';
import { getSectionRoom as getRoom, joinSectionRoom as joinRoom } from '../../services/onlineRooms/onlineRoomService.js';

// The section's online room as the person sees it: whether they can join, and what to show if not
export async function getSectionRoom(req: ValidatedRequest, res: Response) {
	const person = getPerson(req);
	const sectionId: number = req.params.sectionId;
	const isStaff = await req.actor.can('panel', 'check', sectionId);

	const room = await getRoom(db, sectionId, person, { observer: req.query.observer, isStaff });
	if (!room) return NotFound(req, res, `Section ${sectionId} not found`);

	return res.status(200).json(room.display);
}

// Joins the section's online room: logs the join and returns the link, or the Campus token to post
export async function joinSectionRoom(req: ValidatedRequest, res: Response) {
	const person = getPerson(req);
	const sectionId: number = req.params.sectionId;
	const isStaff = await req.actor.can('panel', 'check', sectionId);

	const joined = await joinRoom(db, sectionId, person, { observer: req.query.observer, isStaff });

	switch (joined.result) {
		case 'notFound':
			return NotFound(req, res, `Section ${sectionId} not found`);
		case 'notJoinable':
			return Conflict(req, res, 'This room can\'t be joined online');
		case 'unavailable':
			return ServiceUnavailable(req, res, 'NSDA Campus rooms are unavailable right now');
		case 'joined':
			return res.status(201).json(joined.join);
	}
}
