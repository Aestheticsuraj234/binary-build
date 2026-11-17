# Binary

An open-source personal AI assistant you run on your own machine: AI coworkers
that chat with you, use your apps and do real work, always asking before
anything risky.

So far: a monorepo with an API, a web app and a mobile app, sharing one
Postgres database and email-and-password sign-in (chapter 1), plus an AI engine
that uses each person's own OpenAI, Anthropic or Google key, stored encrypted,
with a Playground to try it (chapter 3), and agents you hire, each played by
a cartoon character, on the web and the phone (chapter 4).

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
- Every query is scoped to the signed-in person. Someone else's agent gets
  the same 404 as one that doesn't exist.
- Chats aren't saved yet: **New chat** or a reload starts over.

## Code style

The [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html),
enforced by ESLint and formatted by Prettier. The one exception: Next.js pages
and Expo Router screens use default exports, because the frameworks require it.
