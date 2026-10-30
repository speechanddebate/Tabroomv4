import type { Database } from '../data/database.js';
import type { Message } from '../data/schema.js';
import type { Insertable, Selectable } from 'kysely';

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

	return result.numUpdatedRows > 0n;
}

export default {
	getMessage,
	getMessages,
	createMessage,
	recordDelivery,
};
