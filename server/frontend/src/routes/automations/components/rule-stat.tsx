export const RuleStat = ({
  label,
  value,
}: {
  label: string;
  value: string;
}) => {
  return (
    <div className="surface-panel relative overflow-hidden rounded-xl p-3">
      <div className="text-[0.68rem] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
};
