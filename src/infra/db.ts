import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import { DB } from '../types/db';

dotenv.config();

export const db = new Kysely<DB>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // Necessario per Supabase da Railway
    }),
  }),
});