import type {ToolRisk, ToolSummary} from '@binary/shared';
import {RISK_INFO} from '@binary/shared';
import {cn} from 'cn';
import type {LucideIcon} from 'lucide-react';
import {BookOpenIcon, MonitorIcon, PencilLineIcon} from 'lucide-react';

import {Badge} from '@/components/ui/badge';

const RISK_ICONS: Record<ToolRisk, LucideIcon> = {
  read: BookOpenIcon,
  write: PencilLineIcon,
  computer: MonitorIcon,
};

/** "Read", "Write" or "Computer". Anything past `read` is amber. */
export function RiskBadge({
  risk,
  className,
}: {
  risk: ToolRisk;
  className?: string;
}) {
  const Icon = RISK_ICONS[risk];
  return (
    <Badge
      title={RISK_INFO[risk].description}
      className={cn(
        risk !== 'read' && 'border-warning/50 text-warning',
        className,
      )}
    >
      <Icon aria-hidden className="size-3" />
      {RISK_INFO[risk].label}
    </Badge>
  );
}

/** A list of tools: name, what it does, and its risk. */
export function ToolList({tools}: {tools: ToolSummary[]}) {
  return (
    <ul className="divide-y">
      {tools.map(tool => (
        <li
          key={tool.name}
          className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
        >
          <div className="min-w-0">
            <p className="font-mono text-sm break-all">{tool.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {tool.description}
            </p>
          </div>
          <RiskBadge risk={tool.risk} className="mt-0.5" />
        </li>
      ))}
    </ul>
  );
}
