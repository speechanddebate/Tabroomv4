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
	.innerJoin('person as p', 'p.id', 'session.person')
	.leftJoin('person_setting as ps', (join) =>
		join
			.onRef('ps.person', '=', 'p.id')
			.on('ps.tag', '=', 'banned')
	)
	.leftJoin('person as su', 'su.id', 'session.su')
	.where('session.userkey', '=', userkey)
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
		'p.site_admin as personSiteAdmin',
		'ps.value as personBanned',
	])
	.select([
		'su.id as suId',
		'su.first as suFirst',
		'su.last as suLast',
		'su.email as suEmail',
		'su.site_admin as suSiteAdmin',
	])
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
		Person: {
					id: session.personId,
					first: session.personFirst,
					last: session.personLast,
					email: session.personEmail,
					site_admin: session.personSiteAdmin ?? 0,
					banned: session.personBanned ?? '0',
		},
		Su: session.suId
			? {
					id: session.suId,
					first: session.suFirst,
					last: session.suLast,
					email: session.suEmail as string,
					site_admin: session.suSiteAdmin ?? 0,
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
/**
 *  Creates a new session in the database and generates a userkey for it.
 * @param db 
 * @param session 
 * @returns id: the id of the new session, userkey: the generated userkey for the session
 */
export const createSession = async (
	db: Database,
	session: Insertable<Session>,
) => {
	const userSalt = crypto.randomBytes(8).toString('hex');
	const created = await db
		.insertInto('session')
		.values(session)
		.returningAll()
		.executeTakeFirstOrThrow();


	const userkey = encrypt(
		`${created.id}${config.shared_secret}`,
		`$6$${userSalt}`,
	);

	await db
		.updateTable('session')
		.set({ userkey })
		.where('id', '=', created.id)
		.executeTakeFirstOrThrow();

	return {
		...created,
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