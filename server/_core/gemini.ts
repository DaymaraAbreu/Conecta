import type { Express, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";

type ChatTurn = { role: "user" | "model"; text: string };

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  error?: { message?: string; status?: string };
};

const SYSTEM_INSTRUCTION = [
  "Você é o Assistente Gemini do aplicativo Conecta, uma ponte de mensagens acessível.",
  "Converse em português brasileiro, com tom respeitoso, acolhedor e direto.",
  "Prefira frases claras e curtas, explique termos difíceis e organize respostas longas em passos simples.",
  "Responda ao que a pessoa perguntou; não invente fatos nem diga que enviou mensagens ou executou ações no aplicativo.",
  "Você não substitui profissionais de saúde, serviços de emergência, orientação jurídica ou financeira.",
  "Se a pessoa estiver em perigo imediato, incentive-a a procurar os serviços de emergência locais e alguém de confiança.",
].join(" ");

const MAX_MESSAGE_CHARS = 4_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_HISTORY_MESSAGES = 12;
const MAX_TURN_CHARS = 4_000;
const REQUESTS_PER_MINUTE = 20;
const requestCounts = new Map<string, { startedAt: number; count: number }>();
let remoteJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let remoteJwksUrl = "";

function getRemoteJwks() {
  const url = process.env.CLERK_JWKS_URL?.trim() ?? "";
  if (!url) return null;
  if (url !== remoteJwksUrl) {
    remoteJwksUrl = url;
    remoteJwks = createRemoteJWKSet(new URL(url));
  }
  return remoteJwks;
}

function configuredSupabaseOrigin() {
  const configured = process.env.SUPABASE_URL?.trim() || process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || "";
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return url.origin;
  } catch { return null; }
}
function hasImageSignature(bytes: Uint8Array, mime: string) {
  if (mime === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((b, i) => bytes[i] === b);
  if (mime === "image/gif") return bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(Buffer.from(bytes.subarray(0, 6)).toString("ascii"));
  if (mime === "image/webp") return bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP";
  return false;
}
async function readLimitedImage(response: globalThis.Response) {
  const lengthHeader = response.headers.get("content-length");
  if (lengthHeader !== null && (!/^\d+$/.test(lengthHeader) || Number(lengthHeader) > MAX_IMAGE_BYTES)) throw new Error("invalid-image");
  const mime = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!IMAGE_MIME_TYPES.has(mime) || !response.body) throw new Error("invalid-image");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_IMAGE_BYTES) { await reader.cancel(); throw new Error("invalid-image"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  if (!total || !hasImageSignature(bytes, mime)) throw new Error("invalid-image");
  return { bytes, mime };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRateLimited(subject: string) {
  const now = Date.now();
  const existing = requestCounts.get(subject);
  if (!existing || now - existing.startedAt >= 60_000) {
    requestCounts.set(subject, { startedAt: now, count: 1 });
    if (requestCounts.size > 10_000) {
      for (const [key, value] of requestCounts) {
        if (now - value.startedAt >= 60_000) requestCounts.delete(key);
      }
    }
    return false;
  }
  existing.count += 1;
  return existing.count > REQUESTS_PER_MINUTE;
}

function parseHistory(value: unknown): ChatTurn[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_HISTORY_MESSAGES) return null;
  const turns: ChatTurn[] = [];
  for (const item of value) {
    if (!isRecord(item) || (item.role !== "user" && item.role !== "model") || typeof item.text !== "string") {
      return null;
    }
    const text = item.text.trim();
    if (!text || text.length > MAX_TURN_CHARS) return null;
    turns.push({ role: item.role, text });
  }
  return turns;
}

async function verifyClerkSubject(request: Request) {
  const authorization = request.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const issuer = process.env.CLERK_ISSUER?.trim();
  if (!token || !issuer) return null;
  try {
    const jwks = getRemoteJwks();
    if (!jwks) return null;
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      algorithms: ["RS256", "ES256"],
    });
    return typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    return null;
  }
}

