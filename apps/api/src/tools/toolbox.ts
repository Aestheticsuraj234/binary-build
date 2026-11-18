import type {ToolRisk, ToolSummary} from '@binary/shared';
import {runsWithoutAsking} from '@binary/shared';
import type {FlexibleSchema, ToolSet} from 'ai';
import {tool} from 'ai';

/** A tool Binary can offer, built in or from an app. */
export interface BinaryTool {
  /** What the model calls it, e.g. `get_current_time`. */
  name: string;
  description: string;
  risk: ToolRisk;
  inputSchema: FlexibleSchema<unknown>;
  /**
   * Does the work. Throws an `Error` whose message is safe to show the
   * person and the model.
   */
  run(input: unknown, signal: AbortSignal | undefined): Promise<unknown>;
}

/** What the model reads when it calls a blocked tool. */
export const BLOCKED_REASON =
  'Blocked: this tool can change things outside Binary, so it needs the ' +
  "person's approval first, and approvals aren't available yet. Nothing " +
  'was done. Tell the person what you would have done instead.';

/** What a blocked call returns to the model. */
export interface BlockedResult {
  blocked: true;
  reason: string;
}

export function isBlockedResult(output: unknown): output is BlockedResult {
  return (
    typeof output === 'object' &&
    output !== null &&
    (output as {blocked?: unknown}).blocked === true
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
 * Every tool and its risk, ready for the model. The policy lives here:
 * only `read` tools run. Any other tool's `run` is never called; the model
 * gets `BLOCKED_REASON` back instead, so it can explain.
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

  /** The risk of a tool, or `write` for a name we don't know. */
  riskOf(name: string): ToolRisk {
    return this.byName.get(name)?.risk ?? 'write';
  }

  summaries(): ToolSummary[] {
    return [...this.byName.values()].map(toSummary);
  }

  /** The tools in the shape the Vercel AI SDK wants. */
  toToolSet(): ToolSet {
    const set: ToolSet = {};
    for (const binaryTool of this.byName.values()) {
      const allowed = runsWithoutAsking(binaryTool.risk);
      set[binaryTool.name] = tool({
        description: allowed
          ? binaryTool.description
          : `${binaryTool.description} (Blocked for now: needs the person's approval.)`,
        inputSchema: binaryTool.inputSchema,
        execute: async (input: unknown, {abortSignal}) => {
          if (!allowed) {
            const blocked: BlockedResult = {
              blocked: true,
              reason: BLOCKED_REASON,
            };
            return blocked;
          }
          return binaryTool.run(input, abortSignal);
        },
      });
    }
    return set;
  }
}
