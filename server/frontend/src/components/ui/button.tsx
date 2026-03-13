import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[0_14px_30px_-20px_oklch(0.29_0.08_220_/_48%)] hover:-translate-y-px hover:shadow-[0_18px_34px_-22px_oklch(0.29_0.08_220_/_56%)]',
        secondary:
          'border border-border/70 bg-secondary/92 text-secondary-foreground shadow-[inset_0_1px_0_oklch(1_0_0_/_48%)] hover:-translate-y-px hover:border-primary/15 hover:bg-secondary',
        outline:
          'border border-border/80 bg-card/88 text-foreground shadow-[inset_0_1px_0_oklch(1_0_0_/_58%)] hover:-translate-y-px hover:border-primary/16 hover:bg-background/94',
        link: 'h-auto px-0 text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-11 px-6 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  },
);
Button.displayName = 'Button';

