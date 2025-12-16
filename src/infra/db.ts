import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import dotenv from 'dotenv';
// CAMBIO IMPORT QUI SOTTO:
import { DB } from '../types/database'; // Punta al nuovo file

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL mancante nel file .env');
}

export const db = new Kysely<DB>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  })
});