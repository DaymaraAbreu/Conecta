import type { Express, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";

const MAX_AUDIO_BYTES = 12 * 1024 * 1024;
const TRANSCRIPTIONS_PER_MINUTE = 10;
const MIME_TYPES = new Set(["audio/mp4", "audio/m4a", "audio/mpeg", "audio/mp3", "audio/wav", "audio/webm", "audio/ogg", "audio/aac", "audio/flac"]);
const transcriptionCounts = new Map<string, { startedAt: number; count: number }>();
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksEndpoint = "";

function remoteJwks() {
  const endpoint = process.env.CLERK_JWKS_URL?.trim() ?? "";
  if (!endpoint) return null;
  if (endpoint !== jwksEndpoint) {
    jwksEndpoint = endpoint;
    jwks = createRemoteJWKSet(new URL(endpoint));
  }
  return jwks;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTranscriptionRateLimited(subject: string) {
  const now = Date.now();
  const current = transcriptionCounts.get(subject);
  if (!current || now - current.startedAt >= 60_000) {
    transcriptionCounts.set(subject, { startedAt: now, count: 1 });
    if (transcriptionCounts.size > 10_000) {
      for (const [key, item] of transcriptionCounts) {
        if (now - item.startedAt >= 60_000) transcriptionCounts.delete(key);
      }
    }
    return false;
  }
  current.count += 1;
  return current.count > TRANSCRIPTIONS_PER_MINUTE;
}

async function verifySubject(req: Request) {
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const issuer = process.env.CLERK_ISSUER?.trim();
  if (!token || !issuer) return null;
  try {
    const keySet = remoteJwks();
    if (!keySet) return null;
    const { payload } = await jwtVerify(token, keySet, { issuer, algorithms: ["RS256", "ES256"] });
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

function allowedStorageOrigin() {
  const configured = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim() || "";
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return url.protocol === "https:" ? url.origin : process.env.NODE_ENV === "development" && url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

async function downloadAudio(url: URL) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "error" });
  if (!response.ok) throw new Error("Não foi possível obter o áudio autorizado no Storage.");
  const mimeType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!MIME_TYPES.has(mimeType)) throw new Error("O arquivo não está em um formato de áudio compatível.");
  const lengthHeader = response.headers.get("content-length");
  const length = lengthHeader === null ? 0 : Number(lengthHeader);
  if (lengthHeader !== null && (!/^\d+$/.test(lengthHeader) || !Number.isSafeInteger(length) || length > MAX_AUDIO_BYTES)) throw new Error("O áudio excede o limite de 12 MB para transcrição.");
  if (!response.body) throw new Error("O Storage retornou um áudio vazio.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_AUDIO_BYTES) {
        await reader.cancel();
        throw new Error("O áudio excede o limite de 12 MB para transcrição.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!total) throw new Error("O áudio está vazio.");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const ascii = (start: number, end: number) => Buffer.from(bytes.subarray(start, end)).toString("ascii");
  const signatureOk = mimeType === "audio/wav" ? ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE"
    : mimeType === "audio/ogg" ? ascii(0, 4) === "OggS"
    : mimeType === "audio/webm" ? bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
    : mimeType === "audio/flac" ? ascii(0, 4) === "fLaC"
    : mimeType === "audio/aac" ? bytes.length > 1 && bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0
    : mimeType === "audio/mp3" || mimeType === "audio/mpeg" ? (ascii(0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))
    : mimeType === "audio/mp4" || mimeType === "audio/m4a" ? bytes.length >= 12 && ascii(4, 8) === "ftyp"
    : false;
  if (!signatureOk) throw new Error("O conteúdo não corresponde ao formato de áudio declarado.");
  return { mimeType, bytes };
}

export function registerAudioTranscriptionRoute(app: Express) {
  app.post("/api/ai/transcribe-audio", async (req: Request, res: Response) => {
    const subject = await verifySubject(req);
    if (!subject) {
      res.status(401).json({ error: "Entre na sua conta para transcrever este áudio." });
      return;
    }
    if (isTranscriptionRateLimited(subject)) {
      res.status(429).json({ error: "Limite de transcrições atingido. Aguarde um minuto e tente novamente." });
      return;
    }
    const body = record(req.body) ? req.body : {};
    if (typeof body.audioUrl !== "string" || body.audioUrl.length > 4_096) {
      res.status(400).json({ error: "URL assinada do áudio inválida." });
      return;
    }
    const storageOrigin = allowedStorageOrigin();
    if (!storageOrigin) {
      res.status(503).json({ error: "Configure SUPABASE_URL ou EXPO_PUBLIC_SUPABASE_URL no servidor." });
      return;
    }
    let audioUrl: URL;
    try {
      audioUrl = new URL(body.audioUrl);
    } catch {
      res.status(400).json({ error: "URL assinada do áudio inválida." });
      return;
    }
    if (audioUrl.origin !== storageOrigin || !audioUrl.pathname.startsWith("/storage/v1/object/sign/chat-media/") || !audioUrl.searchParams.has("token")) {
      res.status(403).json({ error: "A URL não corresponde a um áudio assinado do bucket privado do chat." });
      return;
    }
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      res.status(503).json({ error: "Transcrição indisponível: configure GEMINI_API_KEY no servidor." });
      return;
    }
    try {
      const { mimeType, bytes } = await downloadAudio(audioUrl);
      const model = process.env.GEMINI_TRANSCRIPTION_MODEL?.trim() || "gemini-3.5-transcribe";
      const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ parts: [
            { text: "Transcreva fielmente em português brasileiro o que é falado no áudio. Retorne somente a transcrição, sem comentários, resumo ou identificação de pessoas." },
            { inlineData: { mimeType, data: Buffer.from(bytes).toString("base64") } },
          ] }],
          generationConfig: { temperature: 0, maxOutputTokens: 2_000 },
        }),
        signal: AbortSignal.timeout(45_000),
      });
      const payload = await geminiResponse.json().catch(() => ({})) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      if (!geminiResponse.ok) {
        res.status(geminiResponse.status === 429 ? 429 : 502).json({ error: geminiResponse.status === 429
          ? "O Gemini está com limite de transcrição no momento. Tente mais tarde."
          : "O Gemini não conseguiu transcrever o áudio agora." });
        return;
      }
      const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
      if (!text) {
        res.status(422).json({ error: "Não foi possível reconhecer fala neste áudio." });
        return;
      }
      res.json({ text, model });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível transcrever o áudio.";
      const status = /limite de 12 MB/.test(message) ? 413 : 502;
      res.status(status).json({ error: message });
    }
  });
}
