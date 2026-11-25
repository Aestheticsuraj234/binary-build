import type {RoomWithMembers} from '@binary/db';
import {AgentRepository, RoomRepository, ThreadRepository} from '@binary/db';
import type {RoomDetail, RoomEvent, RoomInput} from '@binary/shared';
import {
  API_ERROR_CODES,
  ROOM_MESSAGES,
  roomInputSchema,
  sendMessageSchema,
  titleFromMessage,
} from '@binary/shared';
import type {Context} from 'hono';
import {Hono} from 'hono';

import type {Computers} from '../computers';
import {
  ConflictError,
  idParam,
  InvalidInputError,
  NotFoundError,
  readJson,
} from '../errors';
import type {SignedInEnv} from '../middleware/require-user';
import {activeMembers, toRoomSummary} from '../rooms/conversation';
import type {RoomDeps} from '../rooms/run-room';
import {answerInRoom, routeMessage} from '../rooms/run-room';
import {ndjsonResponse} from './stream-answer';
import {toChatMessage} from './threads';

/**
 * Room routes, mounted at /api/rooms. A room is a group chat with 2 to 6
 * of your characters and one conversation; every query is scoped to you.
 */
export function roomsRoutes(deps: RoomDeps & {computers: Computers}) {
  const {db, computers} = deps;
  const rooms = new RoomRepository(db);
  const agents = new AgentRepository(db);
  const threads = new ThreadRepository(db);
  const routes = new Hono<SignedInEnv>();

  async function findRoom(c: Context<SignedInEnv>): Promise<RoomWithMembers> {
    const found = await rooms.findForUser(idParam(c, 'room'), c.var.user.id);
    if (!found) {
      throw new NotFoundError('room');
    }
    return found;
  }

  /** Reads a room form: the characters are yours, hired, with unique names. */
  async function readRoomInput(c: Context<SignedInEnv>): Promise<RoomInput> {
    const input = await readJson(c, roomInputSchema);
    const yours = await agents.listForUser(c.var.user.id);
    const picked = input.agentIds.map(id => yours.find(a => a.id === id));
    if (picked.some(agent => agent === undefined)) {
      throw new InvalidInputError(ROOM_MESSAGES.notYours, {
        agentIds: ROOM_MESSAGES.notYours,
      });
    }
    const names = picked.map(agent => agent!.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) {
      throw new InvalidInputError(ROOM_MESSAGES.sameName, {
        agentIds: ROOM_MESSAGES.sameName,
      });
    }
    return input;
  }

  routes.get('/', async c => {
    const found = await rooms.listForUser(c.var.user.id);
    return c.json({rooms: found.map(toRoomSummary)});
  });

  routes.post('/', async c => {
    const input = await readRoomInput(c);
    const room = await rooms.create(c.var.user.id, input);
    const found = await rooms.findForUser(room.id, c.var.user.id);
    return c.json({room: toRoomSummary(found!)}, 201);
  });

  routes.get('/:id', async c => {
    const found = await findRoom(c);
    const rows = await threads.listMessages(found.thread.id);
    const detail: RoomDetail = {
      room: toRoomSummary(found),
      messages: rows.map(toChatMessage),
      computers: await computers.forThread(found.thread.id, c.var.user.id),
    };
    return c.json(detail);
  });

  routes.patch('/:id', async c => {
    const found = await findRoom(c);
    const input = await readRoomInput(c);
    await rooms.update(found.room.id, c.var.user.id, input);
    const updated = await rooms.findForUser(found.room.id, c.var.user.id);
    return c.json({room: toRoomSummary(updated!)});
  });

  /** Deletes a room and its conversation. Its characters stay. */
  routes.delete('/:id', async c => {
    const found = await findRoom(c);
    // Its sandbox and browser stop first, so nothing runs for a gone room.
    await computers.stopForThread(found.thread.id);
    if (!(await rooms.deleteForUser(found.room.id, c.var.user.id))) {
      throw new NotFoundError('room');
    }
    return c.json({ok: true});
  });

  /**
   * Sends a message to the room and streams every answer it gets. Your
   * message is saved first; each answer is saved as soon as it's done.
   */
  routes.post('/:id/messages', async c => {
    const room = await findRoom(c);
    const {message} = await readJson(c, sendMessageSchema);
    if (activeMembers(room).length === 0) {
      throw new ConflictError(
        'Everyone in this room was fired, so it is read-only.',
        API_ERROR_CODES.readOnly,
      );
    }
    const userId = c.var.user.id;
    const question = await threads.addQuestion(
      room.thread.id,
      message,
      titleFromMessage(message),
    );

    return ndjsonResponse<RoomEvent>(async send => {
      send({type: 'start', userMessage: toChatMessage(question)});
      const route = await routeMessage(deps, room, userId, message);
      send({
        type: 'routed',
        agentIds: route.agents.map(agent => agent.id),
        by: route.by,
      });
      await answerInRoom(deps, room, userId, route, send);
    });
  });

  return routes;
}
