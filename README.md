# Binary

An open-source personal AI assistant you run on your own machine: AI coworkers
that chat with you, use your apps and do real work, always asking before
anything risky.

This is chapter 1: the foundation. A monorepo with an API, a web app and a
mobile app, sharing one Postgres database and email-and-password sign-in. No AI
yet.

## What's inside

| Path                         | What it is                                                                 |
| ---------------------------- | -------------------------------------------------------------------------- |
| `apps/api`                   | Hono API on Node. Serves Better Auth at `/api/auth/*`.                     |
| `apps/web`                   | Next.js web app with Tailwind and shadcn/ui.                               |
| `apps/mobile`                | Expo app (Expo Router). Keeps the session in secure storage.               |
| `packages/shared`            | Form validation (Zod) and design tokens, used by all three.                |
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
pnpm run setup   # .env with a random secret, Postgres, migrations
pnpm dev         # Postgres + API (port 3001) + web (port 3000)
```

Open http://localhost:3000 and create an account.

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

| Command            | What it does                                  |
| ------------------ | --------------------------------------------- |
| `pnpm dev`         | Start Postgres, the API and the web app.      |
| `pnpm mobile`      | Start the Expo dev server for the phone.      |
| `pnpm lint`        | ESLint, then a Prettier formatting check.     |
| `pnpm format`      | Fix formatting with Prettier.                 |
| `pnpm check-types` | TypeScript in every package.                  |
| `pnpm test`        | Unit tests, plus auth tests against Postgres. |
| `pnpm build`       | Production build of the web app.              |
| `pnpm db:migrate`  | Apply database migrations.                    |
| `pnpm db:down`     | Stop Postgres (your data is kept).            |

### Changing the database

1. Edit the schema in `packages/db/src/schema/`.
2. `pnpm --filter @binary/db db:generate` writes a migration.
3. `pnpm db:migrate` applies it. Tests migrate their own database.

## How sign-in works

- The **API** runs Better Auth and stores users and sessions in Postgres. It
  refuses to start if `BETTER_AUTH_SECRET` is missing, shorter than 32
  characters, or still a placeholder.
- The **web app** forwards `/api/auth/*` to the API, so the session cookie
  belongs to the web app. `apps/web/proxy.ts` checks the session before each
  page: signed out goes to `/sign-in`, signed in skips the sign-in pages.
- The **mobile app** calls the API directly and stores the session in the
  phone's secure storage (Keychain or Keystore).
- **Validation** lives in `packages/shared`. Web, mobile and the API run the
  same Zod schemas, so the error messages are identical everywhere.

## Code style

The [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html),
enforced by ESLint and formatted by Prettier. The one exception: Next.js pages
and Expo Router screens use default exports, because the frameworks require it.
