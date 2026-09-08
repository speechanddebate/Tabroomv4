import type { DB } from './schema.js'
//community mariadb driver support 'returning'
import { createPool } from 'mariadb'
import { Kysely } from 'kysely'
import { MariadbDialect } from "kysely-mariadb";
import config from '../config.js'

const dialect = new MariadbDialect({
  mariadb: createPool({
    database: config.db.database,
    host: config.db.host,
    user: config.db.user,
    password: config.db.pass,
    port: config.db.port,
    connectionLimit: 10,
  })
})

export const db = new Kysely<DB>({
  dialect,
})

export type Database = Kysely<DB>;