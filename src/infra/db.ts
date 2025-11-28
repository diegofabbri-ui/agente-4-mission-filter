// src/infra/db.ts
import "dotenv/config"; // ← OBBLIGATORIO PER FAR LEGGERE .env
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { DB } from "../types/db";

const { Pool } = pg;

export const db = new Kysely<DB>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
      },
    }),
  }),
});

