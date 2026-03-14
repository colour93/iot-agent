import { Button } from '../../../components/ui/button';

export const SetupStep = ({
  index,
  title,
  description,
  done,
  actionLabel,
  onAction,
}: {
  index: number;
  title: string;
  description: string;
  done: boolean;
  actionLabel: string;
  onAction: () => void;
}) => {
  return (
    <div
      className={`inset-panel rounded-[1rem] p-3 transition-colors ${
        done ? 'border-emerald-200/70 bg-emerald-50/70' : 'border-border/65'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
              done ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-foreground'
            }`}
          >
            {index}
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <span className={`data-pill whitespace-nowrap ${done ? 'status-live' : ''}`}>
          {done ? '已完成' : '待完成'}
        </span>
      </div>
      {!done ? (
        <Button size="sm" variant="outline" className="mt-3" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
};
