import type { DB } from './schema.js'
import { createPool } from 'mariadb'
import { Kysely } from 'kysely'
import { MariadbDialect } from "kysely-mariadb";
import config from '../config.js'
import logger from '../helpers/logger.js'

import type { FieldInfo } from 'mariadb'

const dialect = new MariadbDialect({
  mariadb: createPool({
    database: config.db.database,
    host: config.db.host,
    user: config.db.user,
    password: config.db.pass,
    port: config.db.port,
	timezone: 'Z',
    connectionLimit: 10,
	//Convert all TINYINT(1) to boolean, instead of number
	typeCast(field: FieldInfo, next: Function) {
		if (field.type === 'TINY' && field.columnLength === 1) {
			return field.string() === '1';
		}
		return next();
	},
  })
})

export const db = new Kysely<DB>({
  dialect,
	log(event){
		if (event.level === 'error'){
			logger.error('DB Error Event:', event);
		}
		if (event.level === 'query') {
			logger.debug('DB Event:', event);
		}
	},
})

export type Database = Kysely<DB>;
export type DBSchema = DB;