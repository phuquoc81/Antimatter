import { NextResponse } from "next/server";
import {
  buildOpenAIRequest,
  extractOpenAIText,
  normalizeMessage,
} from "../../../lib/openai";

export const runtime = "nodejs";

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5.4";

export async function POST(request) {
  let body;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const message = normalizeMessage(body?.message);

  if (!message) {
    return NextResponse.json(
      { error: "Please enter a prompt before submitting." },
      { status: 400 },
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY is not configured yet. Set it in Vercel or Render before using the assistant.",
      },
      { status: 503 },
    );
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(
        buildOpenAIRequest({
          message,
          model: DEFAULT_MODEL,
        }),
      ),
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMessage =
        data?.error?.message || "OpenAI rejected the request.";

      return NextResponse.json({ error: errorMessage }, { status: response.status });
    }

    const reply = extractOpenAIText(data);

    if (!reply) {
      return NextResponse.json(
        { error: "The model response did not contain any text output." },
        { status: 502 },
      );
    }

    return NextResponse.json({ reply, model: DEFAULT_MODEL });
  } catch {
    return NextResponse.json(
      { error: "Unable to contact OpenAI right now. Please try again shortly." },
      { status: 502 },
    );
  }
}
