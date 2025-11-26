// src/infra/openai.ts

import 'dotenv/config';
import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  throw new Error(
    '[OpenAI] OPENAI_API_KEY mancante. Aggiungila al file .env nella root.',
  );
}

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
