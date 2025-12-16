import cron from 'node-cron';
import { db } from '../infra/db';
import { PerplexityService } from '../services/perplexity.service';

const BATCH_DELAY_MS = 5000; 

// FIX: Export corretto per index.ts
export const startScheduler = () => {
  console.log('⏰ Scheduler Multi-Tenant inizializzato (Rome Time)');

  cron.schedule('0 8 * * *', async () => {
    console.log('🌅 AVVIO CACCIA MASSIVA...');
    try {
      const users = await db
        .selectFrom('users')
        .innerJoin('user_ai_profile', 'users.id', 'user_ai_profile.user_id')
        .select(['users.id', 'users.email', 'user_ai_profile.career_goal_json'])
        .where('users.status', '=', 'active')
        .execute();

      console.log(`📋 Trovati ${users.length} utenti attivi.`);
      const hunter = new PerplexityService();

      for (const user of users) {
        if (!user.career_goal_json) continue;
        try {
          await hunter.findGrowthOpportunities(user.id, user.career_goal_json);
        } catch (e) { console.error(`Errore caccia ${user.email}`, e); }
        await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
      }
    } catch (e) { console.error("Errore scheduler:", e); }
  }, { timezone: "Europe/Rome" });
};