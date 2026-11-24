import {asc, eq} from 'drizzle-orm';

import type {Database} from '../index';
import type {AgentTemplateRow} from '../schema/agents';
import {agentTemplates} from '../schema/agents';

/** A template as the seed describes it. */
export interface TemplateInput {
  slug: string;
  name: string;
  role: string;
  instructions: string;
  /** The computers characters hired from it start with. */
  computers?: Array<'cloud_sandbox' | 'browser' | 'runner' | 'cloud_desktop'>;
}

/** Queries for the `agent_templates` table, which everyone shares. */
export class AgentTemplateRepository {
  constructor(private readonly db: Database) {}

  list(): Promise<AgentTemplateRow[]> {
    return this.db
      .select()
      .from(agentTemplates)
      .orderBy(asc(agentTemplates.createdAt), asc(agentTemplates.slug));
  }

  async findById(id: string): Promise<AgentTemplateRow | undefined> {
    const [row] = await this.db
      .select()
      .from(agentTemplates)
      .where(eq(agentTemplates.id, id))
      .limit(1);
    return row;
  }

  /** Adds a template, or updates the one with the same slug. */
  async upsert(template: TemplateInput): Promise<AgentTemplateRow> {
    const [row] = await this.db
      .insert(agentTemplates)
      .values(template)
      .onConflictDoUpdate({
        target: agentTemplates.slug,
        set: {
          name: template.name,
          role: template.role,
          instructions: template.instructions,
          computers: template.computers ?? [],
        },
      })
      .returning();
    return row!;
  }
}
