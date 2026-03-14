import { Card, CardContent } from '../../../components/ui/card';

export const MetricCard = ({
  title,
  value,
  desc,
}: {
  title: string;
  value: string;
  desc: string;
}) => {
  return (
    <Card className="surface-panel relative overflow-hidden rounded-xl">
      <CardContent className="space-y-1 p-4">
        <div className="text-[0.68rem] uppercase tracking-[0.2em] text-muted-foreground">
          {title}
        </div>
        <div className="text-2xl font-semibold">{value}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </CardContent>
    </Card>
  );
};
