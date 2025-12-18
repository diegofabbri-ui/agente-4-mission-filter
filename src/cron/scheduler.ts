import cron from 'node-cron';
import { db } from '../infra/db';
import { PerplexityService } from '../services/perplexity.service';

const hunter = new PerplexityService();

/**
 * Inizializza gli scheduler per la caccia alle missioni
 * (Daily, Weekly, Monthly)
 */
export const initScheduler = () => {
  console.log('⏰ [SCHEDULER] Avvio cicli di caccia automatica...');

  // 1. Caccia Daily (Ogni 6 ore)
  cron.schedule('0 */6 * * *', async () => {
    console.log('🔍 [CRON] Esecuzione caccia Daily...');
    await runHuntForAllUsers('daily');
  });

  // 2. Caccia Weekly (Ogni Lunedì alle 08:00)
  cron.schedule('0 8 * * 1', async () => {
    console.log('🔍 [CRON] Esecuzione caccia Weekly...');
    await runHuntForAllUsers('weekly');
  });

  // 3. Caccia Monthly (Il primo di ogni mese alle 09:00)
  cron.schedule('0 9 1 * *', async () => {
    console.log('🔍 [CRON] Esecuzione caccia Monthly...');
    await runHuntForAllUsers('monthly');
  });
};

/**
 * Helper per eseguire la caccia per tutti gli utenti attivi
 */
async function runHuntForAllUsers(mode: 'daily' | 'weekly' | 'monthly') {
  try {
    const users = await db.selectFrom('users').select(['id']).where('status', '=', 'active').execute();
    
    for (const user of users) {
      const profile = await db.selectFrom('user_ai_profile')
        .selectAll()
        .where('user_id', '=', user.id)
        .executeTakeFirst();
      
      if (profile) {
        console.log(`📡 Caccia ${mode} per utente: ${user.id}`);
        await hunter.findGrowthOpportunities(user.id, profile, mode);
      }
    }
  } catch (error) {
    console.error(`❌ Errore durante il cron ${mode}:`, error);
  }
}