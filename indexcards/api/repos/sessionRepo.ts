import type { Session } from '../data/schema.js';
import type { Database } from '../data/database.js';
import crypto from 'crypto';
import { encrypt } from 'unixcrypt';
import config from '../config.js';
import logger from '../helpers/logger.js';
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
		'session.last_access',
	])
	.select([
		'p.id as personId',
		'p.first as personFirst',
		'p.last as personLast',
		'p.email as personEmail',
		'p.site_admin as personSiteAdmin',
		'p.tz as personTz',
		'ps.value as personBanned',
	])
	.select([
		'su.id as suId',
		'su.first as suFirst',
		'su.last as suLast',
		'su.email as suEmail',
		'su.site_admin as suSiteAdmin',
		'su.tz as suTz',
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
		last_access: session.last_access,
		Person: {
					id: session.personId,
					first: session.personFirst,
					last: session.personLast,
					email: session.personEmail,
					site_admin: session.personSiteAdmin ?? 0,
					tz: session.personTz,
					banned: session.personBanned ?? '0',
		},
		Su: session.suId
			? {
					id: session.suId,
					first: session.suFirst,
					last: session.suLast,
					email: session.suEmail as string,
					site_admin: session.suSiteAdmin ?? 0,
					tz: session.suTz,
				}
			: null,
	};
};

