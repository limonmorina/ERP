import { AlertTriangle } from 'lucide-react';

interface Props {
  message: string;
  details?: string;
}

export function SetBreakdownWarning({ message, details }: Props) {
  return (
    <div
      role="alert"
      className="flex gap-3 rounded-lg border border-accent/40 bg-accent-soft px-4 py-3 text-sm text-ink-900"
    >
      <AlertTriangle className="mt-0.5 shrink-0 text-accent" size={18} />
      <div>
        <p className="font-semibold text-accent">{message}</p>
        {details && <p className="mt-1 text-ink-700">{details}</p>}
      </div>
    </div>
  );
}
