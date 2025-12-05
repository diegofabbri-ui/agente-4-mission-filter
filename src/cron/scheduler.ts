import cron from 'node-cron';
import { db } from '../infra/db';
import { PerplexityService } from '../services/perplexity.service';

const BATCH_DELAY_MS = 5000; 

export const initScheduler = () => {
  console.log('⏰ Scheduler Multi-Tenant inizializzato (Rome Time)');

  cron.schedule('0 8 * * *', async () => {
    console.log('🌅 AVVIO CACCIA MASSIVA PER TUTTI GLI UTENTI...');
    
    const users = await db
      .selectFrom('users')
      .innerJoin('user_ai_profile', 'users.id', 'user_ai_profile.user_id')
      .select(['users.id', 'users.email', 'user_ai_profile.career_manifesto'])
      .where('users.status', '=', 'active')
      .execute();

    console.log(`📋 Trovati ${users.length} utenti attivi.`);
    const hunter = new PerplexityService();

    for (const [index, user] of users.entries()) {
      if (!user.career_manifesto) continue;
      console.log(`\n👤 [${index + 1}/${users.length}] Caccia per: ${user.email}`);
      
      try {
        // Lancia la ricerca per questo specifico utente
        await hunter.findGrowthOpportunities(user.id, user.career_manifesto as any);
      } catch (e) {
        console.error(`❌ Errore caccia per ${user.email}:`, e);
      }
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
    console.log('✅ CACCIA MASSIVA COMPLETATA.');
  }, { timezone: "Europe/Rome" });
};