// Regenerates api/data/schema.ts from the database in the current config (NODE_ENV picks it).
// Calls kysely-codegen's generate() with the app's own connection, because its CLI's mysql
// dialect requires the mysql2 driver and this project uses mariadb.
import { generate, MysqlDialect } from 'kysely-codegen';
import { db } from '../api/data/database.js';

try {
	await generate({ db, dialect: new MysqlDialect(), outFile: 'api/data/schema.ts' });
} finally {
	await db.destroy();
}
