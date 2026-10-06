import { Forbidden } from '../../../helpers/problem.js';
import { sql } from 'kysely';
import { db } from '../../../data/database.js';

// Enables the Online Status Attendance dashboard functions
export async function categoryCheckin(req, res) {
	const perms = req.session.perms;

	if (!perms) {
		res.status(200).json({ error: true, message: 'You do not have access to that tournament' });
		return;
	}

	const categoryId = req.params.categoryId;

	if (
		perms.tourn[req.params.tournId] === 'owner'
		|| perms.tourn[req.params.tournId] === 'tabber'
		|| perms.tourn[req.params.tournId] === 'checker'
		|| perms.category[categoryId]
	) {

		const { rows: judges } = await sql`
			select judge.id, judge.active
			from judge
			where judge.category = ${categoryId}
		`.execute(db);

		res.status(200).json(judges);
	} else {
		return Forbidden(req, res, 'You do not have access to that tournament or category');
	}
};

export async function eventCheckin(req, res) {
	const perms = req.session.perms;

	if (!perms) {
		res.status(200).json({ error: true, message: 'You do not have access to that tournament' });
		return;
	}

	const eventId = req.params.eventId;

	if (
		perms.tourn[req.params.tournId] === 'owner'
		|| perms.tourn[req.params.tournId] === 'tabber'
		|| perms.tourn[req.params.tournId] === 'checker'
		|| perms.event[eventId]
	) {

		const { rows: entries } = await sql`
			select entry.id, entry.active
				from entry
			where entry.event = ${eventId}
		`.execute(db);

		res.status(200).json(entries);
	} else {
		return Forbidden(req, res, 'You do not have access to that tournament or event');
	}
};

