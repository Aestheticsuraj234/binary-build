// Fills a fresh database with starter data:
// - the agent templates every user can start from
// - a demo account, so you can sign in straight away
// Safe to run again: nothing is duplicated. Run with `pnpm db:seed`.
import type {Database} from '@binary/db';
import {AgentTemplateRepository, UserRepository} from '@binary/db';

import type {Auth} from './auth';

export const DEMO_USER = {
  name: 'Demo User',
  email: 'demo@binary.dev',
  password: 'binary-demo-password',
};

export const TEMPLATES = [
  {
    slug: 'research-assistant',
    name: 'Research Assistant',
    role: 'Finds, reads and summarizes sources on any topic.',
    instructions:
      'Search the web, open the most relevant pages, and answer with a short summary and a list of sources.',
  },
  {
    slug: 'coding-agent',
    name: 'Coding Agent',
    role: 'Reads, writes and fixes code in your projects.',
    instructions:
      'Explain your plan before editing files. Keep changes small and run the tests after each change.',
  },
  {
    slug: 'inbox-manager',
    name: 'Inbox Manager',
    role: 'Sorts email and drafts replies for you to approve.',
    instructions:
      'Group new emails by urgency. Draft replies, but never send anything without approval.',
  },
  {
    slug: 'personal-assistant',
    name: 'Personal Assistant',
    role: 'Plans your day, tracks tasks and sends reminders.',
    instructions:
      'Keep the task board up to date and ask before booking or changing anything in the calendar.',
  },
];

interface SeedOptions {
  db: Database;
  auth: Auth;
  /** The demo password is public, so a real deployment must never have it. */
  isProduction: boolean;
  log?: (message: string) => void;
}

export async function seed({
  db,
  auth,
  isProduction,
  log = console.log,
}: SeedOptions): Promise<void> {
  const templateRepository = new AgentTemplateRepository(db);
  for (const template of TEMPLATES) {
    await templateRepository.upsert(template);
  }
  log(`Seeded ${TEMPLATES.length} agent templates.`);

  const userRepository = new UserRepository(db);
  if (isProduction) {
    log('Skipped the demo user in production.');
  } else if (await userRepository.findByEmail(DEMO_USER.email)) {
    log(`Demo user ${DEMO_USER.email} already exists.`);
  } else {
    // Better Auth creates the user so the password is hashed the normal way.
    await auth.api.signUpEmail({body: DEMO_USER});
    log(`Created demo user ${DEMO_USER.email} / ${DEMO_USER.password}`);
  }
}
