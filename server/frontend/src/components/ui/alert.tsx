import { cn } from '../../lib/utils';
import { PropsWithChildren } from 'react';

export function Alert({ className, children }: PropsWithChildren<{ className?: string }>) {
  return <div className={cn('rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800', className)}>{children}</div>;
}

