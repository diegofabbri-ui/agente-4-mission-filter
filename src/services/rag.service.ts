import OpenAI from "openai";
import { db } from "../infra/db"; 

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class RagService {
  
  // Genera l'embedding per una stringa (vettore numerico)
  private async getEmbedding(text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text.replace(/\n/g, " "),
    });
    return response.data[0].embedding;
  }

  // Cerca documenti simili (Esempi vincenti, Linee guida)
  public async retrieveContext(query: string): Promise<string> {
    try {
        const embedding = await this.getEmbedding(query);
        
        // Chiamata alla funzione RPC 'match_knowledge' su Supabase
        const result = await db.executeQuery({
            sql: `select * from match_knowledge($1, 0.5, 5)`, // Threshold 0.5, Max 5 risultati
            parameters: [JSON.stringify(embedding)]
        });

        if (result.rows.length === 0) return "";

        return result.rows.map((row: any) => `
        --- KNOWLEDGE FRAGMENT (${row.metadata?.type || 'General'}) ---
        ${row.content}
        `).join("\n\n");
    } catch (e) {
        console.warn("⚠️ RAG Retrieval fallito (forse tabella o funzione mancante):", e);
        return "";
    }
  }

  // Metodo Admin per aggiungere conoscenza
  public async addDocument(content: string, type: string) {
    const embedding = await this.getEmbedding(content);
    await db.insertInto('knowledge_vectors' as any) // Cast as any se TS si lamenta della tabella nuova
      .values({
        content,
        metadata: JSON.stringify({ type }),
        embedding: JSON.stringify(embedding)
      })
      .execute();
  }
}