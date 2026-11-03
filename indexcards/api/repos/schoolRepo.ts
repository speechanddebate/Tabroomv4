import { saveSettings, selectSettings, withTransaction, type Settings } from './utils/index.js';
import type { Insertable, Updateable } from 'kysely';
import type { Database } from '../data/database.js';
import type { School } from '../data/schema.js';

type queryOpts = {
	ids?: number[];
	tourn?: number;
	tourns?: number[];
	chapter?: number;
	region?: number;
	district?: number;
	settings?: boolean | string[];
};
function buildSchoolQuery(db: Database, opts: queryOpts = {}){
	let query = db.selectFrom('school')
	.$if(opts.settings !== undefined && opts.settings !== false, (qb) => 
		qb.select(selectSettings({
			table: 'school',
			settings: opts.settings!
		}))
	)
	if (opts.ids) {
		query = query.where('school.id', 'in', opts.ids);
	}
	if (opts.tourn) {
		query = query.where('school.tourn', '=', opts.tourn);
	}
	if (opts.tourns) {
		query = query.where('school.tourn', 'in', opts.tourns);
	}
	if (opts.chapter) {
		query = query.where('school.chapter', '=', opts.chapter);
	}
	if (opts.region) {
		query = query.where('school.region', '=', opts.region);
	}
	if (opts.district) {
		query = query.where('school.district', '=', opts.district);
	}
	return query;
}

async function getSchool(db: Database, id: number, opts: queryOpts = {}) {
	const res = await buildSchoolQuery(db, opts)
	.where('id', '=', id)
	.selectAll('school')
	.executeTakeFirst();
	return res;
}
async function getSchools(db: Database, opts: queryOpts = {}) {
	return await buildSchoolQuery(db, opts)
	.selectAll('school')
	.execute();
}
async function createSchool(db: Database, data: Insertable<School> & { settings?: Settings }) {
	const { settings, ...schoolData } = data;

	return await withTransaction(db, async (trx) => {
		const school = await trx
			.insertInto('school')
			.values(schoolData)
			.returningAll()
			.executeTakeFirstOrThrow();


		if (settings) {
			await saveSettings({
				db: trx,
				table: 'school',
				settings,
				ownerId: school.id,
			});
		}

		return school;
	});
}
async function updateSchool(db: Database, id: number, data: Updateable<School> & { settings?: Settings }) {
	const { settings, ...schoolData } = data;

	return await withTransaction(db, async (trx) => {
		if (Object.keys(schoolData).length > 0) {
			await trx
				.updateTable('school')
				.set(schoolData)
				.where('id', '=', id)
				.executeTakeFirstOrThrow();
		}

		if (settings) {
			await saveSettings({
				db: trx,
				table: 'school',
				settings,
				ownerId: id,
			});
		}

		return id;
	});
}
async function deleteSchool(db: Database, id: number) {
	return await db.deleteFrom('school')
		.where('id', '=', id)
		.executeTakeFirst();
}

/** The permission tags that put a chapter's schools on a person's home page */
const COACH_TAGS = ['chapter', 'prefs'] as const;

/**
 * The schools of the chapters the person holds a chapter or prefs permission for. Pass
 * tourns to limit them to those tournaments. One row per school; a person holding both
 * tags for a chapter gets the chapter one
 */
async function getCoachedSchools(db: Database, personId: number, opts: queryOpts = {}) {
	const rows = await buildSchoolQuery(db, opts)
		.innerJoin('permission', 'permission.chapter', 'school.chapter')
		.select([
			'school.id',
			'school.name',
			'school.onsite',
			'school.chapter',
			'school.tourn',
			'permission.tag',
		])
		.where('permission.person', '=', personId)
		.where('permission.tag', 'in', COACH_TAGS)
		.execute();

	const schools = new Map<number, (typeof rows)[number]>();
	for (const row of rows) {
		const seen = schools.get(row.id);
		if (!seen || row.tag === 'chapter') schools.set(row.id, row);
	}
	return [...schools.values()];
}

export default {
	getSchool,
	getSchools,
	getCoachedSchools,
	createSchool,
	updateSchool,
	deleteSchool,
};
