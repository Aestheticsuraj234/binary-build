import type {ToolSource} from '@binary/db';
import type {
  ApprovalMode,
  ToolDecision,
  ToolRisk,
  ToolSummary,
} from '@binary/shared';
import {decideTool} from '@binary/shared';
import type {FlexibleSchema, JSONValue, ToolSet} from 'ai';
import {tool} from 'ai';

import {toModelContent} from '../sandbox/images';

/** A tool Binary can offer, built in or from an app. */
export interface BinaryTool {
  /** What the model calls it, e.g. `get_current_time`. */
  name: string;
  description: string;
  risk: ToolRisk;
  inputSchema: FlexibleSchema<unknown>;
  /**
   * Exactly where the tool comes from, so an approved request runs this
   * tool and no other. Built-in tools can leave it out.
   */
  source?: ToolSource;
  /**
   * True for tools that only touch the person's own Binary records, which
   * they can see and delete (memory and knowledge): these run without
   * asking in every mode that has tools. Plan only still has none.
   */
  alwaysRuns?: boolean;
  /**
   * Does the work. Throws an `Error` whose message is safe to show the
   * person and the model.
   */
  run(input: unknown, signal: AbortSignal | undefined): Promise<unknown>;
}

/** Where a tool comes from; built-in tools are found by their name. */
export function sourceOf(binaryTool: BinaryTool): ToolSource {
  return binaryTool.source ?? {kind: 'built-in', name: binaryTool.name};
}

/** Whether a tool runs, asks first or isn't offered, in one mode. */
export function decideFor(
  binaryTool: Pick<BinaryTool, 'risk' | 'alwaysRuns'>,
  mode: ApprovalMode,
): ToolDecision {
  const decision = decideTool(mode, binaryTool.risk);
  return binaryTool.alwaysRuns && decision === 'ask' ? 'run' : decision;
}

/** What the model reads when a tool needs the person's OK. */
export const WAITING_MESSAGE =
  "Not run yet: this needs the person's OK, and Binary has asked them. " +
  'Tell them what you want to do and why, and that it runs once they ' +
  "approve. Don't call this tool again for it; Binary tells you when " +
  "they've decided.";

/** What a tool that asks returns to the model, instead of running. */
export interface WaitingResult {
  status: 'waiting_for_approval';
  message: string;
}

export function isWaitingResult(output: unknown): output is WaitingResult {
  return (
    typeof output === 'object' &&
    output !== null &&
    (output as {status?: unknown}).status === 'waiting_for_approval'
  );
}

export function toSummary(binaryTool: BinaryTool): ToolSummary {
  return {
    name: binaryTool.name,
    description: binaryTool.description,
    risk: binaryTool.risk,
  };
}

/**
 * Every tool and its risk, ready for the model. The policy lives here, as
 * one lookup in `APPROVAL_POLICY`: a tool that may run, runs; one that
 * must ask returns `WaitingResult` without running, so the answer can
 * finish and the request wait in the database; one that's never allowed
 * isn't offered at all.
 */
export class Toolbox {
  private readonly byName = new Map<string, BinaryTool>();

  constructor(tools: BinaryTool[]) {
    for (const binaryTool of tools) {
      // The first tool with a name wins; app tool names are made unique
      // before they get here.
      if (!this.byName.has(binaryTool.name)) {
        this.byName.set(binaryTool.name, binaryTool);
      }
    }
  }

  /** The tool the model called by `name`, if there is one. */
  find(name: string): BinaryTool | undefined {
    return this.byName.get(name);
  }

  /** The risk of a tool, or `write` for a name we don't know. */
  riskOf(name: string): ToolRisk {
    return this.byName.get(name)?.risk ?? 'write';
  }

  /** Whether the tool called `name` runs, asks or isn't offered. */
  decide(name: string, mode: ApprovalMode): ToolDecision {
    const found = this.byName.get(name);
    return found ? decideFor(found, mode) : decideTool(mode, 'write');
  }

  summaries(): ToolSummary[] {
    return [...this.byName.values()].map(toSummary);
  }

  /** The tools in the shape the Vercel AI SDK wants, for one approval mode. */
  toToolSet(mode: ApprovalMode): ToolSet {
    const set: ToolSet = {};
    for (const binaryTool of this.byName.values()) {
      const decision = decideFor(binaryTool, mode);
      if (decision === 'never') {
        continue;
      }
      set[binaryTool.name] = tool({
        description:
          decision === 'ask'
            ? `${binaryTool.description} (Asks the person first.)`
            : binaryTool.description,
        inputSchema: binaryTool.inputSchema,
        execute: async (input: unknown, {abortSignal}) => {
          if (decision === 'ask') {
            const waiting: WaitingResult = {
              status: 'waiting_for_approval',
              message: WAITING_MESSAGE,
            };
            return waiting;
          }
          return binaryTool.run(input, abortSignal);
        },
        // Charts and screenshots are for the person: the model gets a note
        // instead, except a desktop's screen, which it must see.
        toModelOutput: ({output}) => {
          const content = toModelContent(output);
          return content.type === 'json'
            ? {type: 'json', value: content.value as JSONValue}
            : content;
        },
      });
    }
    return set;
  }
}
