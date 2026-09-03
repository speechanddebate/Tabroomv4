import { db } from './api/data/database.js';
import { findByUserKey } from './api/repos/sessionRepo2.js';

try {
	const result = await findByUserKey(db, 'PUT_USERKEY_HERE');

	console.dir(result, {
		depth: null,
		colors: true,
	});
} finally {
	await db.destroy();
}