import permissionRepo from '../../api/repos/permissionRepo.js';
import { db } from '../../api/data/database.js';
import { faker } from '@faker-js/faker';
import factories from './index.js';

import type { Insertable } from 'kysely';
import type { Permission } from '../../api/data/schema.js';

export function createPermissionData(overrides: Partial<Insertable<Permission>> = {}) {
	return {
		...overrides,
		tag: overrides.tag ??faker.helpers.arrayElement(['owner', 'chapter', 'tourn']),
	};
}

export async function create(
	overrides: Partial<Insertable<Permission>> = {},
) {
	const data = createPermissionData(overrides);

	const permissionId = await permissionRepo.createPermission(db, {
		...data,
		person: overrides.person ?? (await factories.person.create()).personId,
	});

	return {
		permissionId,
		getPermission: () => permissionRepo.getPermission(db, permissionId),
	};
}
export default {
	createPermissionData,
	create,
};