import {characterOf} from '@binary/shared';

/** The parts of an agent that shape how it answers. */
export interface AgentProfile {
  name: string;
  role: string;
  instructions: string;
  avatar: string | null;
}

/**
 * Turns an agent's profile into the system prompt the model reads before
 * every message. It is rebuilt on each reply, so edits apply straight away.
 */
export function buildSystemPrompt(agent: AgentProfile): string {
  const character = characterOf(agent.avatar);
  const lines = [
    `You are ${agent.name}, an AI coworker in Binary, a personal assistant app.`,
    `Your job: ${agent.role}`,
    `Your personality: ${character.personality} Let it show in how you write, without overdoing it.`,
  ];
  if (agent.instructions) {
    lines.push(
      '',
      'Instructions from the person you work for:',
      agent.instructions,
    );
  }
  lines.push(
    '',
    'Keep answers clear and reasonably short unless asked for more. ' +
      'Write in Markdown: use headings, lists, tables and fenced code ' +
      'blocks with a language when they make an answer easier to read. ' +
      "You can't use tools or browse yet: if a task needs that, say so " +
      'and help as far as you can with what you know.',
  );
  return lines.join('\n');
}
