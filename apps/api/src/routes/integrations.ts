import type {Database} from '@binary/db';
import {EnabledToolkitRepository} from '@binary/db';
import type {IntegrationDetail, IntegrationsCatalog} from '@binary/shared';
import {
  API_ERROR_CODES,
  composioConnectSchema,
  INTEGRATION_SLUG_PATTERN,
} from '@binary/shared';
import type {Context} from 'hono';
import {Hono} from 'hono';

import {
  AppError,
  AppUnreachableError,
  NotFoundError,
  readJson,
} from '../errors';
import type {SignedInEnv} from '../middleware/require-user';
import type {CatalogEntry, ComposioGateway} from '../tools/composio';
import {composioRisk} from '../tools/composio';
import {categoriesOf, statusOf, toIntegration} from '../tools/integrations';

interface IntegrationsRouteOptions {
  db: Database;
  /** Null when this Binary has no Composio API key. */
  composio: ComposioGateway | null;
  /** The web app, where people come back to after connecting. */
  webUrl: string;
}

/**
 * The Integrations page, mounted at /api/integrations: every Composio
 * toolkit, and where this person stands with each. Signing in happens on
 * Composio's own page; Binary never sees passwords or account tokens.
 */
export function integrationsRoutes({
  db,
  composio,
  webUrl,
}: IntegrationsRouteOptions) {
  const enabled = new EnabledToolkitRepository(db);
  const routes = new Hono<SignedInEnv>();

  function gateway(): ComposioGateway {
    if (!composio) {
      throw new AppError(
        API_ERROR_CODES.conflict,
        409,
        'Composio is off. Add COMPOSIO_API_KEY to .env to turn it on.',
      );
    }
    return composio;
  }

  /** The toolkit from the URL, or a 404 if Composio doesn't have it. */
  async function findEntry(c: Context): Promise<CatalogEntry> {
    const slug = c.req.param('slug') ?? '';
    const entry = INTEGRATION_SLUG_PATTERN.test(slug)
      ? (await gateway().catalog()).find(item => item.slug === slug)
      : undefined;
    if (!entry) {
      throw new NotFoundError('integration');
    }
    return entry;
  }

  /** Every toolkit with this person's status, and the categories. */
  routes.get('/', async c => {
    if (!composio) {
      const off: IntegrationsCatalog = {
        available: false,
        integrations: [],
        categories: [],
        error: null,
      };
      return c.json(off);
    }
    const userId = c.var.user.id;
    try {
      const [entries, accounts, switchedOn] = await Promise.all([
        composio.catalog(),
        composio.accounts(userId),
        enabled.listForUser(userId),
      ]);
      const catalog: IntegrationsCatalog = {
        available: true,
        integrations: entries.map(entry =>
          toIntegration(entry, statusOf(entry, accounts, switchedOn)),
        ),
        categories: categoriesOf(entries),
        error: null,
      };
      return c.json(catalog);
    } catch (error) {
      const down: IntegrationsCatalog = {
        available: true,
        integrations: [],
        categories: [],
        error:
          error instanceof AppUnreachableError
            ? error.message
            : "Couldn't reach Composio.",
      };
      return c.json(down);
    }
  });

  /** One toolkit for the Manage panel: accounts and tools with risk. */
  routes.get('/:slug', async c => {
    const entry = await findEntry(c);
    const userId = c.var.user.id;
    const [accounts, switchedOn, tools] = await Promise.all([
      gateway().accounts(userId),
      enabled.listForUser(userId),
      gateway().toolsOf(entry.slug),
    ]);
    const detail: IntegrationDetail = {
      integration: toIntegration(entry, statusOf(entry, accounts, switchedOn)),
      accounts: accounts
        .filter(account => account.toolkit === entry.slug)
        .map(({id, status, createdAt}) => ({id, status, createdAt})),
      tools: tools.map(tool => ({
        name: tool.slug,
        description: tool.description,
        risk: composioRisk(tool.tags),
      })),
    };
    return c.json(detail);
  });

  /**
   * Connects a toolkit. A no-account toolkit is simply switched on;
   * otherwise the app opens `redirectUrl` to sign in on Composio's page.
   */
  routes.post('/:slug/connect', async c => {
    const entry = await findEntry(c);
    const {returnTo} = await readJson(c, composioConnectSchema);
    const userId = c.var.user.id;
    if (entry.noAuth) {
      await enabled.enable(userId, entry.slug);
      return c.json({redirectUrl: null});
    }
    const callbackUrl =
      returnTo === 'phone'
        ? 'binary://integrations'
        : `${webUrl}/integrations?connected=${entry.slug}`;
    return c.json(await gateway().connect(userId, entry.slug, callbackUrl));
  });

  /** Disconnects (or switches off) a toolkit for this person. */
  routes.delete('/:slug', async c => {
    const entry = await findEntry(c);
    const userId = c.var.user.id;
    await enabled.disable(userId, entry.slug);
    if (!entry.noAuth) {
      await gateway().disconnect(userId, entry.slug);
    }
    return c.json({ok: true});
  });

  return routes;
}
