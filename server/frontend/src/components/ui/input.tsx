import * as React from 'react';
import { cn } from '../../lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-lg border border-border/80 bg-background/92 px-3 py-2 text-sm shadow-[inset_0_1px_0_oklch(1_0_0_/_50%)] transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-muted-foreground focus-visible:border-primary/20 focus-visible:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

