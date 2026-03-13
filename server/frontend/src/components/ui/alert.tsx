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
          : 'border-primary/12 bg-primary/6 text-foreground',
        className,
      )}
    >
      {children}
    </div>
  );
}

