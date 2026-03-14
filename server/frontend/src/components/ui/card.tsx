import * as React from 'react';
import { cn } from '../../lib/utils';

export const Card = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      className={cn(
        'rounded-xl border border-border/80 bg-card/88 shadow-[0_16px_30px_-28px_oklch(0.27_0.02_240_/_24%)] backdrop-blur-sm transition-[border-color,box-shadow,background-color] duration-200',
        className,
      )}
      {...props}
    />
  );
};

export const CardHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  return <div className={cn('border-b border-border/70 px-4 py-3', className)} {...props} />;
};

export const CardContent = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  return <div className={cn('px-4 py-3', className)} {...props} />;
};

export const CardFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  return <div className={cn('border-t border-border/70 px-4 py-3', className)} {...props} />;
};

