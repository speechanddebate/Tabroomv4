import { metrics } from '@opentelemetry/api';
import type { Database } from '../data/database.js';
import type { Message } from '../data/schema.js';
import type { Insertable, Selectable } from 'kysely';

const deliveries = metrics.getMeter('indexcards').createCounter('tabroom.notification.deliveries', {
	description: 'Notification deliveries by channel and how they ended',
	unit: '{delivery}',
});

// A series is only exported once it has a value, and Prometheus's increase() can't count the jump
// from no series to its first value, so the first deliveries after every start went uncounted.
// Starting each series at 0 makes every delivery an increase
for (const status of ['sent', 'rejected', 'failed', 'skipped', 'logged'] satisfies DeliveryStatus['email'][]) {
	deliveries.add(0, { 'notification.channel': 'email', 'notification.status': status });
}
for (const status of ['sent', 'rejected', 'failed', 'skipped'] satisfies DeliveryStatus['push'][]) {
	deliveries.add(0, { 'notification.channel': 'push', 'notification.status': status });
}

type queryOpts = {
	unread?: boolean;
	excludeDeleted?: boolean;
	excludeInvisible?: boolean;
};

function buildMessageQuery(db: Database, opts: queryOpts = {}) {
	let query = db.selectFrom('message');
	if (opts.unread) {
		query = query.where('read_at', 'is', null);
	}
	if (opts.excludeDeleted) {
		query = query.where('deleted_at', 'is', null);
	}
	if (opts.excludeInvisible) {
		query = query.where('visible_at', '<', new Date());
	}
	return query;
}

async function getMessage(db: Database, messageId: number, personId?: number, opts: queryOpts = {}) {
	let query = buildMessageQuery(db, opts)
		.where('message.id', '=', messageId)
		.leftJoin('tourn', 'tourn.id', 'message.tourn')
		.leftJoin('person as sender', 'sender.id', 'message.sender')
		.leftJoin('email', 'email.id', 'message.email')
		.selectAll('message')
		.select(['tourn.id as tourn_id', 'tourn.name as tourn_name', 'tourn.webname as tourn_webname'])
		.select([
			'sender.id as sender_id',
			'sender.first as sender_first',
			'sender.middle as sender_middle',
			'sender.last as sender_last',
			'sender.email as sender_email'])
		.select(['email.id as email_id', 'email.content as email_content'])

	if (personId !== undefined) {
		query = query.where('message.person', '=', personId);
	}
	const row = await query.executeTakeFirst();
	return row ? {
		id: row.id,
		subject: row.subject,
		body: row.body,
		url: row.url,
		deleted_at: row.deleted_at?.toISOString() ?? null,
		visible_at: row.visible_at?.toISOString(),
		read_at: row.read_at?.toISOString() ?? null,
		Tourn: row.tourn_id
			? {
				id: row.tourn_id,
				name: row.tourn_name,
				webname: row.tourn_webname,
			}
			: null,
		Sender: row.sender_id
			? {
				name: [row.sender_first, row.sender_middle, row.sender_last].filter(Boolean).join(' '),
				email: row.sender_email,
			}
			: null,
		Email: row.email_id
			? {
				content: row.email_content,
			}
			: null,
	} : undefined;
}

/**
 *  return the list of messages to be displayed in a persons inbox
 * @param personId 
 */
async function getMessages(db: Database, personId: number, opts: queryOpts = {} ){
	let query = buildMessageQuery(db,opts)
		.leftJoin('tourn', 'tourn.id', 'message.tourn')
		.leftJoin('person as sender', 'sender.id', 'message.sender')
		.leftJoin('email', 'email.id', 'message.email')
		.selectAll('message')
		.select(['tourn.id as tourn_id', 'tourn.name as tourn_name', 'tourn.webname as tourn_webname'])
		.select([
			'sender.id as sender_id',
			'sender.first as sender_first',
			'sender.middle as sender_middle',
			'sender.last as sender_last',
			'sender.email as sender_email'])
		.select(['email.id as email_id', 'email.content as email_content'])
		.where('message.person','=',personId)

	const data = await query.execute();
	return data.map((row) => ({
		id: row.id,
		subject: row.subject,
		body: row.body,
		url: row.url,
		deleted_at: row.deleted_at?.toISOString() ?? null,
		visible_at: row.visible_at?.toISOString(),
		read_at: row.read_at?.toISOString() ?? null,
		Tourn: row.tourn_id
			? {
				id: row.tourn_id,
				name: row.tourn_name,
				webname: row.tourn_webname,
			}
			: null,
		Sender: row.sender_id
			? {
				name: [row.sender_first, row.sender_middle, row.sender_last].filter(Boolean).join(' '),
				email: row.sender_email,
			}
			: null,
		Email: row.email_id
			? {
				content: row.email_content,
			}
			: null,
	}));

}