export function registerGeminiRoutes(app: Express) {
  app.post("/api/ai/simplify-message", async (request: Request, response: Response) => {
    const subject = await verifyClerkSubject(request);
    if (!subject) {
      response.status(401).json({ error: "É necessário entrar na sua conta para usar a IA assistiva." });
      return;
    }
    if (isRateLimited(subject)) {
      response.status(429).json({ error: "Você enviou muitas solicitações em pouco tempo. Aguarde um minuto e tente novamente." });
      return;
    }
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      response.status(503).json({ error: "A IA ainda não está configurada no servidor." });
      return;
    }
    const body = isRecord(request.body) ? request.body : {};
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text || text.length > MAX_MESSAGE_CHARS) {
      response.status(400).json({ error: "Texto inválido. Informe até 4.000 caracteres." });
      return;
    }
    const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
    if (!/^gemini-[a-zA-Z0-9._-]+$/.test(model)) {
      response.status(500).json({ error: "A configuração do modelo Gemini é inválida." });
      return;
    }
    try {
      const result = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: "Reescreva a mensagem em português brasileiro simples e claro. Preserve rigorosamente o sentido, nomes, datas e fatos. Não adicione explicações nem conteúdo novo. Retorne somente a mensagem reescrita." }] },
          contents: [{ role: "user", parts: [{ text }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1_000 },
        }),
        signal: AbortSignal.timeout(35_000),
      });
      const payload = await result.json().catch(() => ({})) as GeminiResponse;
      const simplified = payload.candidates?.[0]?.content?.parts?.map((part) => typeof part.text === "string" ? part.text : "").join("").trim();
      if (!result.ok || !simplified) {
        response.status(result.status === 429 ? 429 : 502).json({ error: "Não foi possível simplificar a mensagem agora. Tente novamente." });
        return;
      }
      response.json({ text: simplified, model });
    } catch {
      response.status(502).json({ error: "Não foi possível conectar ao serviço de IA. Tente novamente." });
    }
  });

  app.post("/api/ai/describe-image", async (request: Request, response: Response) => {
    const subject = await verifyClerkSubject(request);
    if (!subject) {
      response.status(401).json({ error: "É necessário entrar na sua conta para usar a IA assistiva." });
      return;
    }
    if (isRateLimited(subject)) {
      response.status(429).json({ error: "Você enviou muitas solicitações em pouco tempo. Aguarde um minuto e tente novamente." });
      return;
    }
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      response.status(503).json({ error: "A IA ainda não está configurada no servidor." });
      return;
    }
    const body = isRecord(request.body) ? request.body : {};
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(imageUrl);
    } catch {
      response.status(400).json({ error: "Endereço da imagem inválido." });
      return;
    }
    const storageOrigin = configuredSupabaseOrigin();
    if (!storageOrigin) {
      response.status(503).json({ error: "Configure SUPABASE_URL no servidor com a URL HTTPS exata do projeto." });
      return;
    }
    if (parsedUrl.origin !== storageOrigin || !parsedUrl.pathname.startsWith("/storage/v1/object/sign/chat-media/") || !parsedUrl.searchParams.has("token") || parsedUrl.username || parsedUrl.password) {
      response.status(400).json({ error: "A imagem deve ser um link assinado do bucket privado chat-media do projeto configurado." });
      return;
    }
    const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
    if (!/^gemini-[a-zA-Z0-9._-]+$/.test(model)) {
      response.status(500).json({ error: "A configuração do modelo Gemini é inválida." });
      return;
    }
    try {
      const imageResponse = await fetch(parsedUrl, { signal: AbortSignal.timeout(15_000), redirect: "error" });
      if (!imageResponse.ok) {
        response.status(400).json({ error: "A imagem não é válida ou excede o limite de 8 MB." });
        return;
      }
      let image: { bytes: Uint8Array; mime: string };
      try { image = await readLimitedImage(imageResponse); }
      catch {
        response.status(400).json({ error: "A imagem não é válida ou excede o limite de 8 MB." });
        return;
      }
      const { bytes, mime: contentType } = image;
      const binary = Buffer.from(bytes).toString("base64");
      const result = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: "Descreva em português brasileiro, de forma objetiva e acessível, os elementos visuais relevantes da imagem. Não identifique pessoas nem deduza atributos sensíveis. Retorne apenas a descrição." }] },
          contents: [{ role: "user", parts: [{ text: "Descreva esta imagem." }, { inlineData: { mimeType: contentType, data: binary } }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 500 },
        }),
        signal: AbortSignal.timeout(35_000),
      });
      const payload = await result.json().catch(() => ({})) as GeminiResponse;
      const description = payload.candidates?.[0]?.content?.parts?.map((part) => typeof part.text === "string" ? part.text : "").join("").trim();
      if (!result.ok || !description) {
        response.status(result.status === 429 ? 429 : 502).json({ error: "Não foi possível descrever a imagem agora. Tente novamente." });
        return;
      }
      response.json({ text: description, model });
    } catch {
      response.status(502).json({ error: "Não foi possível acessar a imagem ou conectar ao serviço de IA." });
    }
  });

  app.post("/api/ai/chat", async (request: Request, response: Response) => {
    const subject = await verifyClerkSubject(request);
    if (!subject) {
      response.status(401).json({ error: "É necessário entrar na sua conta para conversar com a IA." });
      return;
    }
    if (isRateLimited(subject)) {
      response.status(429).json({ error: "Você enviou muitas mensagens em pouco tempo. Aguarde um minuto e tente novamente." });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      response.status(503).json({ error: "A IA ainda não está configurada no servidor. Defina GEMINI_API_KEY." });
      return;
    }

    const model = process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
    if (!/^gemini-[a-zA-Z0-9._-]+$/.test(model)) {
      response.status(500).json({ error: "A configuração do modelo Gemini é inválida." });
      return;
    }

    const body = isRecord(request.body) ? request.body : {};
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const history = parseHistory(body.history);
    if (!message || message.length > MAX_MESSAGE_CHARS || !history) {
      response.status(400).json({ error: "Mensagem ou histórico inválido. O limite é 4.000 caracteres por mensagem e 12 mensagens anteriores." });
      return;
    }

    const contents = [
      ...history.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
      { role: "user", parts: [{ text: message }] },
    ];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    try {
      const geminiResponse = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents,
          generationConfig: { temperature: 0.6, maxOutputTokens: 900 },
        }),
        signal: AbortSignal.timeout(35_000),
      });
      const payload = await geminiResponse.json().catch(() => ({})) as GeminiResponse;
      if (!geminiResponse.ok) {
        const status = geminiResponse.status === 429 ? 429 : 502;
        response.status(status).json({
          error: status === 429
            ? "O Gemini está com limite de uso no momento. Tente novamente mais tarde."
            : "O Gemini não conseguiu responder agora. Tente novamente em instantes.",
        });
        return;
      }
      const text = payload.candidates?.[0]?.content?.parts
        ?.map((part) => typeof part.text === "string" ? part.text : "")
        .join("")
        .trim();
      if (!text) {
        response.status(502).json({ error: "O Gemini não retornou uma resposta em texto. Reformule a mensagem e tente novamente." });
        return;
      }
      response.json({ text, model });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      response.status(502).json({
        error: timedOut
          ? "O Gemini demorou para responder. Tente enviar novamente."
          : "Não foi possível conectar ao Gemini. Verifique a conexão e tente novamente.",
      });
    }
  });
}
