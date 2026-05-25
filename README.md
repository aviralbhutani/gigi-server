# GiGi — AI Meeting Agent

A Node.js/Express server that deploys a voice AI agent into live video meetings. A Recall.ai bot joins the meeting as a participant, rendering an ElevenLabs-powered voice agent as its camera feed. The agent can speak, listen, and dynamically switch the webpage it displays in response to the conversation.

---

## Architecture Overview

```
Admin / Operator
      │
      ▼
 /send-bot  ──────────►  Recall.ai API  ──────────►  Google Meet / Zoom / Teams
                              │                              │
                         Bot joins call                Bot camera renders
                         (camera = agent.html)         agent.html in meeting
                              │
                         agent.html loads
                         ElevenLabs SDK
                              │
                    ElevenLabs Conversational AI
                              │
                    AI calls /tool-call with { url }
                              │
                              ▼
                   POST /output_media/  ──────►  Recall.ai switches bot camera
                   to new URL                    to new webpage live in meeting
```

---

## Stack

- **Runtime:** Node.js 24, TypeScript 5.9
- **Framework:** Express 5
- **Logging:** Pino + pino-http (structured JSON logs)
- **Build:** esbuild (single CJS bundle at `dist/index.mjs`)
- **Package management:** pnpm workspaces (monorepo)
- **External APIs:** Recall.ai (bot management), ElevenLabs (voice AI)
- **Secrets:** `RECALL_API_KEY`, `ELEVENLABS_API_KEY`, `SESSION_SECRET`

---

## Project Structure

```
artifacts/api-server/
├── src/
│   ├── index.ts              # Entry point — binds to PORT
│   ├── app.ts                # Express app, middleware, route mounting
│   ├── lib/
│   │   ├── activeBots.ts     # In-memory store of active bot IDs
│   │   ├── sessions.ts       # botId → conversationId mapping
│   │   └── logger.ts         # Pino singleton logger
│   └── routes/
│       ├── index.ts          # /webhook + /api/healthz
│       ├── sendBot.ts        # /send-bot, /remove-bot
│       ├── launch.ts         # /launch (alternate bot launcher)
│       ├── bots.ts           # /bots, /bots/:id, DELETE /bots/:id
│       ├── session.ts        # /session (register botId ↔ conversationId)
│       └── toolCall.ts       # /tool-call (ElevenLabs → Recall.ai screen switch)
└── public/
    ├── index.html            # Landing page
    ├── admin.html            # Operator dashboard (16+ agents, send/remove bot)
    ├── launch.html           # Simplified launcher UI
    └── agent.html            # ElevenLabs agent page rendered by the bot camera
```

---

## Endpoints

### Bot Management

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/send-bot` | Deploy a Recall.ai bot into a meeting. Accepts `meeting_url`, `agent_url`, `bot_name`. Stores the resulting bot ID in `activeBots`. |
| `POST` | `/remove-bot` | Kick a bot out of a call. Accepts `bot_id`. Calls `POST /leave_call/` on Recall.ai. |
| `POST` | `/launch` | Alternative bot launcher (same behaviour as `/send-bot`). |
| `GET` | `/bots` | List all bots from Recall.ai. |
| `GET` | `/bots/:id` | Get status and details for a specific bot. |
| `DELETE` | `/bots/:id` | Remove a bot from a call by ID. |

### Agent / AI

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/tool-call` | Called by ElevenLabs when the AI agent invokes its `switch_screen` tool. Accepts `{ url, description }`, looks up the latest active bot ID from `activeBots`, then calls `POST /output_media/` on Recall.ai to switch the bot's camera to the new URL. |
| `POST` | `/session` | Register a `botId` ↔ ElevenLabs `conversationId` mapping in memory. |

### System

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/webhook` | Receives lifecycle events from Recall.ai (joining, in_call, recording, call_ended, done). Logs them; used for observability. |
| `GET` | `/api/healthz` | Returns `{ "status": "ok" }`. |

---

## How the Screen Switch Works

When the ElevenLabs agent decides to show a URL to the meeting participants, it invokes its `switch_screen` tool. That tool call hits `/tool-call` on this server with:

```json
{ "url": "https://example.com", "description": "Live fleet tracking" }
```

The server:
1. Retrieves the latest bot ID from the in-memory `activeBots` store
2. Calls `POST https://us-west-2.recall.ai/api/v1/bot/{botId}/output_media/` with:
   ```json
   {
     "camera": {
       "kind": "webpage",
       "config": { "url": "https://example.com" }
     }
   }
   ```
3. Recall.ai switches what the bot's camera renders — the meeting participants see the new page live

**Important:** The correct HTTP method for this endpoint is `POST`. `PUT` and `PATCH` both return `405 Method Not Allowed` — confirmed via `OPTIONS` which returns `Allow: POST, DELETE, OPTIONS`.

---

## Bot Camera — `agent.html`

The bot's camera renders `agent.html`, a minimal page that:
- Loads the `@11labs/client` SDK
- Auto-starts an ElevenLabs Conversational AI session on page load
- Implements reconnect logic so the session recovers if the connection drops
- Passes its public URL to ElevenLabs so tool calls route back to this server

The page is what meeting participants see as the bot's video — it's a live, interactive voice agent running in a browser tab that Recall.ai captures as the camera stream.

---

## Admin Dashboard — `admin.html`

Operator-facing UI that:
- Dropdown of 16+ pre-configured agents (each with a name and `agent_url`)
- Input for a Google Meet / Zoom / Teams URL
- **Send Bot** — calls `/send-bot` and deploys the selected agent into the meeting
- **Remove Bot** — calls `/remove-bot` to eject the bot

---

## In-Memory State

`activeBots.ts` maintains a simple array of bot IDs in process memory:
- `trackBot(id)` — pushes a new bot ID
- `getLatestBotId()` — returns the most recently added bot ID

This means state is lost on server restart. Any active bot sent before a restart will not be controllable via `/tool-call` until a new bot is deployed.

---

## Running Locally

```bash
pnpm --filter @workspace/api-server run dev
```

Requires the following environment secrets to be set:
- `RECALL_API_KEY` — Recall.ai API token
- `ELEVENLABS_API_KEY` — ElevenLabs API key
- `SESSION_SECRET` — Session signing secret

The server binds to `PORT` (default `8080`). In the Replit environment it is routed through the shared proxy at `/`.

---

## Key Debugging Notes

- **405 on `/output_media/`** — only `POST` is allowed (not `PUT` or `PATCH`). Verified via `OPTIONS` response header: `Allow: POST, DELETE, OPTIONS`.
- **`cannot_command_unstarted_bot`** — means the bot has already ended its call. Redeploy a fresh bot via `/send-bot`.
- **`activeBots` is empty after restart** — in-memory state is wiped on every server restart. Always send a new bot after deploying a new server build.
- **Bot ID flow** — `/send-bot` → Recall.ai returns `{ id }` → stored via `trackBot()` → `/tool-call` reads it via `getLatestBotId()`.
