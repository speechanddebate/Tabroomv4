import permissionRepo from '../../repos/permissionRepo.js';
import eventRepo from '../../repos/eventRepo.js';
import judgeRepo from '../../repos/judgeRepo.js';
import panelRepo from '../../repos/panelRepo.js';
import categoryRepo from '../../repos/categoryRepo.js';
import entryRepo from '../../repos/entryRepo.js';
import schoolRepo from '../../repos/schoolRepo.js';
import { BadRequest, NotFound, NotImplemented } from '../../helpers/problem.js';
import type { Database } from '../../data/database.js';
import type { Request, Response, NextFunction } from 'express';
import type { Perm } from './types.js';

/** fetch a person's perms for a tourn */
async function loadTournPerms(db: Database, personId: number, tournId: number): Promise<Perm[]> {
	const perms = await permissionRepo.getPermissions(db, { tourn: tournId, person: personId });

	// Collect unique event IDs for batch enrichment (only need categoryId)
	const eventIds = new Set<number>();

	for (const perm of perms) {
		if (perm.event) eventIds.add(perm.event);
	}

	// Batch fetch categoryId for events
	const eventMap = new Map();

	if (eventIds.size > 0) {
		const events = await eventRepo.getEvents(db, { ids: Array.from(eventIds) });
		for (const event of events) {
			eventMap.set(event.id, event.category);
		}
	}

	const result: Perm[] = [];

	for (const perm of perms) {
		let scope = null;
		let id = null;
		let categoryId = null;
		let permTournId = null;

		if (perm.event) {
			//event level perm
			scope = 'event';
			id = perm.event;
			categoryId = eventMap.get(perm.event);
			permTournId = perm.tourn; // already populated
		}
		else if (perm.category) {
			scope = 'category';
			id = perm.category;
			permTournId = perm.tourn; // already populated
		}
		else if (perm.tourn) {
			scope = 'tourn';
			id = perm.tourn;
			permTournId = perm.tourn;
		}

		if (scope && id && perm.tag) {
			result.push({
				scope,
				id,
				role: perm.tag,
				categoryId: categoryId || undefined,
				tournId: permTournId || undefined,
			});
		}
	}
	return result;
}

/** fetch a person's perms for a chapter */
async function loadChapterPerms(db: Database, personId: number, chapterId: number): Promise<Perm[]> {
	const perms = await permissionRepo.getPermissions(db, {
		person: personId,
		chapter: chapterId,
	});

	const result: Perm[] = [];

	for (const perm of perms) {
		if (!perm.chapter) continue;
		result.push({
			scope: 'chapter',
			id: perm.chapter,
			role: perm.tag === 'chapter' ? 'chapterAdmin' : 'prefs',
		});
	}
	return result;
}

/**
 * fetch a person's perms for a judge: self when the person is the judge,
 * plus their perms for the judge's tourn (so tourn/category/event roles apply)
 */
async function loadJudgePerms(
	db: Database,
	personId: number,
	judge: { id: number, person: number | null, category: number | null },
): Promise<Perm[]> {
	const category = judge.category ? await categoryRepo.getCategory(db, judge.category) : undefined;
	const result: Perm[] = [];

	if (judge.person === personId) {
		result.push({
			scope: 'judge',
			id: judge.id,
			role: 'self',
			categoryId: category?.id,
			tournId: category?.tourn ?? undefined,
		});
	}

	if (category?.tourn) {
		result.push(...await loadTournPerms(db, personId, category.tourn));
	}
	return result;
}

/** a path param as a positive integer id, or null when malformed */
function paramId(value: string): number | null {
	const id = Number(value);
	return Number.isInteger(id) && id > 0 ? id : null;
}

/** router.param adapter: grant the actor its perms for the :tournId tourn */
export async function loadTournAuthContext(req: Request, res: Response, next: NextFunction, tournId: string) {
	const id = paramId(tournId);
	if (!id) return BadRequest(req, res, 'tournId must be a positive integer');
	if(req.actor.type === 'anonymous') return next();
	if(req.actor.type !== 'person') return NotImplemented(req, res, `Auth context for ${req.actor.type} actors is not implemented`);

	try {
		req.actor.grant(await loadTournPerms(req.db, req.actor.Person.id, id));
		next();
	} catch (err) {
		next(err);
	}
}

/** router.param adapter: grant the actor its perms for the :chapterId chapter */
export async function loadChapterAuthContext(req: Request, res: Response, next: NextFunction, chapterId: string) {
	const id = paramId(chapterId);
	if (!id) return BadRequest(req, res, 'chapterId must be a positive integer');
	if(req.actor.type === 'anonymous') return next();
	if(req.actor.type !== 'person') return NotImplemented(req, res, `Auth context for ${req.actor.type} actors is not implemented`);

	try {
		req.actor.grant(await loadChapterPerms(req.db, req.actor.Person.id, id));
		next();
	} catch (err) {
		next(err);
	}
}

