import { sql } from 'kysely';
import { db as kdb } from '../../../data/database.js';

export async function updateLastAccess(req,res) {
	const session = await kdb.selectFrom('session')
		.select(['id', 'last_access'])
		.where('id', '=', req.auth.sessionId)
		.executeTakeFirst();

	if (req.auth.su) {
		return res.status(200).json({
			message     : 'Update skipped; SU session',
			last_access : session?.last_access,
		});
	}

	// Only need to update this once a day or so.
	const last = Date.parse(session?.last_access);
	const now  = new Date();
	const then = now.setDate(now.getDate() - 1);

	let response = {};

	if (
		(Number.isNaN(last) || last < then)
		|| req.query.forceUpdate
	) {
		response = await kdb.updateTable('session')
			.set({ last_access: sql`NOW()` })
			.where('session.id', '=', req.auth.sessionId)
			.execute();

		response = {
			message: 'Update performed',
			last_access: new Date(),
		};

	} else {
		response = {
			message: 'Update unnecessary',
			last_access: session?.last_access,
		};
	}

	return res.status(200).json(response);
};

export default updateLastAccess;
