const SYSTEM_PROMPT =
  "You are the Antimatter game copilot. Give concise, helpful answers about progression, leveling, missions, and world-building for a browser game about collecting antimatter across dimensions.";

export function normalizeMessage(message) {
  if (typeof message !== "string") {
    return "";
  }

  return message.trim();
}

export function buildOpenAIRequest({ message, model }) {
  return {
    model,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: SYSTEM_PROMPT }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: message }],
      },
    ],
  };
}

export function extractOpenAIText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  if (!Array.isArray(response?.output)) {
    return "";
  }

  for (const item of response.output) {
    if (!Array.isArray(item?.content)) {
      continue;
    }

    for (const contentItem of item.content) {
      if (typeof contentItem?.text === "string" && contentItem.text.trim()) {
        return contentItem.text.trim();
      }
    }
  }

  return "";
}
