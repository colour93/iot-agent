import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isDataUIPart, isToolUIPart } from 'ai';
import { createRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { useHomes } from '../../lib/swr-hooks';
import { useAppStore } from '../../lib/store';
import { Route as RootRoute } from '../__root';
import { quickPrompts } from './constants';
import { MarkdownBlock } from './components/markdown-block';
import { PromptChip } from './components/prompt-chip';
import { ToolPartCard } from './components/tool-part-card';
import { toJson } from './utils';

const ChatSession = ({
  homeId,
  homeName,
  token,
}: {
  homeId: string;
  homeName?: string;
  token?: string;
}) => {
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `/api/homes/${homeId}/llm/chat/stream`,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      }),
    [homeId, token],
  );

  const { messages, sendMessage, status, error } = useChat({
    id: `home-${homeId}`,
    transport: transport as never,
  });

  const sending = status === "submitted" || status === "streaming";

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, status]);

  const doSend = async (raw: string) => {
    const prompt = raw.trim();
    if (!prompt || sending) return;

    await sendMessage({ text: prompt });
    setInput("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {error ? (
        <Alert variant="destructive">
          {error.message || "请求失败，请稍后重试。"}
        </Alert>
      ) : null}

      <section className="surface-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.25rem]">
        <div
          ref={listRef}
          className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-4 sm:px-5"
        >
          {messages.length === 0 ? (
            <div className="grid min-h-full place-items-center py-8">
              <div className="inset-panel relative w-full max-w-3xl overflow-hidden rounded-[1.25rem] p-5 sm:p-6">
                <div className="ambient-orb -right-20 -top-16 bg-[oklch(0.73_0.08_214_/_24%)]" />
                <div className="relative">
                  <p className="section-eyebrow">对话助手</p>
                  <h2 className="mt-1 text-2xl font-semibold">
                    家庭上下文对话
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    基于 AI SDK
                    流式响应，支持工具调用与设备控制。输入自然语言即可主动查询设备、房间与状态。
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="data-pill">
                      当前家庭: {homeName || homeId}
                    </span>
                    {/* <span className="data-pill">已准备 {quickPrompts.length} 个示例问题</span> */}
                  </div>
                  <div className="mt-5">
                    <p className="text-xs font-semibold tracking-wide text-muted-foreground">
                      试试这些问题
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {quickPrompts.map((prompt) => (
                        <PromptChip
                          key={prompt}
                          prompt={prompt}
                          disabled={sending}
                          onClick={() => {
                            void doSend(prompt);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`mb-3 flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`w-fit max-w-[min(100%,92ch)] rounded-2xl px-3 py-2 ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground shadow-[0_8px_18px_-14px_oklch(0.35_0.13_220_/_90%)]"
                        : "border border-border/80 bg-card/92 text-foreground"
                    }`}
                  >
                    <div className="mb-1 text-[10px] uppercase tracking-wide opacity-70">
                      {message.role === "user" ? "你" : "助手"}
                    </div>
                    <div className="flex flex-col items-start gap-1">
                      {message.parts.map((part, idx) => {
                        const key = `${message.id}-${idx}`;

                        if (part.type === "text") {
                          return (
                            <div key={key}>
                              <MarkdownBlock text={part.text} />
                            </div>
                          );
                        }

                        if (part.type === "reasoning") {
                          return (
                            <div
                              key={key}
                              className="w-fit max-w-full rounded-md border border-dashed border-border/80 bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground"
                            >
                              推理中: {part.text}
                            </div>
                          );
                        }

                        if (isToolUIPart(part)) {
                          return (
                            <div key={key} className="w-fit max-w-full">
                              <ToolPartCard part={part} />
                            </div>
                          );
                        }

                        if (isDataUIPart(part)) {
                          return (
                            <div key={key} className="w-fit max-w-full">
                              <pre className="max-w-full overflow-x-auto rounded-md border border-border/70 bg-background/90 p-2 text-xs">
                                {toJson(part.data)}
                              </pre>
                            </div>
                          );
                        }

                        if (part.type === "file") {
                          return (
                            <div key={key} className="w-fit max-w-full">
                              <a
                                href={part.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center rounded-md border border-border/80 px-2 py-1 text-xs text-primary hover:bg-muted/40"
                              >
                                文件: {part.filename || part.mediaType}
                              </a>
                            </div>
                          );
                        }

                        return null;
                      })}
                    </div>
                  </div>
                </div>
              ))}
              {sending ? (
                <div className="status-live text-xs text-muted-foreground">
                  模型正在思考...
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="border-t border-border/70 bg-background/78 p-3 backdrop-blur sm:p-4">
          <textarea
            className="min-h-20 max-h-[30dvh] w-full resize-y rounded-md border border-border/80 bg-background/92 px-3 py-2 text-sm outline-none transition-[border-color,box-shadow,background-color] duration-200 focus:border-primary/20 focus:bg-card focus:ring-2 focus:ring-ring/70"
            placeholder="例如：读取客厅设备状态，并把空调设置为制冷 25 度"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={async (event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                await doSend(input);
              }
            }}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              Enter 发送，Shift + Enter 换行
            </span>
            <Button
              disabled={!input.trim() || sending}
              onClick={async () => {
                await doSend(input);
              }}
            >
              {sending ? "发送中..." : "发送"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};

const ChatPage = () => {
  const selectedHome = useAppStore((state) => state.selectedHome);
  const token = useAppStore((state) => state.token);
  const { data: homes = [] } = useHomes();
  const currentHome = homes.find((item) => item.id === selectedHome);

  if (!selectedHome) {
    return <Alert>请先在总览页选择家庭后再发起对话。</Alert>;
  }

  return (
    <ChatSession
      homeId={selectedHome}
      homeName={currentHome?.name}
      token={token}
    />
  );
};

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/chat',
  component: ChatPage,
});
