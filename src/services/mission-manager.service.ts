import { db } from '../infra/db';

export class MissionManagerService {

  /**
   * Recupera tutte le missioni di un utente specifico.
   * Usato dalla Dashboard frontend per mostrare la lista.
   * Ordina per data di creazione decrescente (le più recenti in alto).
   */
  async getMissionsByUser(userId: string, limit: number = 50) {
    try {
      const missions = await db.selectFrom('missions')
        .selectAll()
        .where('user_id', '=', userId)
        .orderBy('created_at', 'desc')
        .limit(limit)
        .execute();
      
      return missions;
    } catch (error) {
      console.error("❌ Errore getMissionsByUser:", error);
      // Ritorna array vuoto in caso di errore per non rompere il frontend
      return [];
    }
  }

  /**
   * Recupera una singola missione tramite ID.
   * Utile per i controlli di sicurezza o per entrare nel dettaglio.
   */
  async getMissionById(missionId: string) {
    try {
      const mission = await db.selectFrom('missions')
        .selectAll()
        .where('id', '=', missionId)
        .executeTakeFirst();
      
      return mission;
    } catch (error) {
      console.error("❌ Errore getMissionById:", error);
      return null;
    }
  }

  /**
   * Crea una nuova missione nel database.
   * Usato principalmente dal PerplexityService (Hunter) quando trova nuove opportunità.
   */
  async createMission(data: any) {
    try {
      const result = await db.insertInto('missions')
        .values(data)
        .returningAll()
        .executeTakeFirst();
      
      return result;
    } catch (error) {
      console.error("❌ Errore createMission:", error);
      throw error;
    }
  }

  /**
   * Aggiorna i dati o lo stato di una missione.
   * Usato per salvare i progressi (candidatura, chat, stato developed/completed).
   */
  async updateMission(missionId: string, data: any) {
    try {
      const result = await db.updateTable('missions')
        .set(data)
        .where('id', '=', missionId)
        .returningAll()
        .executeTakeFirst();
        
      return result;
    } catch (error) {
      console.error("❌ Errore updateMission:", error);
      throw error;
    }
  }

  /**
   * Aggiorna specificamente lo stato di una missione.
   */
  async updateStatus(missionId: string, status: 'pending' | 'active' | 'completed' | 'archived' | 'rejected' | 'developed') {
    try {
      await db.updateTable('missions')
        .set({ status })
        .where('id', '=', missionId)
        .execute();
    } catch (error) {
      console.error("❌ Errore updateStatus:", error);
    }
  }

  /**
   * Elimina definitivamente una missione dal database.
   */
  async deleteMission(missionId: string) {
    try {
      await db.deleteFrom('missions')
        .where('id', '=', missionId)
        .execute();
    } catch (error) {
      console.error("❌ Errore deleteMission:", error);
      throw error;
    }
  }
}