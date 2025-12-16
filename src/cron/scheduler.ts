import cron from 'node-cron';
import { db } from '../infra/db';
import { PerplexityService } from '../services/perplexity.service';

const BATCH_DELAY_MS = 5000; 

// FIX: Rinomina da initScheduler a startScheduler
export const startScheduler = () => {
  console.log('⏰ Scheduler Multi-Tenant inizializzato (Rome Time)');

  // Schedule: Ogni giorno alle 08:00 AM
  cron.schedule('0 8 * * *', async () => {
    console.log('🌅 AVVIO CACCIA MASSIVA PER TUTTI GLI UTENTI...');
    
    try {
      const users = await db
        .selectFrom('users')
        .innerJoin('user_ai_profile', 'users.id', 'user_ai_profile.user_id')
        // Seleziona sia i campi vecchi che nuovi per compatibilità
        .select(['users.id', 'users.email', 'user_ai_profile.career_goal_json'])
        .where('users.status', '=', 'active')
        .execute();

      console.log(`📋 Trovati ${users.length} utenti attivi.`);
      const hunter = new PerplexityService();

      for (const [index, user] of users.entries()) {
        // Usa career_goal_json come fonte primaria (nuovo sistema)
        const manifesto = user.career_goal_json; 
        
        if (!manifesto) continue;
        
        console.log(`\n👤 [${index + 1}/${users.length}] Caccia per: ${user.email}`);
        
        try {
          await hunter.findGrowthOpportunities(user.id, manifesto);
        } catch (e) {
          console.error(`❌ Errore caccia per ${user.email}:`, e);
        }
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
      console.log('✅ CACCIA MASSIVA COMPLETATA.');
    } catch (err) {
      console.error("❌ Errore critico nello scheduler:", err);
    }
  }, { timezone: "Europe/Rome" });
};