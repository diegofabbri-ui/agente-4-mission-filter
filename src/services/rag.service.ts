import OpenAI from "openai";
import { db } from "../infra/db"; 
import { sql } from "kysely"; // IMPORTANTE: Importiamo sql helper

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class RagService {
  
  private async getEmbedding(text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text.replace(/\n/g, " "),
    });
    return response.data[0].embedding;
  }

  public async retrieveContext(query: string): Promise<string> {
    try {
        const embedding = await this.getEmbedding(query);
        const embeddingStr = JSON.stringify(embedding);
        
        // FIX: Sintassi corretta per Kysely Raw Query
        // Nota: chiamiamo la funzione match_knowledge definita in SQL
        const result = await sql<any>`
          select * from match_knowledge(
            ${embeddingStr}::vector, 
            0.5, 
            5
          )
        `.execute(db);

        if (result.rows.length === 0) return "";

        return result.rows.map((row: any) => `
        --- KNOWLEDGE FRAGMENT (${row.metadata?.type || 'General'}) ---
        ${row.content}
        `).join("\n\n");
    } catch (e) {
        console.warn("⚠️ RAG Retrieval fallito (Skipping):", e);
        return "";
    }
  }

  public async addDocument(content: string, type: string) {
    const embedding = await this.getEmbedding(content);
    // Cast 'as any' per evitare errori se i tipi del DB non sono rigenerati
    await db.insertInto('knowledge_vectors' as any) 
      .values({
        content,
        metadata: JSON.stringify({ type }),
        embedding: JSON.stringify(embedding)
      })
      .execute();
  }
}