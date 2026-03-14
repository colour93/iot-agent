import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export const MarkdownBlock = ({ text }: { text: string }) => {
  if (!text.trim()) return null;

  return (
    <div className="chat-markdown break-words text-sm">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: (props) => <p className="[&:not(:first-child)]:mt-2 leading-6" {...props} />,
          ul: (props) => <ul className="mt-2 list-disc space-y-1 pl-5" {...props} />,
          ol: (props) => <ol className="mt-2 list-decimal space-y-1 pl-5" {...props} />,
          li: (props) => <li className="leading-6" {...props} />,
          blockquote: (props) => (
            <blockquote
              className="mt-2 border-l-2 border-border/85 pl-3 text-muted-foreground"
              {...props}
            />
          ),
          a: (props) => (
            <a
              className="text-primary underline decoration-primary/50 underline-offset-2"
              target="_blank"
              rel="noreferrer"
              {...props}
            />
          ),
          code: ({ className, children, ...props }) => {
            const hasLanguage =
              typeof className === 'string' && className.includes('language-');
            if (!hasLanguage) {
              return (
                <code
                  className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          pre: (props) => (
            <pre
              className="mt-2 overflow-x-auto rounded-lg border border-border/70 bg-background/90 p-3 text-xs leading-relaxed"
              {...props}
            />
          ),
          table: (props) => (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs" {...props} />
            </div>
          ),
          th: (props) => (
            <th
              className="border border-border/70 bg-muted/55 px-2 py-1 font-semibold"
              {...props}
            />
          ),
          td: (props) => (
            <td className="border border-border/70 px-2 py-1" {...props} />
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
};
