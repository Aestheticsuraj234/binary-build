import {asJson} from '@/components/chat/tool-call-card';

/** The inputs of sandbox tools, as they're shown to people. */
interface CodeInput {
  language?: string;
  code?: string;
  command?: string;
  path?: string;
  content?: string;
  url?: string;
  ref?: number;
  element?: string;
  text?: string;
  submit?: boolean;
  key?: string;
}

/** A browser step in words: "Click [3] More information…". */
function browserStep(name: string, value: CodeInput): string | null {
  switch (name) {
    case 'browser_open':
      return value.url ? `Open ${value.url}` : null;
    case 'browser_click':
      return `Click [${value.ref}] ${value.element ?? ''}`.trim();
    case 'browser_type':
      return (
        `Type "${value.text ?? ''}" into [${value.ref}] ${value.element ?? ''}`.trim() +
        (value.submit ? ', then press Enter' : '')
      );
    case 'browser_press':
      return value.key ? `Press ${value.key}` : null;
    default:
      return null;
  }
}

function Pre({children}: {children: string}) {
  return (
    <pre className="max-h-80 overflow-auto rounded-md bg-background p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
      {children}
    </pre>
  );
}

/**
 * A tool call's input. Code, commands and files read as themselves, so
 * people see exactly what will run before they approve it; anything else
 * is shown as JSON.
 */
export function ToolInput({name, input}: {name: string; input: unknown}) {
  const value = (input ?? {}) as CodeInput;
  if (name === 'run_code' && typeof value.code === 'string') {
    return (
      <div>
        <p className="mb-1.5 text-xs text-muted-foreground">
          {value.language === 'javascript' ? 'JavaScript' : 'Python'}
        </p>
        <Pre>{value.code}</Pre>
      </div>
    );
  }
  if (name === 'run_command' && typeof value.command === 'string') {
    return (
      <div>
        <p className="mb-1.5 text-xs text-muted-foreground">Shell</p>
        <Pre>{`$ ${value.command}`}</Pre>
      </div>
    );
  }
  if (name === 'write_file' && typeof value.path === 'string') {
    return (
      <div>
        <p className="mb-1.5 text-xs text-muted-foreground">
          Write <span className="font-mono">{value.path}</span>
        </p>
        <Pre>{value.content ?? ''}</Pre>
      </div>
    );
  }
  const step = browserStep(name, value);
  if (step) {
    return (
      <div>
        <p className="mb-1.5 text-xs text-muted-foreground">In the browser</p>
        <Pre>{step}</Pre>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-1.5 text-xs text-muted-foreground">Input</p>
      <Pre>{asJson(input)}</Pre>
    </div>
  );
}
