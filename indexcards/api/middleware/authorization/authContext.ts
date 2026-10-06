import permissionRepo from '../../repos/permissionRepo.js';
import eventRepo from '../../repos/eventRepo.js';
import type { Database } from '../../data/database.js';
import type { Request, Response, NextFunction } from 'express';
import type { Perm } from '../auth/types.js';

/** fetch a person's perms for a tourn */
export async function loadTournPerms(db: Database, personId: number, tournId: number): Promise<Perm[]> {
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
export async function loadChapterPerms(db: Database, personId: number, chapterId: number): Promise<Perm[]> {
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

/** router.param adapter: grant the actor its perms for the :tournId tourn */
export async function loadTournAuthContext(req: Request, res: Response, next: NextFunction, tournId: string) {
	// Unauthenticated request, skip loading perms
	const personId = req.actor?.Person?.id;
	if (!personId || !tournId) return next();

	try {
		req.actor.grant(await loadTournPerms(req.db, personId, parseInt(tournId)));
		next();
	} catch (err) {
		next(err);
	}
}

/** router.param adapter: grant the actor its perms for the :chapterId chapter */
export async function loadChapterAuthContext(req: Request, res: Response, next: NextFunction, chapterId: string) {
	//cannot load perms when there is no person
	const personId = req.actor?.Person?.id;
	if (!personId) return next();

	try {
		req.actor.grant(await loadChapterPerms(req.db, personId, parseInt(chapterId)));
		next();
	} catch (err) {
		next(err);
	}
}
