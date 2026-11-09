import type { Database } from '../data/database.js';
import type { Permission } from '../data/schema.js';
import type { Insertable } from 'kysely';
type CreatePermissionData = Omit<Insertable<Permission>, 'person'> & {
	person: NonNullable<Insertable<Permission>['person']>;
	tag: NonNullable<Insertable<Permission>['tag']>;
};

type queryOpts = {
	tourn?: number;
	tourns?: number[];
	chapter?: number;
	chapters?: number[];
	person?: number;
	persons?: number[];
};

function buildPermissionQuery(db: Database, opts: queryOpts = {}) {
	let query = db.selectFrom('permission');

	if (opts.tourn !== undefined) {
		query = query.where('permission.tourn', '=', opts.tourn);
	}
	if (opts.tourns) {
		query = query.where('permission.tourn', 'in', opts.tourns);
	}
	if (opts.chapter !== undefined) {
		query = query.where('permission.chapter', '=', opts.chapter);
	}
	if (opts.chapters) {
		query = query.where('permission.chapter', 'in', opts.chapters);
	}
	if (opts.persons) {
		query = query.where('permission.person', 'in', opts.persons);
	}
	if (opts.person !== undefined) {
		query = query.where('permission.person', '=', opts.person);
	}
	return query;
}

async function getPermission(db: Database, id: number) {
	return await buildPermissionQuery(db)
		.selectAll('permission')
		.where('permission.id', '=', id)
		.executeTakeFirst();
}

async function getPermissions(db: Database, opts: queryOpts = {}) {
	return await buildPermissionQuery(db, opts)
		.selectAll('permission')
		.execute();
}

export async function createPermission(db: Database, data: CreatePermissionData) {
	const [row] = await db.insertInto('permission')
		.values(data)
		.returning('id')
		.execute();
	return row.id;
}

export default {
	getPermission,
	getPermissions,
	createPermission,
};