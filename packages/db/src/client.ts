import postgres from 'postgres'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import * as schema from './schema.js'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')

const postgresClient = postgres(url)

export const db = drizzlePostgres(postgresClient, { schema })
export type Database = typeof db

export function closeDbConnection() {
  return postgresClient.end()
}
