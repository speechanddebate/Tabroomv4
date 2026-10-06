import permissionRepo from '../../repos/permissionRepo.js';
import eventRepo from '../../repos/eventRepo.js';
import { db } from '../../data/database.js';
import type { Request, Response, NextFunction } from 'express';

export async function loadTournAuthContext(req: Request, res: Response, next: NextFunction, tournId: string){
	req.auth = {
		...req.auth,
		perms: [
			...(req.auth?.perms ?? []),
		],
	};

	// Unauthenticated request, skip loading perms
	const personId = req.actor?.Person?.id;
	if (!personId) return next();

	if (tournId){
		//fetch all or a persons perms for a tourn
		const perms = await permissionRepo.getPermissions(db, { tourn: parseInt(tournId), person: personId });

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
				permTournId = perm.tourn	;
			}

			if (scope && id && perm.tag) {
				req.auth.perms.push({
					scope,
					id,
					role: perm.tag,
					categoryId: categoryId || undefined,
					tournId: permTournId || undefined,
				})
			}
		}
	}
	return next();
}
/** load all the chapter perms for the actor */
export async function loadChapterAuthContext(req: Request, res: Response, next: NextFunction, chapterId: number) {
	req.auth = {
		...req.auth,
		perms: [
			...(req.auth?.perms ?? []),
		],
	};

	//cannot load perms when there is no person
	if(!req.actor?.Person?.id) return next();

	const perms = await permissionRepo.getPermissions(db, {
		person: req.actor.Person.id,
		chapter: chapterId,
	});

	for (const perm of perms) {
		if (!perm.chapter) continue;
		req.auth.perms.push({
			scope: 'chapter',
			id: perm.chapter,
			role: perm.tag === 'chapter' ? 'chapterAdmin' : 'prefs',
		});
	}

	return next();
}