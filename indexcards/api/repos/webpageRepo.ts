import type { Database } from '../data/database.js';
import type { Updateable, Insertable } from 'kysely';
import type { Webpage } from '../data/schema.js';

type QueryOpts = {
	unpublished?: boolean;
};

type WebpageScope = {
	tournId?: number;
	sitewide?: number | boolean;
	slug?: string;
};

function buildWebpageQuery(db: Database, opts: QueryOpts = {}) {
	let query = db.selectFrom('webpage');

	if (!opts.unpublished) {
		query = query.where('published', '=', 1);
	}
	return query;
}

async function getWebpage(db: Database, webpageId: number, opts: QueryOpts = {}) {
	let query = buildWebpageQuery(db, opts);

	const res = await query
		.where('id', '=', webpageId)
		.selectAll()
		.executeTakeFirst();

	return res;
}

async function getWebpages(db: Database, scope: WebpageScope = {}, opts: QueryOpts = {}) {
	let query = buildWebpageQuery(db, opts);
	const validScopeKeys = new Set<keyof WebpageScope>(['tournId', 'sitewide', 'slug']);

	for (const key of Object.keys(scope)) {
		if (!validScopeKeys.has(key as keyof WebpageScope)) {
			throw new Error(`Invalid webpage scope key: ${key}`);
		}
	}

	if (scope.tournId !== undefined) {
		query = query.where('tourn', '=', scope.tournId);
	}

	if (scope.sitewide !== undefined) {
		const sitewide = typeof scope.sitewide === 'boolean' ? Number(scope.sitewide) : scope.sitewide;
		query = query.where('sitewide', '=', sitewide);
	}

	if (scope.slug !== undefined) {
		query = query.where('slug', '=', scope.slug);
	}

	const webpages = await query.selectAll().execute();
	return webpages;
};

async function createWebpage(db:Database, data: Insertable<Webpage>) {
	const res = await db.insertInto('webpage')
		.values(data)
		.returning('id')
		.executeTakeFirstOrThrow()
	return res.id;
}
async function updateWebpage(db: Database, webpageId: number, data: Updateable<Webpage>) {
	const res = await db.updateTable('webpage')
		.set(data)
		.where('id', '=', webpageId)
		.executeTakeFirstOrThrow()
	return res.numUpdatedRows > 0;
}

async function deleteWebpage(db: Database, webpageId: number) {
	const res = await db.deleteFrom('webpage')
		.where('id', '=', webpageId)
		.executeTakeFirstOrThrow();
	return res.numDeletedRows > 0;
}

export default {
	getWebpage,
	getWebpages,
	createWebpage,
	updateWebpage,
	deleteWebpage,
};