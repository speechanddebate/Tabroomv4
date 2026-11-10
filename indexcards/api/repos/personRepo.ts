import type { DBSchema, Database } from '../data/database.js';
import { saveSettings, selectSettings, withTransaction, type Settings } from './utils/index.js';
import type { Person } from '../data/schema.js';
import type { Insertable, ExpressionBuilder } from 'kysely';

type queryOpts = {
	settings?: boolean | string[];
	/** also select the settings' created_at and timestamp as settingsTimestamps */
	withTimestamps?: boolean;
	excludeBanned?: boolean;
	excludeUnconfirmedEmail?: boolean;
	hasValidParadigm?: boolean;
	hasJudged?: boolean;
	limit?: number;
	offset?: number;
	/**
	 * sort by last then first name. Off by default: person has no name index, so a sort over
	 * a wide match (the paradigm list's empty term) reads every row before the limit applies
	 */
	orderByName?: boolean;
};

async function buildPersonQuery(db: Database, opts: queryOpts = {}) {
	let query = db.selectFrom('person')
	.$if(opts.settings !== undefined && opts.settings !== false && !opts.withTimestamps, (qb) =>
		qb.select(selectSettings({
			table: 'person',
			settings: opts.settings ?? false
		}))
	)
	.$if(opts.settings !== undefined && opts.settings !== false && !!opts.withTimestamps, (qb) =>
		qb.select(selectSettings({
			table: 'person',
			settings: opts.settings ?? false,
			withTimestamps: true,
		}))
	)
	if(opts.excludeBanned)
		query = query.where(isNotBanned);
	if(opts.excludeUnconfirmedEmail)
		query = query.where(hasConfirmedEmail);
	if(opts.hasJudged)
		query = query.where(hasJudged);
	if(opts.limit !== undefined)
		query = query.limit(opts.limit ?? null);
	if(opts.offset !== undefined)
		query = query.offset(opts.offset ?? 0);
	if(opts.hasValidParadigm) {
		query = query.where(await validParadigmCondition(db));
	}
	return query;
}


function isNotBanned(eb: ExpressionBuilder<DBSchema, 'person'>) {
    return eb.not(
        eb.exists(
            eb
                .selectFrom('person_setting')
                .select('person')
                .whereRef('person_setting.person', '=', 'person.id')
                .where('tag', '=', 'banned')
        )
    );
}
function hasConfirmedEmail(eb: ExpressionBuilder<DBSchema, 'person'>) {
	return eb.not(
		eb.exists(
			eb
				.selectFrom('person_setting')
				.select('person')
				.whereRef('person_setting.person', '=', 'person.id')
				.where('tag', '=', 'email_unconfirmed')
		)
	);
}
function hasJudged(eb: ExpressionBuilder<DBSchema, 'person'>) {
	return eb.exists(
		eb
			.selectFrom('judge')
			.select('id')
			.whereRef('judge.person', '=', 'person.id')
	);
}
async function validParadigmCondition(db: Database) {
    const [reviewCutoff, reviewStart] = await Promise.all([
        db
            .selectFrom('tabroom_setting')
            .select('value_date')
            .where('tag', '=', 'paradigm_review_cutoff')
            .executeTakeFirst(),

        db
            .selectFrom('tabroom_setting')
            .select('value_date')
            .where('tag', '=', 'paradigm_review_start')
            .executeTakeFirst(),
    ]);

    const cutoffDate = reviewCutoff?.value_date
        ? new Date(reviewCutoff.value_date)
        : null;

    const reviewStartDate = reviewStart?.value_date
        ? new Date(reviewStart.value_date)
        : null;

    const useReviewStart =
        cutoffDate !== null &&
        reviewStartDate !== null &&
        cutoffDate < new Date();

    return (eb: ExpressionBuilder<DBSchema, 'person'>) =>
        eb.exists(
            eb.selectFrom('person_setting')
                .select('person')
                .whereRef('person_setting.person', '=', 'person.id')
                .where('tag', '=', 'paradigm')
                .$if(useReviewStart, (qb) =>
                    qb.where('timestamp', '>', reviewStartDate!)
                ),
        );
}

export async function getPerson(db: Database, id: number, opts: queryOpts = {}) {
	return await (await buildPersonQuery(db, opts))
		.where('person.id', '=', id)
		.selectAll('person')
		.executeTakeFirst();
}

// keeps letters, marks, digits, hyphens, apostrophes, and spaces, so LIKE wildcards never reach the query
const sanitize = (text: string) => text
	.normalize('NFC')
	.replace(/[\u2018\u2019]/g, "'")
	.replace(/[^\p{L}\p{M}0-9\-'\s]/gu, '')
	.trim();

export type PersonTerms = {
	/** free text: every word must start a first or a last name, in any order */
	name?: string;
	/** first name prefix */
	first?: string;
	/** last name prefix */
	last?: string;
	/** exact email */
	email?: string;
};

/**
 * The one way to look people up by what someone typed. Terms narrow each other; the caller
 * decides which it accepts (the conflicts page wants a last name or an email, the paradigm
 * search takes free text). Filters on who (banned, confirmed, has judged) and paging come
 * from the builder's opts.
 */
export async function findPersons(db: Database, terms: PersonTerms, opts: queryOpts = {}) {
	let query = await buildPersonQuery(db, opts);

	const words = sanitize(terms.name ?? '').split(/\s+/).filter((word) => word.length > 0);
	if (words.length) {
		query = query.where((eb) =>
			eb.and(
				words.map((word) =>
					eb.or([
						eb('person.first', 'like', `${word}%`),
						eb('person.last', 'like', `${word}%`),
					]),
				),
			),
		);
	}
	const first = sanitize(terms.first ?? '');
	const last = sanitize(terms.last ?? '');
	// a prefix with no name characters left ("%", "!!!") would be like '%' and match everyone
	if ((terms.first && !first) || (terms.last && !last)) return [];
	if (first) query = query.where('person.first', 'like', `${first}%`);
	if (last) query = query.where('person.last', 'like', `${last}%`);
	if (terms.email) query = query.where('person.email', '=', terms.email);
	if (opts.orderByName) query = query.orderBy('person.last').orderBy('person.first');

	return await query.selectAll('person').execute();
}

export async function getPersonByUsername(db: Database, username: string, opts: queryOpts = {}) {
	return (await buildPersonQuery(db, opts))
		.where('person.email', '=', username)
		.selectAll('person')
		.executeTakeFirst();
}

type CreatePersonData = Insertable<Person> & {
	settings?: Settings;
};
export async function updatePerson(db: Database, personId: number, data: Partial<CreatePersonData>) {
	const { settings, ...personData } = data;

	return await withTransaction(db, async (trx) => {
		if (Object.keys(personData).length > 0) {
			await trx
				.updateTable('person')
				.set(personData)
				.where('id', '=', personId)
				.executeTakeFirstOrThrow();
		}

		if (settings) {
			await saveSettings({
				db: trx,
				table: 'person',
				settings,
				ownerId: personId,
			});
		}

		return personId;
	});
}
export async function createPerson(db: Database, data: CreatePersonData) {
	const { settings, ...personData } = data;

	return await withTransaction(db, async (trx) => {
		const person = await trx
			.insertInto('person')
			.values(personData)
			.returningAll()
			.executeTakeFirstOrThrow();

		if (settings) {
			await saveSettings({
				db: trx,
				table: 'person',
				settings,
				ownerId: person.id,
			});
		}

		return person;
	});
}

export default {
	getPerson,
	findPersons,
	getPersonByUsername,
	updatePerson,
	createPerson
};
