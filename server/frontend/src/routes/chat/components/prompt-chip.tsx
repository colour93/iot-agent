export const PromptChip = ({
  disabled,
  prompt,
  onClick,
}: {
  disabled: boolean;
  prompt: string;
  onClick: () => void;
}) => {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-full border border-border/80 bg-card/88 px-3 py-1 text-xs text-muted-foreground transition-all duration-200 hover:-translate-y-px hover:border-primary/14 hover:bg-secondary/88 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-55"
    >
      {prompt}
    </button>
  );
};
