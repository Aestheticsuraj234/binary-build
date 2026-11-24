import type {Database} from '@binary/db';
import {DESKTOP_IDLE_MINUTES} from '@binary/shared';

import {MachineManager} from '../sandbox/manager';
import type {DesktopHandle, DesktopProvider} from './provider';

/** Cloud desktops (E2B Desktop), one per chat, stopped after 10 idle minutes. */
export class DesktopManager extends MachineManager<DesktopHandle> {
  constructor(db: Database, provider: DesktopProvider | null) {
    super(db, provider, {
      kind: 'desktop',
      idleMs: DESKTOP_IDLE_MINUTES * 60 * 1000,
    });
  }
}
