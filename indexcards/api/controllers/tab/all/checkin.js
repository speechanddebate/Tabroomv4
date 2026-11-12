import { sql } from 'kysely';
import { db } from '../../../data/database.js';

// Enables the Online Status Attendance dashboard functions
export async function categoryCheckin(req, res) {
	const { rows: judges } = await sql`
		select judge.id, judge.active
		from judge
		where judge.category = ${req.params.categoryId}
	`.execute(db);

	res.status(200).json(judges);
};

export async function eventCheckin(req, res) {
	const { rows: entries } = await sql`
		select entry.id, entry.active
			from entry
		where entry.event = ${req.params.eventId}
	`.execute(db);

	res.status(200).json(entries);
};
