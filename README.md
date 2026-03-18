# Antimatter

Antimatter is now a minimal Next.js app prepared for deployment on both **Vercel** and **Render** with an OpenAI-powered assistant that defaults to the **`gpt-5.4`** model.

## Requirements

- Node.js 20+
- An `OPENAI_API_KEY`

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

Copy `.env.example` to `.env.local` for local work or set the same values in Vercel/Render:

```bash
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-5.4
```

## Deploy to Vercel

1. Import this repository into Vercel.
2. Set `OPENAI_API_KEY`.
3. Optionally override `OPENAI_MODEL` if you want a different model than `gpt-5.4`.
4. Deploy.

`vercel.json` is included so Vercel treats the project as a Next.js app.

## Deploy to Render

This repository includes `render.yaml` for a Node web service.

1. Create a new Blueprint in Render from this repository.
2. Set `OPENAI_API_KEY`.
3. Optionally override `OPENAI_MODEL`.
4. Deploy.

## Validation

- `npm run lint`
- `npm run test`
- `npm run build`
# phuantimatter

phuantimatter is a game app concept where players travel through dimensions 1 to 100, collect antimatter, unlock new levels, and grow their matter world by earning points.

## Website

This repository now includes a simple landing page for the app:

- `index.html`
- `styles.css`

## Open locally

Because the website is a static page, no build step is required.

1. Open `index.html` in a browser, or
2. Serve the repository with any static file server and open the page in your browser.
Antimatter is a lightweight static demo page for an antimatter clicker concept. It now includes:

- a button-driven antimatter generator
- point tracking with an estimated cash-out value
- payout method selection for Stripe or bank e-Transfer
- a 15% passive boost mode that keeps generating while the page stays open
- owner/developer credit for Phu Quoc Nguyen

Open `/home/runner/work/Antimatter/Antimatter/index.html` in a browser to view the demo.
