import type {MachineHandle, MachineProvider} from '../sandbox/manager';

/** One live cloud desktop, connected. */
export interface DesktopHandle extends MachineHandle {
  /** A view-only live stream the person can watch. */
  readonly liveUrl: string | null;
  /** The screen as a PNG. */
  screenshot(): Promise<Buffer>;
  screenSize(): Promise<{width: number; height: number}>;
  click(
    x: number,
    y: number,
    options: {button: 'left' | 'right'; double: boolean},
  ): Promise<void>;
  type(text: string): Promise<void>;
  /** "enter", "ctrl+l", "alt+tab"… */
  press(keys: string[]): Promise<void>;
  scroll(direction: 'up' | 'down', amount: number): Promise<void>;
  /** Opens a web address (or file) with the desktop's default app. */
  open(target: string): Promise<void>;
  /** Waits for the screen to settle after a step. */
  wait(ms: number): Promise<void>;
}

/** Where cloud desktops come from: E2B Desktop, or a fake in tests. */
export type DesktopProvider = MachineProvider<DesktopHandle>;