// Leaves out the push subscription columns (push_endpoint, push_p256dh, push_auth,
// push_vapid_key, push_disabled) so they can't leak through a caller that returns the row
export const getSession = async (db: Database, id: number) => {
	const query = db
		.selectFrom(['session'])
		.select([
			'session.id',
			'session.userkey',
			'session.ip',
			'session.defaults',
			'session.su',
			'session.person',
			'session.agent_data',
			'session.geoip',
			'session.push_notify',
			'session.push_active',
			'session.last_access',
			'session.created_at',
			'session.timestamp',
		])
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

/** The push subscription columns of a session, or undefined if the session doesn't exist */
export const getPushStatus = async (db: Database, sessionId: number) => {
	return await db.selectFrom('session')
		.select([
			'session.id',
			'session.person',
			'session.push_endpoint',
			'session.push_vapid_key',
			'session.push_disabled',
		])
		.where('session.id', '=', sessionId)
		.executeTakeFirst();
};

/** A person's own (not su'd) sessions with their push columns, most recently used first */
export const getSessions = async (db: Database, personId: number) => {
	return await db.selectFrom('session')
		.select([
			'session.id',
			'session.agent_data',
			'session.ip',
			'session.last_access',
			'session.created_at',
			'session.push_endpoint',
			'session.push_vapid_key',
			'session.push_disabled',
		])
		.where('session.person', '=', personId)
		.where('session.su', 'is', null)
		.orderBy('session.last_access', 'desc')
		.orderBy('session.id', 'desc')
		.execute();
};

const clearedPush = {
	push_endpoint: null,
	push_p256dh: null,
	push_auth: null,
	push_vapid_key: null,
} as const;

export type PushSubscriptionValues = {
	endpoint: string;
	p256dh: string;
	auth: string;
	/** fingerprint of the VAPID key the browser subscribed with */
	vapidKey: string;
	/** an earlier endpoint from this browser that the new one replaces */
	replaces?: string;
	/** turn push back on if it was turned off for this session */
	enable: boolean;
};

/**
 * Saves a push subscription to a session. An endpoint belongs to only one session, so any
 * other session holding it (a shared device) is cleared first
 */
export const setPushSubscription = async (
	db: Database,
	sessionId: number,
	personId: number,
	values: PushSubscriptionValues,
) => {
	const { endpoint, p256dh, auth, vapidKey, replaces, enable } = values;

	// read committed, because under repeatable read MariaDB rejects the second of two parallel
	// saves to the same row with "record has changed since last read" (two tabs syncing at once).
	// Two sessions claiming the same endpoint at the same instant still fail on the unique index
	await db.transaction().setIsolationLevel('read committed').execute(async trx => {
		const holders = await trx.selectFrom('session')
			.select(['session.id', 'session.person'])
			.where('session.push_endpoint', '=', endpoint)
			.where('session.id', '!=', sessionId)
			.execute();

		if (holders.length > 0) {
			for (const holder of holders) {
				if (holder.person !== personId) {
					logger.warn(`Push endpoint on ${new URL(endpoint).hostname} moved from person ${holder.person} to person ${personId}`);
				}
			}
			await trx.updateTable('session')
				.set(clearedPush)
				.where('session.id', 'in', holders.map(holder => holder.id))
				.where('session.push_endpoint', '=', endpoint)
				.execute();
		}

		if (replaces && replaces !== endpoint) {
			await trx.updateTable('session')
				.set(clearedPush)
				.where('session.person', '=', personId)
				.where('session.push_endpoint', '=', replaces)
				.execute();
		}

		await trx.updateTable('session')
			.set({
				push_endpoint: endpoint,
				push_p256dh: p256dh,
				push_auth: auth,
				push_vapid_key: vapidKey,
				...(enable ? { push_disabled: 0 } : {}),
			})
			.where('session.id', '=', sessionId)
			.execute();
	});
};

/**
 * A person's own logins that can receive push: subscribed under the current VAPID key,
 * not turned off, and not su'd
 */
export const getPushSubscriptions = async (db: Database, personId: number, vapidKey: string) => {
	return await db.selectFrom('session')
		.select([
			'session.id',
			'session.push_endpoint',
			'session.push_p256dh',
			'session.push_auth',
		])
		.where('session.person', '=', personId)
		.where('session.su', 'is', null)
		.where('session.push_endpoint', 'is not', null)
		.where('session.push_disabled', '=', 0)
		.where('session.push_vapid_key', '=', vapidKey)
		// setPushSubscription writes the three columns together, so none is null when the endpoint isn't
		.$narrowType<{ push_endpoint: string; push_p256dh: string; push_auth: string }>()
		.execute();
};

/**
 * One login's subscription when it can receive push: subscribed under the current VAPID key
 * and not turned off. Undefined otherwise
 */
export const getPushSubscription = async (db: Database, sessionId: number, vapidKey: string) => {
	return await db.selectFrom('session')
		.select([
			'session.id',
			'session.push_endpoint',
			'session.push_p256dh',
			'session.push_auth',
		])
		.where('session.id', '=', sessionId)
		.where('session.push_endpoint', 'is not', null)
		.where('session.push_disabled', '=', 0)
		.where('session.push_vapid_key', '=', vapidKey)
		// setPushSubscription writes the three columns together, so none is null when the endpoint isn't
		.$narrowType<{ push_endpoint: string; push_p256dh: string; push_auth: string }>()
		.executeTakeFirst();
};

/**
 * Removes a dead subscription. Only clears the session while it still holds that endpoint,
 * so a subscription the browser saved in the meantime is kept. Leaves push_disabled alone:
 * the browser gave up, not the person. Returns whether anything was cleared
 */
export const clearPushEndpoint = async (db: Database, sessionId: number, endpoint: string) => {
	const result = await db.updateTable('session')
		.set(clearedPush)
		.where('session.id', '=', sessionId)
		.where('session.push_endpoint', '=', endpoint)
		.executeTakeFirst();
	return result.numUpdatedRows > 0;
};

/** Removes a session's push subscription, and turns push off for it when disable is set */
export const clearPushSubscription = async (
	db: Database,
	sessionId: number,
	{ disable }: { disable: boolean },
) => {
	await db.updateTable('session')
		.set({
			...clearedPush,
			...(disable ? { push_disabled: 1 } : {}),
		})
		.where('session.id', '=', sessionId)
		.execute();
};

export default {
	findByUserKey,
	getSession,
	deleteSession,
	updateSession,
	createSession,
	getPushStatus,
	getSessions,
	getPushSubscriptions,
	getPushSubscription,
	setPushSubscription,
	clearPushEndpoint,
	clearPushSubscription,
}