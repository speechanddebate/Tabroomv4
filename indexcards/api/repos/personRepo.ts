import type { DBSchema, Database } from '../data/database.js';
import { flattenSettings, saveSettings } from './utils/settings.js';
import db from '../data/db.js';
import type { Person } from '../data/schema.js';
import type { Insertable, Selectable, ExpressionBuilder } from 'kysely';



async function getPersonSettings(db: Database, personId: number, tags?: string[]) {
	let query = await db
		.selectFrom('person_setting')
		.selectAll()
		.where('person', '=', personId)

	if (tags) {
		query = query.where('tag', 'in', tags);
	}
		const rows = await query.execute();

		return {
			settings: flattenSettings(rows),
			settingsTimestamps: Object.fromEntries(
				rows.map(row => [
					row.tag,
					{
						createdAt: row.created_at,
						updatedAt: row.timestamp,
					},
				])
			),
		};
}

type GetPersonOptions = {
	settings?: boolean | string[];
	excludeBanned?: boolean;
	excludeUnconfirmedEmail?: boolean;
	hasValidParadigm?: boolean;
	hasJudged?: boolean;
	limit?: number;
	offset?: number;
};

async function personQuery(db: Database, opts: GetPersonOptions = {}) {
	let query = db.selectFrom('person');
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

type PersonWithSettings = Selectable<Person> & {
	settings: Record<string, unknown>;
	settingsTimestamps: Record<string, { updatedAt: Date }>;
};

export async function getPerson(
	db: Database,
	personId: number,
	opts: GetPersonOptions & { settings: true | string[] },
): Promise<PersonWithSettings | undefined>;

export async function getPerson(
	db: Database,
	personId: number,
	opts?: GetPersonOptions & { settings?: false },
): Promise<Selectable<Person> | undefined>;

export async function getPerson(
	db: Database,
	personId: number,
	opts: GetPersonOptions = {},
) {
	let query = (await personQuery(db, opts))
		.where('person.id', '=', personId);


	const person = await query.selectAll('person').executeTakeFirst();

	if (!person) {
		return undefined;
	}

	if (opts.settings) {
		const { settings, settingsTimestamps } = await getPersonSettings(
			db,
			personId,
			opts.settings === true ? undefined : opts.settings,
		);
	
		return {
			...person,
			settings,
			settingsTimestamps,
		};
	}

	return person;
}

export async function personSearch(
	db: Database,
	term: string,
	opts: GetPersonOptions = {},
) {
	const sanitize = (term: string) => {
		if (!term) return '';
		return term.replace(/[^a-zA-Z0-9\-\s]/g, '').trim();
	};

	const cleanTerm = sanitize(term);
	const words = cleanTerm.split(/\s+/).filter((w) => w.length > 0);

	let query = await personQuery(db, opts);
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

	return await query.selectAll('person').execute();
}

export async function getPersonByUsername(db: Database, username: string, opts: GetPersonOptions = {}) {
	return (await personQuery(db, opts))
		.where('person.email', '=', username)
		.selectAll('person')
		.executeTakeFirst();
}

type CreatePersonData = Insertable<Person> & {
	settings?: Record<string, unknown>;
};
export async function updatePerson(db: Database, personId: number, data: Partial<CreatePersonData>) {
	const { settings, ...personData } = data;

	return await db.transaction().execute(async (trx) => {
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
				table: 'person_setting',
				settings,
				ownerKey: 'person',
				ownerId: personId,
			});
		}

		return personId;
	});
}
export async function createPerson(db: Database, data: CreatePersonData) {
	const { settings, ...personData } = data;

	return await db.transaction().execute(async (trx) => {
		const person = await trx
			.insertInto('person')
			.values(personData)
			.executeTakeFirstOrThrow();

		const personId = Number(person.insertId);

		if (settings) {
			await saveSettings({
				db: trx,
				table: 'person_setting',
				settings,
				ownerKey: 'person',
				ownerId: personId,
			});
		}

		return personId;
	});
}

export async function personInclude() {
	return {
		model: db.person,
		as: 'persons',
	};
}


// export the  data functions NOT the mappers
export default {
	getPerson,
	personSearch,
	getPersonByUsername,
	updatePerson,
	createPerson
};
