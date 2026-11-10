import { sql, type Insertable } from 'kysely';
import type { Database } from '../data/database.js';
import type { Conflict } from '../data/schema.js';

type queryOpts = {
	ids?: number[];
	/** rows the person holds */
	person?: number;
	conflicted?: number;
	chapter?: number;
	/** rows with the person on either side */
	involving?: number;
};

function buildConflictQuery(db: Database, opts: queryOpts = {}) {
	let query = db.selectFrom('conflict');

	if (opts.ids) query = query.where('conflict.id', 'in', opts.ids);
	if (opts.person) query = query.where('conflict.person', '=', opts.person);
	if (opts.conflicted) query = query.where('conflict.conflicted', '=', opts.conflicted);
	if (opts.chapter) query = query.where('conflict.chapter', '=', opts.chapter);
	if (opts.involving) {
		query = query.where((eb) => eb.or([
			eb('conflict.person', '=', opts.involving!),
			eb('conflict.conflicted', '=', opts.involving!),
		]));
	}

	return query;
}

async function getConflicts(db: Database, opts: queryOpts = {}) {
	return await buildConflictQuery(db, opts)
		.selectAll('conflict')
		.execute();
}

/** A person's standing conflicts with the conflicted person's and chapter's names, chapters first */
async function getStandingConflicts(db: Database, personId: number, opts: queryOpts = {}) {
	return await buildConflictQuery(db, { ...opts, person: personId })
		.leftJoin('person', 'person.id', 'conflict.conflicted')
		.leftJoin('chapter', 'chapter.id', 'conflict.chapter')
		.select([
			'conflict.id',
			'conflict.person',
			'conflict.conflicted',
			'conflict.chapter',
			'conflict.added_by',
			'conflict.created_at',
			'person.first as conflictedFirst',
			'person.last as conflictedLast',
			'chapter.name as chapterName',
			'chapter.state as chapterState',
		])
		// nulls sort first, which would put people ahead of chapters
		.orderBy(sql`chapter.name is null`)
		.orderBy('chapter.name')
		.orderBy('person.last')
		.orderBy('person.first')
		.execute();
}

async function createConflict(db: Database, data: Insertable<Conflict>) {
	return await db.insertInto('conflict')
		.values(data)
		.returningAll()
		.executeTakeFirstOrThrow();
}

async function deleteConflict(db: Database, id: number) {
	await db.deleteFrom('conflict').where('conflict.id', '=', id).execute();
}

export default {
	getConflicts,
	getStandingConflicts,
	createConflict,
	deleteConflict,
};
