import type { Insertable } from 'kysely';
import type { Database } from '../data/database.js';
import type { Chapter } from '../data/schema.js';

type queryOpts = {
	ids?: number[];
	/** chapters whose name starts with this; LIKE wildcards in it are dropped */
	namePrefix?: string;
	limit?: number;
};

function buildChapterQuery(db: Database, opts: queryOpts = {}) {
	let query = db.selectFrom('chapter');

	if (opts.ids) query = query.where('chapter.id', 'in', opts.ids);
	if (opts.namePrefix !== undefined) {
		const prefix = opts.namePrefix.replace(/[%_\\]/g, '');
		// a prefix of only wildcards is left empty; it must match nothing, not become like '%'
		query = prefix ? query.where('chapter.name', 'like', `${prefix}%`) : query.where((eb) => eb.lit(false));
	}
	if (opts.limit) query = query.limit(opts.limit);

	return query;
}

async function getChapter(db:Database, id:number, opts: queryOpts = {}) {
	return await buildChapterQuery(db, opts)
	.where('id', '=', id)
	.selectAll('chapter')
	.executeTakeFirst();
}

async function getChapters(db: Database, opts: queryOpts = {}) {
	return await buildChapterQuery(db, opts)
		.selectAll('chapter')
		.orderBy('chapter.name')
		.execute();
}

async function createChapter(db: Database, data: Insertable<Chapter>) {
	return await db.insertInto('chapter')
		.values(data)
		.returningAll()
		.executeTakeFirstOrThrow();
}

async function getAdmins(db: Database, chapterId: number) {
	return await db.selectFrom('person')
		.innerJoin('permission', 'person.id', 'permission.person')
		.where('permission.chapter', '=', chapterId)
		.where('permission.tag', '=', 'chapter')
		.selectAll('person')
		.execute();
}

export default {
	getChapter,
	getChapters,
	createChapter,
	getAdmins,
};
