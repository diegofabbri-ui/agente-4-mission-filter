import cron from 'node-cron';
import { db } from '../infra/db';
import { PerplexityService } from '../services/perplexity.service';

const hunter = new PerplexityService();
const BATCH_DELAY_MS = 5000; // Delay di 5 secondi tra utenti per evitare rate limiting

/**
 * Inizializza gli scheduler per la caccia alle missioni.
 * Esportato come initScheduler per coerenza con src/index.ts.
 */
export const initScheduler = () => {
  console.log('⏰ [SCHEDULER] Avvio cicli di caccia automatica (Rome Time)');

  // 1. CACCIA DAILY: Eseguita ogni 6 ore
  cron.schedule('0 */6 * * *', async () => {
    console.log('🔍 [CRON] Avvio sessione di caccia DAILY...');
    await runHuntForAllUsers('daily');
  }, { timezone: "Europe/Rome" });

  // 2. CACCIA WEEKLY: Ogni Lunedì alle 08:00
  cron.schedule('0 8 * * 1', async () => {
    console.log('🔍 [CRON] Avvio sessione di caccia WEEKLY...');
    await runHuntForAllUsers('weekly');
  }, { timezone: "Europe/Rome" });

  // 3. CACCIA MONTHLY: Il primo giorno di ogni mese alle 09:00
  cron.schedule('0 9 1 * *', async () => {
    console.log('🔍 [CRON] Avvio sessione di caccia MONTHLY...');
    await runHuntForAllUsers('monthly');
  }, { timezone: "Europe/Rome" });
};

/**
 * Funzione core che itera su tutti gli utenti attivi ed esegue la ricerca
 * in base alla modalità specificata (daily, weekly, monthly).
 */
async function runHuntForAllUsers(mode: 'daily' | 'weekly' | 'monthly') {
  try {
    // Recupera solo gli utenti attivi che hanno un profilo AI configurato
    const activeUsers = await db
      .selectFrom('users')
      .innerJoin('user_ai_profile', 'users.id', 'user_ai_profile.user_id')
      .select([
        'users.id', 
        'users.email', 
        'user_ai_profile.career_goal_json',
        'user_ai_profile.full_name'
      ])
      .where('users.status', '=', 'active')
      .execute();

    console.log(`📋 [${mode.toUpperCase()}] Processando ${activeUsers.length} utenti attivi.`);

    for (const user of activeUsers) {
      // Se l'utente non ha impostato gli obiettivi, saltiamo
      if (!user.career_goal_json) {
        console.log(`⚠️ Saltato utente ${user.email}: Profilo AI incompleto.`);
        continue;
      }

      try {
        console.log(`📡 Inviando caccia ${mode} per: ${user.full_name || user.email}`);
        
        // Esegue la ricerca tramite PerplexityService
        const count = await hunter.findGrowthOpportunities(
          user.id, 
          user.career_goal_json, 
          mode
        );
        
        console.log(`✅ Utente ${user.email}: Trovate ${count} nuove missioni.`);
      } catch (error) {
        console.error(`❌ Errore durante la caccia per ${user.email}:`, error);
      }

      // Throttling per evitare di sovraccaricare le API
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
    
    console.log(`🏁 Ciclo di caccia ${mode.toUpperCase()} completato.`);
  } catch (error) {
    console.error(`🔥 Errore critico nello scheduler ${mode}:`, error);
  }
}