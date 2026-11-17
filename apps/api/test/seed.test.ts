import {agentTemplates, sql, user} from '@binary/db';
import {afterAll, describe, expect, it} from 'vitest';

import {createAuth} from '../src/auth';
import {DEMO_USER, seed, TEMPLATES} from '../src/seed';
import {createTestApp, resetDatabase} from './helpers';
import {API_URL, TEST_SECRET} from './test-env';

const {db} = createTestApp();
const auth = createAuth({
  db,
  secret: TEST_SECRET,
  baseUrl: API_URL,
  trustedOrigins: [],
});
const quiet = () => {};

afterAll(async () => {
  await db.$client.end();
});

describe('seed', () => {
  it('adds the templates and the demo user, and adds nothing twice', async () => {
    await resetDatabase(db);
    await db.execute(sql`TRUNCATE TABLE agent_templates CASCADE`);

    await seed({db, auth, isProduction: false, log: quiet});
    await seed({db, auth, isProduction: false, log: quiet});

    const templates = await db.select().from(agentTemplates);
    expect(templates.map(t => t.slug).sort()).toEqual(
      TEMPLATES.map(t => t.slug).sort(),
    );
    const users = await db.select().from(user);
    expect(users.map(u => u.email)).toEqual([DEMO_USER.email]);
  });

  it('never creates the demo user in production', async () => {
    await resetDatabase(db);

    await seed({db, auth, isProduction: true, log: quiet});

    expect(await db.select().from(user)).toHaveLength(0);
  });
});
