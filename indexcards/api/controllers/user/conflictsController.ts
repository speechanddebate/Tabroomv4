import type { Response } from 'express';
import type { ConflictPersonMatch, StandingConflictRefusal, StandingConflictRequest } from '@tabroom/types';
import { BadRequest, Conflict, NotFound } from '../../helpers/problem.js';
import type { ValidatedRequest } from '../../middleware/validation.js';
import { getPerson } from '../../middleware/auth/authorization.js';
import { db } from '../../data/database.js';
import chapterRepo from '../../repos/chapterRepo.js';
import judgeRepo from '../../repos/judgeRepo.js';
import personRepo from '../../repos/personRepo.js';
import { addStandingConflict, listStandingConflicts, removeStandingConflict } from '../../services/conflicts/standingConflicts.js';

const REFUSALS: Record<StandingConflictRefusal, string> = {
	duplicate: 'That is already one of your standing conflicts',
	self: "You can't conflict yourself",
};

export async function list(req: ValidatedRequest, res: Response) {
	res.json(await listStandingConflicts(db, getPerson(req).id));
}

/** Classic's judge conflicts page rule: a first name alone is too wide a net */
export async function searchPeople(req: ValidatedRequest, res: Response) {
	const { first, last, email } = req.query as { first?: string; last?: string; email?: string };
	if (!last && !email) return BadRequest(req, res, 'Give a last name or an email');
	const people = await personRepo.findPersons(db, { first, last, email }, { limit: 25, orderByName: true });
	const chapters = await judgeRepo.getJudgedChapters(db, people.map((person) => person.id));
	const matches: ConflictPersonMatch[] = people.map((person) => ({
		id: person.id,
		first: person.first,
		last: person.last,
		Chapters: chapters.filter((chapter) => chapter.person === person.id).map((chapter) => ({ id: chapter.id, name: chapter.name })),
	}));
	res.json(matches);
}

export async function searchChapters(req: ValidatedRequest, res: Response) {
	const { name } = req.query as { name: string };
	const chapters = await chapterRepo.getChapters(db, { namePrefix: name, limit: 25 });
	res.json(chapters.map((chapter) => ({ id: chapter.id, name: chapter.name, city: chapter.city, state: chapter.state })));
}

export async function add(req: ValidatedRequest, res: Response) {
	const request = req.body as StandingConflictRequest;
	const outcome = await addStandingConflict(db, getPerson(req), request);
	if (outcome.result === 'notFound') return NotFound(req, res, request.person !== undefined ? `Person ${request.person} not found` : `Chapter ${request.chapter} not found`);
	if (outcome.result === 'refused') return Conflict(req, res, REFUSALS[outcome.reason], { reason: outcome.reason });
	res.status(201).json(outcome.conflict);
}

export async function remove(req: ValidatedRequest, res: Response) {
	const conflictId = Number(req.params.conflictId);
	const outcome = await removeStandingConflict(db, getPerson(req), conflictId);
	if (outcome === null) return NotFound(req, res, `Standing conflict ${conflictId} not found`);
	res.status(204).end();
}