async function createMessage(db: Database, data: Insertable<Message>) {
	return await db.insertInto('message')
	.values(data)
	.returningAll()
	.executeTakeFirstOrThrow();
};

/** The final statuses a delivery job can record for each channel */
export type DeliveryStatus = {
	email: Exclude<NonNullable<Selectable<Message>['email_status']>, 'queued'>;
	push: Exclude<NonNullable<Selectable<Message>['push_status']>, 'queued'>;
};

/**
 * Records how a channel's delivery of a message ended. Only a delivery still pending
 * (queued, or null for a job queued before the columns existed) is updated, so a late
 * failure can't overwrite a send. Returns whether the row changed
 */
async function recordDelivery<C extends keyof DeliveryStatus>(
	db: Database,
	messageId: number,
	channel: C,
	status: DeliveryStatus[C],
): Promise<boolean> {
	const statusColumn = channel === 'email' ? 'email_status' : 'push_status';
	const timeColumn = channel === 'email' ? 'emailed_at' : 'pushed_at';

	const result = await db.updateTable('message')
		.set({ [statusColumn]: status, [timeColumn]: new Date() })
		.where('id', '=', messageId)
		.where((eb) => eb.or([eb(statusColumn, 'is', null), eb(statusColumn, '=', 'queued')]))
		.executeTakeFirst();

	// Only a changed row counts, so a stalled job's rerun or a late failure isn't counted twice
	if (result.numUpdatedRows === 0n) return false;
	deliveries.add(1, { 'notification.channel': channel, 'notification.status': status });
	return true;
}

/**
 * Marks deliveries that never got a job as failed: the rows were written as queued and
 * then the queue could not take the jobs. Only the named channels and only rows still
 * queued change, so a job that did get through keeps whatever it recorded. Returns the
 * rows changed per channel
 */
async function failQueued(
	db: Database,
	messageIds: number[],
	channels: { email?: boolean; push?: boolean },
): Promise<{ email: number; push: number }> {
	const changed = { email: 0, push: 0 };
	if (messageIds.length === 0) return changed;

	const failedAt = new Date();
	if (channels.email) {
		const result = await db.updateTable('message')
			.set({ email_status: 'failed', emailed_at: failedAt })
			.where('id', 'in', messageIds)
			.where('email_status', '=', 'queued')
			.executeTakeFirst();
		changed.email = Number(result.numUpdatedRows);
	}
	if (channels.push) {
		const result = await db.updateTable('message')
			.set({ push_status: 'failed', pushed_at: failedAt })
			.where('id', 'in', messageIds)
			.where('push_status', '=', 'queued')
			.executeTakeFirst();
		changed.push = Number(result.numUpdatedRows);
	}
	for (const channel of ['email', 'push'] as const) {
		if (changed[channel] > 0) {
			deliveries.add(changed[channel], { 'notification.channel': channel, 'notification.status': 'failed' });
		}
	}
	return changed;
}

/**
 * Counts deliveries that notify() settled as skipped when it wrote the rows (no one to reach on
 * that channel), so the metric covers the deliveries no job ever ran for
 */
function countSkipped(channel: keyof DeliveryStatus, count: number) {
	if (count > 0) {
		deliveries.add(count, { 'notification.channel': channel, 'notification.status': 'skipped' });
	}
}

export default {
	getMessage,
	getMessages,
	createMessage,
	recordDelivery,
	failQueued,
	countSkipped,
};
