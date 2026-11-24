# Binary

An open-source personal AI assistant you run on your own machine: AI coworkers
that chat with you, use your apps and do real work, always asking before
anything risky.

So far: a monorepo with an API, a web app and a mobile app, sharing one
Postgres database and email-and-password sign-in (chapter 1), plus an AI engine
that uses each person's own OpenAI, Anthropic or Google key, stored encrypted,
with a Playground to try it (chapter 3), and agents you hire, each played by
a cartoon character, on the web and the phone (chapter 4), and routines that
run on a schedule, from a webhook or on demand, as durable jobs on
Trigger.dev (chapter 7), and approvals: risky tools ask for your OK in the
chat and in a Today inbox (chapter 8), and cloud sandboxes from E2B where
characters run code and draw charts (chapter 9).

## What's inside

| Path                         | What it is                                                                 |
| ---------------------------- | -------------------------------------------------------------------------- |
| `apps/api`                   | Hono API on Node: Better Auth, the key vault, the AI engine and routes.    |
| `apps/web`                   | Next.js web app with Tailwind and shadcn/ui.                               |
| `apps/mobile`                | Expo app (Expo Router). Keeps the session in secure storage.               |
| `packages/shared`            | Validation (Zod), provider list, API types and design tokens.              |
| `packages/db`                | Drizzle schema, migrations and database client.                            |
| `packages/eslint-config`     | Lint rules based on the Google TypeScript Style Guide.                     |
| `packages/typescript-config` | Shared `tsconfig` settings.                                                |
| `docs/design-system.md`      | Colours, spacing, type and component rules. Read before building a screen. |

## Requirements

- Node.js 24 or newer
- pnpm 11 (`corepack enable` picks the right version)
- Docker, for Postgres
- For the phone: the Expo Go app, on the same Wi-Fi as your computer

## Getting started

```sh
pnpm install
pnpm run setup   # .env with random secrets, Postgres, migrations
pnpm dev         # Postgres + API (port 3001) + web (port 3000)
```

Open http://localhost:3000 and sign in as **demo@binary.dev /
binary-demo-password** (or create an account). Add a key on **API keys**, then
hire someone from **Discover** and give them a task.

> Use `pnpm run setup`, not `pnpm setup`. `pnpm setup` is a built-in pnpm
> command that sets up pnpm itself, so it never reaches this project's script.

### On your phone

With `pnpm dev` running, start Expo in a second terminal and scan the QR code
with your phone's camera (iPhone) or the Expo Go app (Android):

```sh
pnpm mobile
```

The phone talks to the API at your computer's Wi-Fi address, which
`pnpm run setup` writes to `apps/mobile/.env.local`. If your address changes
(new network, new router), run `pnpm run setup` again.

## Everyday commands

| Command            | What it does                                 |
| ------------------ | -------------------------------------------- |
| `pnpm dev`         | Start Postgres, the API and the web app.     |
| `pnpm mobile`      | Start the Expo dev server for the phone.     |
| `pnpm trigger:dev` | Run the Trigger.dev worker (routines).       |
| `pnpm lint`        | ESLint, then a Prettier formatting check.    |
| `pnpm format`      | Fix formatting with Prettier.                |
| `pnpm check-types` | TypeScript in every package.                 |
| `pnpm test`        | Unit tests, plus API tests against Postgres. |
| `pnpm build`       | Production build of the web app.             |
| `pnpm db:migrate`  | Apply database migrations.                   |
| `pnpm db:down`     | Stop Postgres (your data is kept).           |

### Changing the database

1. Edit the schema in `packages/db/src/schema/`.
2. `pnpm --filter @binary/db db:generate` writes a migration.
3. `pnpm db:migrate` applies it. Tests migrate their own database.

## How sign-in works

- The **API** runs Better Auth and stores users and sessions in Postgres. It
  refuses to start if `BETTER_AUTH_SECRET` is missing, shorter than 32
  characters, or still a placeholder.
- The **web app** forwards `/api/*` to the API, so the session cookie
  belongs to the web app. `apps/web/proxy.ts` checks the session before each
  page: signed out goes to `/sign-in`, signed in skips the sign-in pages.
- The **mobile app** calls the API directly and stores the session in the
  phone's secure storage (Keychain or Keystore).
- **Validation** lives in `packages/shared`. Web, mobile and the API run the
  same Zod schemas, so the error messages are identical everywhere.

