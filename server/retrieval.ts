import { desc, eq } from "drizzle-orm";
import { createEmbedding } from "./_core/llm";
import { documentChunks, documents } from "../drizzle/schema";
import { getDb } from "./db";
import { storagePut } from "./storage";

const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 180;

export function splitIntoChunks(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(normalized.length, start + CHUNK_SIZE);
    const chunk = normalized.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end === normalized.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }
  return chunks;
}

const cosineSimilarity = (a: number[], b: number[]) => {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0; let normA = 0; let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i]; normA += a[i] ** 2; normB += b[i] ** 2;
  }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
};

export async function ingestDocument(input: {
  workspaceId: number;
  uploadedBy: number;
  fileName: string;
  mimeType: string;
  content: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  const fileKey = `${input.workspaceId}-documents/${Date.now()}-${input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const stored = await storagePut(fileKey, input.content, input.mimeType || "text/plain");
  const created = await db.insert(documents).values({
    workspaceId: input.workspaceId,
    uploadedBy: input.uploadedBy,
    fileName: input.fileName,
    mimeType: input.mimeType || "text/plain",
    storageKey: stored.key,
    indexingStatus: "indexing",
  });
  const documentId = Number((created as { insertId?: number }).insertId);
  const chunks = splitIntoChunks(input.content);
  for (let index = 0; index < chunks.length; index += 1) {
    const embedding = await createEmbedding(chunks[index]);
    await db.insert(documentChunks).values({
      documentId,
      workspaceId: input.workspaceId,
      chunkIndex: index,
      content: chunks[index],
      embeddingJson: JSON.stringify(embedding),
      tokenCount: Math.ceil(chunks[index].length / 4),
    });
  }
  await db.update(documents).set({ indexingStatus: "ready", chunkCount: chunks.length }).where(eq(documents.id, documentId));
  return { documentId, fileName: input.fileName, chunkCount: chunks.length, storageUrl: stored.url };
}

export async function retrieveChunks(workspaceId: number, query: string, limit = 4) {
  const db = await getDb();
  if (!db) return [];
  const queryEmbedding = await createEmbedding(query);
  const rows = await db.select().from(documentChunks).where(eq(documentChunks.workspaceId, workspaceId)).orderBy(desc(documentChunks.createdAt));
  return rows.map((row) => ({
    id: row.id,
    documentId: row.documentId,
    content: row.content,
    score: cosineSimilarity(queryEmbedding, JSON.parse(row.embeddingJson) as number[]),
  })).sort((a, b) => b.score - a.score).slice(0, limit);
}
