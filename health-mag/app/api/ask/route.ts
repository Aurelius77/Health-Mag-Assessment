import { askHealthQuestion } from "@/lib/ai";
import type { AskResult } from "@/lib/types";

// Uses the Node SDKs (Supabase + Gemini); keep this handler on the Node runtime.
export const runtime = "nodejs";

const MIN_LEN = 3;
const MAX_LEN = 1000;

export async function POST(request: Request) {
  let body: { question?: unknown; lang?: unknown };
  try {
    body = (await request.json()) as { question?: unknown; lang?: unknown };
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  const lang = typeof body.lang === "string" && body.lang.trim() ? body.lang.trim() : "en";

  if (question.length < MIN_LEN) {
    return Response.json({ error: "Please enter a question." }, { status: 400 });
  }
  if (question.length > MAX_LEN) {
    return Response.json({ error: "That question is too long — please shorten it." }, { status: 400 });
  }

  try {
    const result: AskResult = await askHealthQuestion(question, lang);
    return Response.json(result);
  } catch (err) {
    console.error("[/api/ask] error:", err);
    return Response.json(
      { error: "The assistant is unavailable right now. Please try again shortly." },
      { status: 502 },
    );
  }
}
