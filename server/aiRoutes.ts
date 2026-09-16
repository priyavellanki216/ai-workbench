import type { Express, NextFunction, Request, Response } from "express";
import { retrieveChunks, ingestDocument } from "./retrieval";
import { streamLLM, type Message } from "./_core/llm";
import { sdk } from "./_core/sdk";

const getUser = async (req: Request) => {
  try {
    return await sdk.authenticateRequest(req);
  } catch {
    return null;
  }
};

const sendSse = (res: Response, event: string, data: unknown) => {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};

export function registerAiRoutes(app: Express) {
  app.post(
    "/api/documents/upload",
    (req, res, next) => expressRaw(req, res, next),
    async (req, res) => {
      const user = await getUser(req);
      if (!user) return res.status(401).json({ error: "Authentication required" });
      const fileName = String(req.header("x-file-name") || "document.txt");
      const mimeType = String(req.header("x-file-type") || "text/plain");
      const workspaceId = Number(req.header("x-workspace-id") || 1);
      const bytes = req.body as Buffer;
      if (!Buffer.isBuffer(bytes) || bytes.length === 0) return res.status(400).json({ error: "A non-empty file is required" });
      if (!/^text\/(plain|csv|markdown)|application\/json$/.test(mimeType) && !/\.(txt|csv|md|json)$/i.test(fileName)) {
        return res.status(415).json({ error: "The first ingestion pass supports TXT, CSV, Markdown, and JSON files." });
      }
      const content = bytes.toString("utf8");
      if (content.includes("\u0000")) return res.status(415).json({ error: "Binary files are not supported by the text extraction worker yet." });
      try {
        const result = await ingestDocument({ workspaceId, uploadedBy: user.id, fileName, mimeType, content });
        return res.status(201).json(result);
      } catch (error) {
        console.error("[AI] document ingestion failed", error);
        return res.status(500).json({ error: error instanceof Error ? error.message : "Document ingestion failed" });
      }
    },
  );

  app.post("/api/chat/stream", async (req, res) => {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: "Authentication required" });
    const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
    const workspaceId = Number(req.body?.workspaceId || 1);
    if (!question) return res.status(400).json({ error: "question is required" });
    const historyMessages: Message[] = (Array.isArray(req.body?.messages) ? req.body.messages : []).flatMap((item: unknown) => {
      if (!item || typeof item !== "object") return [];
      const candidate = item as { role?: unknown; content?: unknown };
      if ((candidate.role === "user" || candidate.role === "assistant") && typeof candidate.content === "string") {
        return [{ role: candidate.role, content: candidate.content } as Message];
      }
      return [];
    });
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    let finished = false;
    req.on("close", () => { finished = true; });
    try {
      const chunks = await retrieveChunks(workspaceId, question, 4);
      sendSse(res, "sources", chunks.map((chunk, index) => ({ index: index + 1, id: chunk.id, documentId: chunk.documentId, score: Number(chunk.score.toFixed(4)), content: chunk.content })));
      const evidence = chunks.length > 0
        ? chunks.map((chunk, index) => `[Source ${index + 1}] ${chunk.content}`).join("\n\n")
        : "No indexed workspace sources were found. Say that you do not have enough evidence instead of inventing details.";
      const messages: Message[] = [
        { role: "system", content: "You are Workbench Researcher. Answer only from the evidence provided. Cite claims inline as [Source N]. If the evidence is insufficient, say so. Return concise paragraphs and a clearly labeled next move when useful." },
        ...historyMessages.slice(-8),
        { role: "user", content: `Question: ${question}\n\nEvidence:\n${evidence}` },
      ];
      let answer = "";
      await streamLLM({ model: "gpt-5", messages, maxTokens: 900 }, (delta) => {
        if (finished || !delta.text) return;
        answer += delta.text;
        sendSse(res, "delta", { text: delta.text });
      });
      if (!finished) sendSse(res, "done", { answer, grounded: chunks.length > 0, sources: chunks.length });
    } catch (error) {
      if (!finished) sendSse(res, "error", { error: error instanceof Error ? error.message : "Streaming response failed" });
    } finally {
      if (!res.writableEnded) res.end();
    }
  });
}

function expressRaw(req: Request, _res: Response, next: NextFunction) {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  req.on("end", () => {
    req.body = Buffer.concat(chunks);
    next();
  });
}
