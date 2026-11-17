import {eq} from 'drizzle-orm';

import type {Database} from '../index';
import {user} from '../schema/auth';

/** Read-only queries for people. Better Auth creates and changes them. */
export class UserRepository {
  constructor(private readonly db: Database) {}

  async findByEmail(email: string) {
    const [row] = await this.db
      .select({id: user.id, name: user.name, email: user.email})
      .from(user)
      .where(eq(user.email, email.toLowerCase()))
      .limit(1);
    return row;
  }
}
