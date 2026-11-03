import type { Request, Response } from 'express';
import type { ValidatedRequest } from '../../middleware/validation.js';
import { Conflict, NotFound, ServiceUnavailable } from '../../helpers/problem.js';
import { db } from '../../data/database.js';
import * as rooms from '../../services/onlineRooms/onlineRoomService.js';
import type { JoinRoomResult } from '../../services/onlineRooms/onlineRoomService.js';

// Sends a join's result: 201 with what to open, or the problem
function sendJoin(req: Request, res: Response, joined: JoinRoomResult, notFound: string) {
	switch (joined.result) {
		case 'notFound':
			return NotFound(req, res, notFound);
		case 'notJoinable':
			return Conflict(req, res, 'This room can\'t be joined online');
		case 'changed':
			return Conflict(req, res, 'This room has changed. Reload the rooms and try again');
		case 'unavailable':
			return ServiceUnavailable(req, res, 'NSDA Campus rooms are unavailable right now');
		case 'joined':
			return res.status(201).json(joined.join);
	}
}

// The section's online room as the person sees it: whether they can join, and what to show if not
export async function getSectionRoom(req: ValidatedRequest, res: Response) {
	const { tournId, sectionId } = req.params as { tournId: number, sectionId: number };

	const room = await rooms.getSectionRoom(db, tournId, sectionId, req.actor, { observer: req.query.observer });
	if (!room) return NotFound(req, res, `Section ${sectionId} not found`);

	return res.status(200).json(room.display);
}

// Joins the section's online room: logs the join and returns the link, or the Campus token to post
export async function joinSectionRoom(req: ValidatedRequest, res: Response) {
	const { tournId, sectionId } = req.params as { tournId: number, sectionId: number };

	const joined = await rooms.joinSectionRoom(db, tournId, sectionId, req.actor, { observer: req.query.observer });
	return sendJoin(req, res, joined, `Section ${sectionId} not found`);
}

// The school's squad room
export async function getSchoolRoom(req: ValidatedRequest, res: Response) {
	const { tournId, schoolId } = req.params as { tournId: number, schoolId: number };

	const room = await rooms.getSchoolRoom(db, tournId, schoolId, req.actor);
	if (!room) return NotFound(req, res, `School ${schoolId} has no squad room`);

	return res.status(200).json(room.display);
}

export async function joinSchoolRoom(req: ValidatedRequest, res: Response) {
	const { tournId, schoolId } = req.params as { tournId: number, schoolId: number };

	const joined = await rooms.joinSchoolRoom(db, tournId, schoolId, req.actor);
	return sendJoin(req, res, joined, `School ${schoolId} has no squad room`);
}

// The entry's prep room
export async function getEntryPrepRoom(req: ValidatedRequest, res: Response) {
	const { tournId, entryId } = req.params as { tournId: number, entryId: number };

	const room = await rooms.getEntryPrepRoom(db, tournId, entryId, req.actor);
	if (!room) return NotFound(req, res, `Entry ${entryId} has no prep room`);

	return res.status(200).json(room.display);
}

export async function joinEntryPrepRoom(req: ValidatedRequest, res: Response) {
	const { tournId, entryId } = req.params as { tournId: number, entryId: number };

	const joined = await rooms.joinEntryPrepRoom(db, tournId, entryId, req.actor);
	return sendJoin(req, res, joined, `Entry ${entryId} has no prep room`);
}

// The tourn's utility rooms the person can see
export async function getUtilityRooms(req: ValidatedRequest, res: Response) {
	const { tournId } = req.params as { tournId: number };

	const utilityRooms = await rooms.getUtilityRooms(db, tournId, req.actor);
	if (!utilityRooms) return NotFound(req, res, `Tournament ${tournId} not found`);

	return res.status(200).json(utilityRooms.map(room => room.display));
}

export async function joinUtilityRoom(req: ValidatedRequest, res: Response) {
	const { tournId, roomId } = req.params as { tournId: number, roomId: number };

	const joined = await rooms.joinUtilityRoom(db, tournId, roomId, req.body.name, req.actor);
	return sendJoin(req, res, joined, `Utility room ${roomId} not found`);
}
