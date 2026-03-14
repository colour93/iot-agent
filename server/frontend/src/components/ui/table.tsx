import * as React from 'react';
import { cn } from '../../lib/utils';

export const Table = ({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) => {
  return <table className={cn('w-full border-collapse text-sm', className)} {...props} />;
};

export const THead = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) => {
  return <thead className={cn('bg-muted/70 text-left', className)} {...props} />;
};

export const TBody = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableSectionElement>) => {
  return <tbody className={cn('[&_tr:nth-child(even)]:bg-muted/28', className)} {...props} />;
};

export const TR = ({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => {
  return <tr className={cn('transition-colors hover:bg-muted/35', className)} {...props} />;
};

export const TH = ({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) => {
  return (
    <th
      className={cn(
        'border-b border-border px-3 py-2 font-medium tracking-wide text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
};

export const TD = ({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) => {
  return <td className={cn('border-b border-border px-3 py-2 align-top', className)} {...props} />;
};

