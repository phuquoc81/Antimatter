"use client";

import { useState } from "react";

const starterPrompts = [
  "Describe the first antimatter dimension upgrade path.",
  "Suggest a beginner strategy for earning matter points.",
  "Write a short sci-fi mission briefing for the next level.",
];

export default function Home() {
  const [prompt, setPrompt] = useState(starterPrompts[0]);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: prompt }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to reach the Antimatter assistant.");
      }

      setReply(data.reply);
    } catch (submitError) {
      setReply("");
      setError(submitError.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="hero-card">
        <p className="eyebrow">Deploy-ready on Vercel and Render</p>
        <h1>Antimatter command console</h1>
        <p className="lede">
          Ask the built-in assistant for progression ideas, event flavor text, or
          player guidance. By default, the backend is configured for the
          <strong> gpt-5.4 </strong>
          model.
        </p>

        <div className="prompt-list" aria-label="Starter prompts">
          {starterPrompts.map((starterPrompt) => (
            <button
              key={starterPrompt}
              type="button"
              className="prompt-chip"
              onClick={() => setPrompt(starterPrompt)}
            >
              {starterPrompt}
            </button>
          ))}
        </div>

        <form className="chat-form" onSubmit={handleSubmit}>
          <label className="label" htmlFor="prompt">
            Prompt
          </label>
          <textarea
            id="prompt"
            name="prompt"
            rows={5}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask for an Antimatter strategy or story beat..."
          />
          <button className="submit-button" type="submit" disabled={isLoading}>
            {isLoading ? "Thinking..." : "Send to GPT-5.4"}
          </button>
        </form>

        {error ? (
          <p className="status error" role="alert">
            {error}
          </p>
        ) : null}

        {reply ? (
          <article className="reply-card" aria-live="polite">
            <h2>Assistant response</h2>
            <p>{reply}</p>
          </article>
        ) : null}
      </section>
    </main>
  );
}
