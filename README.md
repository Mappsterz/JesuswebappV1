# Walk With Me

A compassionate AI spiritual companion inspired by the teachings of Jesus Christ. It offers comfort, reflection, prayer, and Scripture through a calm, streaming chat interface.

> Walk With Me is not a substitute for a local church, pastor, or licensed counselor. If you are in crisis, call or text 988 (US Suicide & Crisis Lifeline) or text HOME to 741741.

## Features

- Streaming chat with a warm, pastoral persona
- Multiple conversations with rename, archive, and delete
- Markdown-rendered responses (bold, lists, blockquotes, verses)
- Stop generation mid-response, regenerate the last reply, and copy any message
- Scripture lookup panel backed by `bible-api.com`, with insert-into-chat
- Daily devotional that rotates through a curated set of passages
- Light and dark (parchment) themes
- Export / import conversations as JSON
- Installable as a PWA

## Tech stack

- Next.js 16 (App Router) + React 19
- CSS Modules
- `react-markdown` + `remark-gfm`
- Dual AI backend: Ollama (local) or Google Gemini (cloud)

## Architecture

```
app/
  api/
    chat/route.ts        # streaming chat: Ollama or Gemini
    bible/route.ts        # cached bible-api.com proxy
  components/             # UI: Sidebar, MessageList, ChatInput, BiblePanel, modals, icons
  hooks/                  # useConversations, useChatStream, useTheme
  page.tsx                # thin orchestrator
  layout.tsx              # fonts + metadata
  manifest.ts             # PWA manifest
lib/
  types.ts
  devotional.ts           # daily passage rotation
ollama/
  Modelfile               # custom "walk-with-me" persona
  setup.sh
```

## Getting started (local, Ollama)

1. Install [Ollama](https://ollama.com) and start it:

```bash
ollama serve
```

2. Create the custom model:

```bash
cd ollama && bash setup.sh
```

3. Run the dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Local environment variables (optional)

| Variable | Default | Purpose |
|----------|---------|---------|
| `OLLAMA_URL` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `walk-with-me` | Ollama model name |

## Deploying to Vercel (Gemini)

On Vercel there is no local Ollama, so the app uses Google Gemini.

1. Set environment variables in the Vercel project:

| Variable | Required | Purpose |
|----------|----------|---------|
| `GEMINI_API_KEY` | Yes | Enables the Gemini backend |
| `GEMINI_MODEL` | No | Model ID (default `gemini-2.5-flash-lite` for speed; use `gemini-3.5-flash` for higher quality) |
| `GEMINI_MAX_OUTPUT_TOKENS` | No | Cap reply length (default `768`) |

**Response time tips on Vercel:** The default model is `gemini-2.5-flash-lite` for faster time-to-first-token. The API trims long chats to the last 12 messages and caps output at 768 tokens so replies stay concise.

2. Deploy:

```bash
npx vercel deploy --prod
```

The chat route uses a singleton Gemini client (no per-request SDK import), runs on the Node.js runtime with `maxDuration = 60`, and trims conversation history before each request.

## Backend selection logic

- If `OLLAMA_URL` is set, Ollama is used.
- Else if `GEMINI_API_KEY` is set, Gemini is used (typical on Vercel).
- Otherwise it tries Ollama at `localhost`.
