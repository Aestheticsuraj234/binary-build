import type {Database} from '@binary/db';
import {RoutineRepository} from '@binary/db';
import {API_ERROR_CODES, WEBHOOK_BODY_MAX_BYTES} from '@binary/shared';
import {Hono} from 'hono';
import {bodyLimit} from 'hono/body-limit';

import {
  ConflictError,
  idParam,
  NotFoundError,
  UnauthorizedError,
} from '../errors';
import type {RoutineService} from '../routines/service';
import {toRoutineRun} from '../routines/service';
import {
  matchesWebhookSecret,
  secretFromAuthorization,
} from '../routines/webhook-secret';

/** Longest Idempotency-Key header we keep. */
const IDEMPOTENCY_KEY_MAX_LENGTH = 200;

/**
 * Webhooks, mounted at /api/hooks. Called by other services, not by a
 * signed-in person, so there's no session or CSRF check: the routine's
 * secret is the only way in.
 *
 *     POST /api/hooks/routines/:id
 *     Authorization: Bearer whsec_…
 *     Idempotency-Key: <optional, makes retries safe>
 *
 * The body (up to 32 KB, any text) reaches the agent as data, never as
 * instructions.
 */
export function hooksRoutes({
  db,
  service,
}: {
  db: Database;
  service: RoutineService;
}) {
  const routines = new RoutineRepository(db);
  const routes = new Hono();

  routes.post(
    '/routines/:id',
    bodyLimit({
      maxSize: WEBHOOK_BODY_MAX_BYTES,
      onError: c =>
        c.json(
          {
            code: API_ERROR_CODES.tooLarge,
            message: `Webhook bodies can be up to ${WEBHOOK_BODY_MAX_BYTES / 1024} KB.`,
          },
          413,
        ),
    }),
    async c => {
      const found = await routines.findWithAgent(idParam(c, 'webhook'));
      if (!found?.routine.webhookSecretHash) {
        throw new NotFoundError('webhook');
      }
      const {routine} = found;
      const secret = secretFromAuthorization(c.req.header('authorization'));
      if (!matchesWebhookSecret(secret, routine.webhookSecretHash)) {
        throw new UnauthorizedError(
          'Wrong or missing webhook secret. Send it as "Authorization: Bearer whsec_…".',
        );
      }
      if (!routine.enabled) {
        throw new ConflictError('This routine is switched off.');
      }

      const body = await c.req.text();
      const key = c.req
        .header('idempotency-key')
        ?.trim()
        .slice(0, IDEMPOTENCY_KEY_MAX_LENGTH);
      const {run, isNew} = await service.startRun(routine.id, 'webhook', {
        payload: body.trim() ? body : undefined,
        dedupeKey: key ? `webhook:${key}` : undefined,
      });
      // 202: queued. 200: this Idempotency-Key already made a run.
      return c.json({run: toRoutineRun(run)}, isNew ? 202 : 200);
    },
  );

  return routes;
}
