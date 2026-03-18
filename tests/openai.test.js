import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOpenAIRequest,
  extractOpenAIText,
  normalizeMessage,
} from "../lib/openai.js";

test("normalizeMessage trims strings and rejects non-strings", () => {
  assert.equal(normalizeMessage("  hello antimatter  "), "hello antimatter");
  assert.equal(normalizeMessage(""), "");
  assert.equal(normalizeMessage(null), "");
});

test("buildOpenAIRequest uses the selected model and user message", () => {
  const payload = buildOpenAIRequest({
    message: "Plan my next upgrade.",
    model: "gpt-5.4",
  });

  assert.equal(payload.model, "gpt-5.4");
  assert.equal(payload.input[1].content[0].text, "Plan my next upgrade.");
});

test("extractOpenAIText supports direct and nested text formats", () => {
  assert.equal(extractOpenAIText({ output_text: "Direct reply" }), "Direct reply");
  assert.equal(
    extractOpenAIText({
      output: [
        {
          content: [{ type: "output_text", text: "Nested reply" }],
        },
      ],
    }),
    "Nested reply",
  );
  assert.equal(extractOpenAIText({ output: [] }), "");
});
