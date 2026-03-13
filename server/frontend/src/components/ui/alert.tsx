import { cn } from '../../lib/utils';
import type { PropsWithChildren } from 'react';

type AlertProps = PropsWithChildren<{
  className?: string;
  variant?: 'default' | 'destructive';
}>;

export function Alert({ className, variant = 'default', children }: AlertProps) {
  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-3 text-sm',
        variant === 'destructive'
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : 'border-[oklch(0.83_0.06_92)] bg-[oklch(0.96_0.03_92)] text-[oklch(0.43_0.05_88)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

