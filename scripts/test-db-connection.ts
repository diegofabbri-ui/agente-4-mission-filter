import 'dotenv/config';
import { Client } from 'pg';

console.log("DEBUG: process.env.DATABASE_URL = ", process.env.DATABASE_URL);

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    const res = await client.query('SELECT COUNT(*) FROM users;');
    console.log('✅ DB connection OK, users count =', res.rows[0].count);
  } catch (err) {
    console.error('❌ DB connection FAILED:', err);
  } finally {
    await client.end();
  }
}

main();