## How the AI engine works

```
API keys page ──save──▶ /api/keys ──encrypt──▶ provider_keys (ciphertext only)
Playground ──one request per provider──▶ /api/playground
   └▶ engine factory: find key ▶ decrypt ▶ ApiEngine (Vercel AI SDK) ▶ provider
```

- **Key vault** (`apps/api/src/vault.ts`): AES-256-GCM with one master key,
  `ENCRYPTION_KEY` in `.env`. Each key is tied to its owner and provider, so a
  stored value copied onto another row won't decrypt. The API refuses to start
  without a valid master key. **Back it up**: if it changes, saved keys can't
  be read and people have to add them again.
- A plain key never leaves the API. The database stores ciphertext plus the
  last 4 characters, and the API only ever returns those 4 characters.
- **Engine** (`apps/api/src/engine/`): one `Engine` interface (`stream()` an
  answer), one implementation (`ApiEngine`, on the Vercel AI SDK), and a
  factory that hands back a ready engine for a person and a model. Later
  chapters add engines behind the same interface.
- **Playground**: the web app sends one request per connected provider, and
  each answer streams back as newline-delimited JSON (`start`, `text`, then
  `done` or `error`).
- Default models live in `packages/shared/src/providers.ts`.
- Tests use the AI SDK's fake model (`MockLanguageModelV4`), never real keys.

## How agents work

- An **agent** has a name, a job, instructions, a provider and a model, and is
  played by a **character** from the cast in `packages/shared/src/characters.ts`
  (Nova, Bolt, Mimi, Sunny, Ember, Moss, Pebble, Juno).
- Each character is drawn once, as plain shapes. The web app turns them into
  SVG animated with CSS, and the phone app into `react-native-svg` animated
  with React Native's `Animated`. Both hold still for reduced motion.
- **Templates** (seeded by `pnpm db:seed`) are copied into a new agent, so
  editing an agent never changes its template.
- Every reply rebuilds the **system prompt** from the agent's job,
  instructions and its character's personality
  (`apps/api/src/agents/system-prompt.ts`), so edits apply to the next answer.
- Every query is scoped to the signed-in person. Someone else's agent or chat
  gets the same 404 as one that doesn't exist.
- **Firing** an agent takes it off your crew, but keeps its chats to read.

## How chats work

Every conversation is a **thread** of **messages** in Postgres, named after
its first message. Recent chats lists them newest first.

What happens when you send a message
(`POST /api/threads/:id/messages`, in `apps/api/src/routes/threads.ts`):

1. **Checks first.** The chat must be yours (404), the message valid (400),
   the agent still on the crew and its key saved (409). These come back as
   normal JSON errors, before any streaming starts.
2. **Your message is saved**, so it's never lost.
3. **The model reads the last 20 messages** plus the system prompt. Older
   messages stay in the chat but aren't sent, so a long chat costs no more
   than a short one.
4. **The answer streams** as newline-delimited JSON over `fetch`: `start`,
   then a `delta` line for every few words, then `done` (the answer, now
   saved) or `error` (nothing saved; the words that arrived stay on screen
   with the reason). NDJSON over `fetch` works with POST bodies and cookies
   on both the web and the phone, which `EventSource` doesn't.
5. If you close the tab part-way, the server still finishes the answer and
   saves it.

Only the tab that sent the message streams. Other tabs and devices see new
messages after a reload.

## How tools work

Agents can call **tools** while they answer: the model asks for a tool,
reads its result, then carries on (up to 6 steps per answer). Each call
shows up live inside the reply, and is saved with it.

- **Built in** (`apps/api/src/tools/built-in.ts`): `get_current_time` and
  `fetch_web_page`.
- **Apps**: any MCP server you reach by URL (Streamable HTTP). Connect one
  on **Apps & tools**; it's tested before it's saved. Its Authorization
  header is encrypted like your API keys and never sent back.
