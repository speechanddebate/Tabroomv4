import type { DB } from './schema.js' // this is the Database interface we defined earlier
import { createPool } from 'mariadb' // do not use 'mysql2/promises'!
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

// Database interface is passed to Kysely's constructor, and from now on, Kysely 
// knows your database structure.
// Dialect is passed to Kysely's constructor, and from now on, Kysely knows how 
// to communicate with your database.
export const db = new Kysely<DB>({
  dialect,
})

export type Database = Kysely<DB>;