/** router.param adapter: 404 if the :judgeId judge doesn't exist, then grant the actor its perms for it */
export async function loadJudgeAuthContext(req: Request, res: Response, next: NextFunction, judgeId: string) {
	const id = paramId(judgeId);
	if (!id) return BadRequest(req, res, 'judgeId must be a positive integer');
	if(req.actor.type === 'anonymous') return next();
	if(req.actor.type !== 'person') return NotImplemented(req, res, `Auth context for ${req.actor.type} actors is not implemented`);

	try {
		const judge = await judgeRepo.getJudge(req.db, id);
		if (!judge) {
			return NotFound(req, res, `Judge ${judgeId} not found`);
		}
		req.actor.grant(await loadJudgePerms(req.db, req.actor.Person.id, judge));
		next();
	} catch (err) {
		next(err);
	}
}

/**
 * router.param adapter: 404 if the :schoolId school doesn't exist, then grant the actor
 * its perms for the school's chapter (coaches) and tourn (tabbers)
 */
export async function loadSchoolAuthContext(req: Request, res: Response, next: NextFunction, schoolId: string) {
	const id = paramId(schoolId);
	if (!id) return BadRequest(req, res, 'schoolId must be a positive integer');
	if(req.actor.type === 'anonymous') return next();
	if(req.actor.type !== 'person') return NotImplemented(req, res, `Auth context for ${req.actor.type} actors is not implemented`);

	try {
		const school = await schoolRepo.getSchool(req.db, id);
		if (!school) {
			return NotFound(req, res, `School ${schoolId} not found`);
		}
		const personId = req.actor.Person.id;
		const [chapterPerms, tournPerms] = await Promise.all([
			school.chapter ? loadChapterPerms(req.db, personId, school.chapter) : [],
			school.tourn ? loadTournPerms(req.db, personId, school.tourn) : [],
		]);
		req.actor.grant([...chapterPerms, ...tournPerms]);
		next();
	} catch (err) {
		next(err);
	}
}

/**
 * router.param adapter: 404 if the :entryId entry doesn't exist, then grant the actor self when
 * one of its unretired students is on the entry, plus its perms for the entry's chapter and tourn
 */
export async function loadEntryAuthContext(req: Request, res: Response, next: NextFunction, entryId: string) {
	const id = paramId(entryId);
	if (!id) return BadRequest(req, res, 'entryId must be a positive integer');
	if(req.actor.type === 'anonymous') return next();
	if(req.actor.type !== 'person') return NotImplemented(req, res, `Auth context for ${req.actor.type} actors is not implemented`);

	try {
		const entry = await entryRepo.getEntry(req.db, id);
		if (!entry) {
			return NotFound(req, res, `Entry ${entryId} not found`);
		}
		const personId = req.actor.Person.id;
		const [onEntry, school, event] = await Promise.all([
			entryRepo.getEntry(req.db, id, { person: personId }),
			entry.school ? schoolRepo.getSchool(req.db, entry.school) : undefined,
			// entry.tourn is null or wrong on some rows, so the tourn comes from the event
			entry.event ? eventRepo.getEvent(req.db, entry.event) : undefined,
		]);
		const tournId = event?.tourn ?? undefined;
		const [chapterPerms, tournPerms] = await Promise.all([
			school?.chapter ? loadChapterPerms(req.db, personId, school.chapter) : [],
			tournId ? loadTournPerms(req.db, personId, tournId) : [],
		]);

		req.actor.grant([
			...onEntry ? [{ scope: 'entry', id, role: 'self', categoryId: event?.category ?? undefined, tournId }] : [],
			...chapterPerms,
			...tournPerms,
		]);
		next();
	} catch (err) {
		next(err);
	}
}

/**
 * router.param adapter: 404 if the :panelId panel doesn't exist.
 * grants nothing yet; panel-scoped grants (e.g. ballot entry for a room) will load here.
 * how the panel relates to the rest of the path (a judge's ballot, a round) is checked by policy middleware on each router
 */
export async function loadPanelAuthContext(req: Request, res: Response, next: NextFunction, panelId: string) {
	const id = paramId(panelId);
	if (!id) return BadRequest(req, res, 'panelId must be a positive integer');
	if(req.actor.type === 'anonymous') return next();
	if(req.actor.type !== 'person') return NotImplemented(req, res, `Auth context for ${req.actor.type} actors is not implemented`);

	try {
		if (!await panelRepo.getPanel(req.db, id)) {
			return NotFound(req, res, `Panel ${panelId} not found`);
		}
		next();
	} catch (err) {
		next(err);
	}
}