- **Integrations** (Gmail, GitHub, Slack and every other Composio
  toolkit), through the `@composio/core` SDK. Set `COMPOSIO_API_KEY` in
  `.env` (get one at [platform.composio.dev](https://platform.composio.dev))
  and restart `pnpm dev`; without it the page explains how to turn it on.
  - The **Integrations** page lists Composio's whole catalog (cached on the
    API for an hour) with search, category and status filters. Each Binary
    user is their own Composio user and signs in on Composio's page, so
    Binary never sees passwords or account tokens.
  - Agents get the tools of every integration with a working account, plus
    the no-account ones (like Hacker News) you switched on.
  - A Composio tool is `read` only if Composio tags it `readOnlyHint`;
    the rest are `write` and ask first (see **How approvals work**).
  - Toolkits Composio doesn't manage (no shield on the page) need an auth
    config in your Composio dashboard before they can connect.
- **Risk levels**: `read` (only looks things up), `write` (changes something
  outside Binary) and `computer` (sandboxes and computers). An app's
  tool is `read` only if its server marks it `readOnlyHint: true`; anything
  else is `write`.
- **Policy**: each character's **approval mode** decides what runs, what
  asks first and what isn't offered. See **How approvals work**.
- **Public pages only**: `fetch_web_page` refuses this computer, your
  network, cloud metadata addresses and anything else that isn't public.
  The address is checked at the moment of connecting, and again after every
  redirect. (App URLs aren't restricted: you connect those on purpose.)
- **An app that's down** shows an error on Apps & tools. In a chat, its
  tools are left out, the model is told, and the chat carries on.

### Errors

Routes throw typed errors from `apps/api/src/errors.ts` (`NotFoundError`,
`InvalidInputError`, `ConflictError`, `NoKeyError`, `UnsafeUrlError`,
`AppUnreachableError`). One handler turns each into `{code, message}` JSON
with the right status; anything unexpected becomes a plain 500.

## How approvals work

Each character has an **approval mode**, chosen when you hire or edit it
(Permissions). One table in `packages/shared/src/approvals.ts` turns a mode
and a tool's risk into run, ask or never:

| Approval mode          | `read` | `write` | `computer` |
| ---------------------- | ------ | ------- | ---------- |
| Plan only              | never  | never   | never      |
| Ask first              | ask    | ask     | ask        |
| **Auto-approve reads** | run    | ask     | ask        |
| Accept edits           | run    | run     | ask        |

New characters start on Auto-approve reads; characters hired before
approvals existed got it too, so what they already did doesn't change.

- **Asking holds nothing open.** A tool that must ask doesn't run: it
  returns `waiting_for_approval` to the model, which says what it wants to
  do, and the answer finishes. The answer is saved together with an
  **approval request** (`approval_requests`), in one transaction. It waits
  in the chat (Approve / Reject on the tool card) and in **Today**, first
  in the nav, with a count. Chats and routine runs work the same way.
- **Decided once.** `POST /api/approvals/:id/approve` (or `/reject`) moves
  the request out of `pending` with one conditional update. Of two clicks,
  or two devices, exactly one wins; the other gets "This request was
  already decided." (409) and nothing runs for it.
- **Exactly what was asked.** A request saves the tool's identity (the
  built-in's name, the app's id and the tool's own name, or the Composio
  slug), not just the name the model saw. Approving finds that tool and
  runs it once with the saved input. If it's gone, the request fails and
  nothing else runs.
- **The character carries on.** The tool card changes ("Used …"), a note
  appears ("You approved shop refund order."), and the character's
  follow-up is a normal new turn that reads what happened. After a
  rejection the note tells it not to try again unless you ask, and every
  later turn still sees that note.
- **Composio** sessions enable a toolkit's write tools too; the approval
  policy is what guards them.
- Requests don't expire yet. Approving waits for the tool and the
  follow-up, so a slow tool makes the button slow.

## How cloud sandboxes work

A character's **computer** (Edit → Computer) can be a **cloud sandbox**: a
private Linux machine from [E2B](https://e2b.dev), one per chat, with
Python, Node, a Jupyter kernel and internet access. The Coding Agent
template comes with one.

1. Get a key at [e2b.dev/dashboard](https://e2b.dev/dashboard) (the free
   tier is enough), put it in `.env` as `E2B_API_KEY`, and restart
   `pnpm dev`.
2. Give a character a cloud sandbox and ask it to _"Plot the squares of 1
   to 10"_. It asks to run its code; you see the exact code, approve, and
   the chart shows up in the chat.

- **Tools** (`apps/api/src/sandbox/tools.ts`): `run_code` (Python or
  JavaScript), `run_command` and `write_file` are `computer` tools, so they
  always ask first, in every mode but Plan only. `read_file` and
  `list_files` are `read` and never start a sandbox.
- **Lifecycle** (`apps/api/src/sandbox/manager.ts`): a chat's sandbox starts
  on the first approved run, is reused while it lives (so a file written in
  one message can be read in the next), and stops after **5 idle minutes**,
  with **Stop** (the chat header, or Apps & tools), or when the chat is
  deleted. The next run after that starts a fresh one, without the old
  files. A unique index keeps it to one sandbox per chat, even when two
  runs start at once.
- **Charts are for you.** Images a run makes are saved (`tool_images`) and
  shown under the tool card, from `GET /api/images/:id`. The model only
  reads "Made 1 chart. The person can see it in the chat; you cannot."
- **Optional.** Without `E2B_API_KEY`, characters get no sandbox tools,
  the system prompt says so, and the forms and Apps & tools say how to turn
  it on. Tests use a fake provider, never E2B.

## How routines work

A **routine** is a job a character does again and again, like "every
weekday at 9:00, plan my day". It starts on a **schedule**, from a
**webhook**, or when you press **Run now**. Each run gets its own chat as a
transcript, named after the routine and the time ("Morning plan · 24 Nov,
09:00").

```
Run now ─┐
Webhook ─┼─▶ routine_runs (queued) ─▶ job runner ─▶ runRoutine ─▶ chat pipeline
Schedule ┘                            Trigger.dev, or inside the API
```

- **Same pipeline as chat.** `generateAnswer` (`apps/api/src/chat/answer.ts`)
  answers both chats and runs: same tools, same system prompt, same
  approval rules. A run that asks finishes as Done; its request waits in
  Today, and approving carries on in the run's transcript.
- **Never answers twice.** A worker must **claim** a queued run before it
  starts, so a job delivered twice finds nothing the second time. The answer
  and `done` are saved in **one transaction**, guarded by the attempt
  number, so a slow earlier attempt can't add a second answer. A retry may
  take over a run its dead attempt left `running` (nothing was saved yet).
  Scheduled runs are keyed by their cron time, and webhooks by an optional
  `Idempotency-Key` header, so a repeated event makes one run.
- **Job runners** (`apps/api/src/jobs/`): with `TRIGGER_SECRET_KEY` set,
  runs and schedules go to Trigger.dev (tasks in `apps/api/src/trigger/`);
  without it, runs happen inside the API, unfinished ones are picked up
  again when the API restarts, and schedules are saved but don't fire. The
  Routines page says so.
- **Your time zone.** Schedules are cron in your time zone, detected from
  your browser or phone the first time and changeable on the page. Names are
  made canonical ("Asia/Kolkata" becomes "Asia/Calcutta"), the spelling
  Trigger.dev accepts. Changing it moves every schedule.
- **Trigger.dev's Free plan** refuses schedules more often than hourly and
  starts runs up to 60 minutes after their time. The page shows that window
  when Trigger.dev reports it.
- **Webhooks**: `POST /api/hooks/routines/:id` with
  `Authorization: Bearer whsec_…`. The secret is shown once and stored only
  as a SHA-256 hash; a wrong or missing one gets a 401. The body (up to
  32 KB) is someone else's text: it reaches the model inside a fenced
  `webhook-data` block that it can't close early, and the system prompt says
  never to follow instructions inside it.
- Runs stuck in the queue for an hour, or running for 45 minutes, are marked
  failed with the reason.

### Routines on Trigger.dev

1. Put your project's ref in `apps/api/trigger.config.ts` (`proj_…`).
2. Put its **DEV** secret key (`tr_dev_…`, from the project's API keys page)
   in `.env` as `TRIGGER_SECRET_KEY`, and restart `pnpm dev`.
3. Log in once: `pnpm --filter api exec trigger login`.
4. In a second terminal: `pnpm trigger:dev`, and wait for
   `Local worker ready`. It loads the repo's `.env` for the database.

With the key set, every run goes through Trigger.dev, so keep
`pnpm trigger:dev` running or runs stay "Queued". In development,
schedules only fire while it runs. The `@trigger.dev/*` packages and the
`trigger.dev` CLI must all be on the same version.

## Code style

The [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html),
enforced by ESLint and formatted by Prettier. The one exception: Next.js pages
and Expo Router screens use default exports, because the frameworks require it.
