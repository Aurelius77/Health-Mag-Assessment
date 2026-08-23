import "server-only";

import { GoogleGenAI, Type } from "@google/genai";
import { getCorpusForAI } from "@/lib/content";
import type { AskCitation, AskResult, AskStatus, LanguageCode } from "@/lib/types";

const MODEL = "gemini-2.5-flash";

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY");
  return key;
}

// The whole behaviour contract for the feature. Grounding + guardrails live
// here so the model can only speak from our vetted content.
const SYSTEM_INSTRUCTION = `You are the "Health Information Companion" for a Nigerian health-education charity.
You help ordinary people understand basic, preventive health guidance.

STRICT RULES:
1. Answer ONLY using the numbered ARTICLES provided in the user message. Never use outside knowledge and never invent facts, numbers, or medicine names.
2. If the articles do not contain the answer, set status = "no_match". In "answer", say you don't have information on that yet and invite the reader to ask about the topics you do cover. Do NOT guess.
3. Set status = "refused" for anything needing a professional: a personal diagnosis, specific drug names or dosages, or interpreting someone's symptoms or test results. Briefly say you can't help with that and advise seeing a clinic or health worker.
4. For any emergency or danger sign (fits/convulsions, trouble breathing, unconsciousness, severe bleeding, a baby who cannot drink or feed, etc.), your FIRST sentence MUST urge going to the nearest clinic or hospital immediately. You may then add relevant guidance from the articles (status = "answered").
5. Refuse anything not about health (status = "refused"), politely.
6. Keep answers short, plain and practical: 2–5 short sentences, simple words.
7. Reply in the requested LANGUAGE: "en" = English, "pcm" = Nigerian Pidgin. If unsure, use English.
8. In "citations", include ONLY the articles you actually used (exact slug + title). Use an empty array whenever status is not "answered".`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    status: { type: Type.STRING, enum: ["answered", "no_match", "refused"] },
    answer: { type: Type.STRING },
    citations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          slug: { type: Type.STRING },
          title: { type: Type.STRING },
        },
        required: ["slug", "title"],
      },
    },
  },
  required: ["status", "answer", "citations"],
  propertyOrdering: ["status", "answer", "citations"],
};

interface RawResult {
  status?: unknown;
  answer?: unknown;
  citations?: unknown;
}

function safeParse(text: string | undefined): RawResult | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as RawResult;
  } catch {
    // Structured output is usually clean JSON, but guard against stray prose.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as RawResult;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function fallbackAnswer(status: AskStatus, lang: LanguageCode): string {
  const pidgin = lang === "pcm";
  if (status === "refused") {
    return pidgin
      ? "I no fit help with dat one. Abeg see health worker or go clinic."
      : "I can't help with that. Please see a clinic or a health worker.";
  }
  return pidgin
    ? "I no get info on dat one yet. Try ask about the health topics wey dey this site."
    : "I don't have information on that yet. Try asking about the health topics covered on this site.";
}

/**
 * Answer a health question strictly from the published corpus.
 * Returns a structured result the UI renders differently per status.
 * Never throws for "no answer" — that is a normal `no_match`/`refused`.
 */
export async function askHealthQuestion(question: string, lang: LanguageCode): Promise<AskResult> {
  const corpus = await getCorpusForAI();
  if (corpus.length === 0) {
    return {
      status: "no_match",
      answer: "No health articles are available yet. Please check back soon.",
      citations: [],
    };
  }

  const bySlug = new Map(corpus.map((a) => [a.slug, a.title]));
  const articlesText = corpus
    .map(
      (a, i) =>
        `#${i + 1} [${a.topic}] "${a.title}" (slug: ${a.slug})\n${a.summary ? a.summary + " — " : ""}${a.body}`,
    )
    .join("\n\n");

  const contents = `LANGUAGE: ${lang}\n\nARTICLES:\n${articlesText}\n\nQUESTION: ${question}`;

  const ai = new GoogleGenAI({ apiKey: apiKey() });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.2,
      maxOutputTokens: 800,
      // gemini-2.5-flash "thinks" by default, which can silently eat the output
      // budget and return empty text. We only need extraction, so switch it off.
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  const parsed = safeParse(response.text);
  if (!parsed) {
    return { status: "no_match", answer: fallbackAnswer("no_match", lang), citations: [] };
  }

  const status: AskStatus =
    parsed.status === "answered" || parsed.status === "refused" ? parsed.status : "no_match";

  const answer =
    typeof parsed.answer === "string" && parsed.answer.trim()
      ? parsed.answer.trim()
      : fallbackAnswer(status, lang);

  // Rebuild citations from our own corpus so links + titles are always real
  // (defends against a hallucinated slug or title).
  const citations: AskCitation[] = [];
  if (status === "answered" && Array.isArray(parsed.citations)) {
    const seen = new Set<string>();
    for (const c of parsed.citations as { slug?: unknown }[]) {
      const slug = typeof c?.slug === "string" ? c.slug : null;
      if (slug && bySlug.has(slug) && !seen.has(slug)) {
        seen.add(slug);
        citations.push({ slug, title: bySlug.get(slug)! });
      }
    }
  }

  return { status, answer, citations };
}
