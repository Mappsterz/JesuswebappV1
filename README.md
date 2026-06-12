# Walk With Me

A compassionate AI spiritual guide inspired by the teachings of Jesus Christ. It offers comfort, reflection, prayer, and Scripture through a calm, streaming chat interface.

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
- Pluggable AI backends: Ollama (local), any OpenAI-compatible API (Groq, OpenRouter, Together, …), or Google Gemini

## Architecture

```
app/
  api/
    chat/route.ts        # streaming chat: provider chain + watchdog + error markers
    bible/route.ts        # cached bible-api.com proxy
  components/             # UI: Sidebar, MessageList, ChatInput, BiblePanel, modals, icons
  hooks/                  # useConversations, useChatStream, useTheme
  page.tsx                # thin orchestrator
  layout.tsx              # fonts + metadata
  manifest.ts             # PWA manifest
lib/
  types.ts
  devotional.ts           # daily passage rotation
  providers/              # backend adapters: ollama, openaiCompat, gemini
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

## Deploying to Vercel (cloud backends)

On Vercel there is no local Ollama, so configure a cloud backend — either any
OpenAI-compatible provider (Groq, OpenRouter, Together, Mistral, OpenAI, …) or
Google Gemini. Configuring both gives you a fallback chain.

1. Set environment variables in the Vercel project:

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENAI_API_KEY` | One of the two keys | Enables the OpenAI-compatible backend |
| `OPENAI_BASE_URL` | No | Endpoint base (default `https://api.openai.com/v1`; e.g. `https://api.groq.com/openai/v1`) |
| `OPENAI_MODELS` | No | Comma-separated model fallback chain (default `gpt-4o-mini`) |
| `OPENAI_MAX_OUTPUT_TOKENS` | No | Cap reply length (default `768`) |
| `GEMINI_API_KEY` | One of the two keys | Enables the Gemini backend |
| `GEMINI_MODELS` | No | Comma-separated model fallback chain (default `gemini-2.5-flash,gemini-2.5-flash-lite`) |
| `GEMINI_MAX_OUTPUT_TOKENS` | No | Cap reply length (default `768`) |
| `CHAT_PROVIDERS` | No | Explicit provider order, e.g. `openai,gemini` |

**Response time tips on Vercel:** The API trims long chats to the last 12 messages and caps output at 768 tokens so replies stay concise.

2. Deploy:

```bash
npx vercel deploy --prod
```

The chat route runs on the Node.js runtime with `maxDuration = 60` and trims conversation history before each request.

## Backend selection logic

Providers form a fallback chain, tried in order until one streams successfully:

1. `ollama` — included first when `OLLAMA_URL` is set
2. `openai` — included when `OPENAI_API_KEY` is set (any OpenAI-compatible endpoint via `OPENAI_BASE_URL`)
3. `gemini` — included when `GEMINI_API_KEY` is set

With nothing configured, the app tries Ollama at `localhost` (local dev default). Set `CHAT_PROVIDERS` (e.g. `ollama,openai`) to override the order explicitly.
