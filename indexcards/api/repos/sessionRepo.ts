import type { Session } from '../data/schema.js';
import type { Database } from '../data/database.js';
import crypto from 'crypto';
import { encrypt } from 'unixcrypt';
import config from '../config.js';
import type { Insertable, Updateable } from 'kysely';

export const findByUserKey = async (
	db: Database,
	userkey: string,
) => {
	const session = await db
		.selectFrom('session')
		.leftJoin('person as p', 'p.id', 'session.person')
		.leftJoin('person as su', 'su.id', 'session.su')
		.select([
			'session.id',
			'session.ip',
			'session.su',
			'session.person',
			'session.userkey',
		])
		.select([
			'p.id as personId',
			'p.first as personFirst',
			'p.last as personLast',
			'p.email as personEmail',
		])
		.select([
			'su.id as suId',
			'su.first as suFirst',
			'su.last as suLast',
			'su.email as suEmail',
		])
		.where('session.userkey', '=', userkey)
		.executeTakeFirst();

	if (!session) {
		return undefined;
	}

	return {
		id: session.id,
		ip: session.ip,
		su: session.su,
		person: session.person,
		userkey: session.userkey,
		Person: session.personId
			? {
					id: session.personId,
					first: session.personFirst,
					last: session.personLast,
					email: session.personEmail,
				}
			: null,

		Su: session.suId
			? {
					id: session.suId,
					first: session.suFirst,
					last: session.suLast,
					email: session.suEmail,
				}
			: null,
	};
};

export const getSession = async (db: Database, id: number) => {
	const query = db
		.selectFrom(['session'])
		.selectAll('session')
		.where('session.id', '=', id);
		
	return await query.executeTakeFirst();
};

export const createSession = async (
	db: Database,
	session: Insertable<Session>,
) => {
	const userSalt = crypto.randomBytes(8).toString('hex');
	const created = await db
		.insertInto('session')
		.values(session)
		.executeTakeFirstOrThrow();

	const id = Number(created.insertId);

	const userkey = encrypt(
		`${id}${config.shared_secret}`,
		`$6$${userSalt}`,
	);

	await db
		.updateTable('session')
		.set({ userkey })
		.where('id', '=', id)
		.executeTakeFirstOrThrow();

	return {
		id,
		userkey,
	};
};
export const updateSession = async (db: Database, id: number, updates: Updateable<Session> ) => {
	await db.updateTable('session')
		.set(updates)
		.where('id', '=', id)
		.execute();
};

export const deleteSession = async (db: Database, id: number) => {
	await db.deleteFrom('session')
		.where('id', '=', id)
		.execute();
};

export default {
	findByUserKey,
	getSession,
	deleteSession,
	updateSession,
	createSession
}