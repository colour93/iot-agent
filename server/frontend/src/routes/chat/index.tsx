import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  isDataUIPart,
  isToolUIPart,
  type UIMessage,
} from "ai";
import { createRoute } from "@tanstack/react-router";
import {
  Loader2,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Alert } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { api, type ChatSessionSummary } from "../../lib/api";
import { useHomes } from "../../lib/swr-hooks";
import { useAppStore } from "../../lib/store";
import { cn } from "../../lib/utils";
import { Route as RootRoute } from "../__root";
import { quickPrompts } from "./constants";
import { MarkdownBlock } from "./components/markdown-block";
import { PromptChip } from "./components/prompt-chip";
import { ToolPartCard } from "./components/tool-part-card";
import { toJson } from "./utils";

const ChatWorkspace = ({
  homeId,
  homeName,
  token,
  sessionId,
  initialMessages,
  onSessionSynced,
}: {
  homeId: string;
  homeName?: string;
  token?: string;
  sessionId: string;
  initialMessages: UIMessage[];
  onSessionSynced?: () => void;
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
    id: sessionId,
    messages: initialMessages,
    transport: transport as never,
    onFinish: () => {
      onSessionSynced?.();
    },
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
    <div className="relative flex h-full min-h-0 flex-col">
      {error ? (
        <div className="absolute inset-x-3 top-3 z-20 sm:inset-x-5">
          <Alert variant="destructive">
            {error.message || "请求失败，请稍后重试。"}
          </Alert>
        </div>
      ) : null}

      <div
        ref={listRef}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-3 sm:px-5",
          error ? "pt-16" : "pt-5",
          "pb-44 sm:pb-48",
        )}
      >
        {messages.length === 0 ? (
          <div className="grid min-h-full place-items-center py-8">
            <div className="inset-panel relative w-full max-w-3xl overflow-hidden rounded-[1.25rem] p-5 sm:p-6">
              <div className="ambient-orb -right-20 -top-16 bg-[oklch(0.73_0.08_214_/_24%)]" />
              <div className="relative">
                <p className="section-eyebrow">对话助手</p>
                <h2 className="mt-1 text-2xl font-semibold">家庭上下文对话</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  输入自然语言即可主动查询设备、房间与状态。
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="data-pill">
                    当前家庭: {homeName || homeId}
                  </span>
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

      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 sm:inset-x-5">
        <div className="pointer-events-auto rounded-[1.2rem] border border-border/70 bg-background/84 p-3 shadow-[0_20px_36px_-26px_oklch(0.28_0.02_240_/_35%)] backdrop-blur-xl sm:p-4">
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
      </div>
    </div>
  );
};

const ChatPage = () => {
  const selectedHome = useAppStore((state) => state.selectedHome);
  const token = useAppStore((state) => state.token);
  const sidebarCollapsed = useAppStore((state) => state.chatSidebarCollapsed);
  const setSidebarCollapsed = useAppStore(
    (state) => state.setChatSidebarCollapsed,
  );
  const { data: homes = [] } = useHomes();
  const currentHome = homes.find((item) => item.id === selectedHome);

  const sessionsKey = selectedHome
    ? `/api/homes/${selectedHome}/llm/chat/sessions`
    : null;
  const {
    data: sessions = [],
    isLoading: sessionsLoading,
    mutate: mutateSessions,
  } = useSWR<ChatSessionSummary[]>(
    sessionsKey,
    async () => {
      if (!selectedHome) return [];
      return api.listChatSessions(selectedHome, token);
    },
    {
      revalidateOnFocus: false,
    },
  );

  const [activeSessionId, setActiveSessionId] = useState<string>();
  const [sessionMessages, setSessionMessages] = useState<UIMessage[]>([]);
  const [chatRenderKey, setChatRenderKey] = useState(0);
  const [loadingSessionId, setLoadingSessionId] = useState<string>();
  const [creatingSession, setCreatingSession] = useState(false);
  const [deletingSessionId, setDeletingSessionId] = useState<string>();

  const loadSession = useCallback(
    async (sessionId: string) => {
      if (!selectedHome) return;

      setLoadingSessionId(sessionId);
      try {
        const detail = await api.getChatSession(selectedHome, sessionId, token);
        setActiveSessionId(detail.session.id);
        setSessionMessages(detail.messages);
        setChatRenderKey((value) => value + 1);
      } finally {
        setLoadingSessionId(undefined);
      }
    },
    [selectedHome, token],
  );

  const handleCreateSession = useCallback(async () => {
    if (!selectedHome || creatingSession) return;

    setCreatingSession(true);
    try {
      const created = await api.createChatSession(selectedHome, {}, token);
      await mutateSessions((current = []) => [created, ...current], {
        revalidate: false,
      });
      await loadSession(created.id);
      setSidebarCollapsed(false);
    } finally {
      setCreatingSession(false);
    }
  }, [creatingSession, loadSession, mutateSessions, selectedHome, token]);

  useEffect(() => {
    setActiveSessionId(undefined);
    setSessionMessages([]);
    setChatRenderKey(0);
  }, [selectedHome]);

  useEffect(() => {
    if (!selectedHome || sessionsLoading || creatingSession) return;

    const activeExists =
      !!activeSessionId &&
      sessions.some((session) => session.id === activeSessionId);
    if (activeExists) return;

    if (sessions.length > 0) {
      void loadSession(sessions[0].id);
      return;
    }

    void handleCreateSession();
  }, [
    activeSessionId,
    creatingSession,
    handleCreateSession,
    loadSession,
    selectedHome,
    sessions,
    sessionsLoading,
  ]);

  if (!selectedHome) {
    return (
      <div className="grid h-full place-items-center p-4">
        <Alert>请先在总览页选择家庭后再发起对话。</Alert>
      </div>
    );
  }

  const workspaceLoading = !!loadingSessionId || !activeSessionId;

  return (
    <div className="h-full min-h-0 overflow-hidden bg-background/82">
      <div className="flex h-full min-h-0">
        <aside
          className={cn(
            "overflow-hidden border-r border-border/70 bg-card/75 backdrop-blur transition-all duration-300",
            sidebarCollapsed
              ? "w-0 -translate-x-full opacity-0"
              : "w-[18rem] translate-x-0 opacity-100",
          )}
        >
          <div className="flex h-full min-h-0 w-[18rem] flex-col p-3">
            <div className="mb-3 flex items-center gap-2">
              <p className="text-sm font-semibold">会话列表</p>
            </div>

            <Button
              className="mb-3 w-full justify-start gap-2"
              variant="secondary"
              disabled={creatingSession}
              onClick={() => {
                void handleCreateSession();
              }}
            >
              {creatingSession ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <MessageSquarePlus className="size-4" />
              )}
              新建会话
            </Button>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {sessions.length === 0 && !sessionsLoading ? (
                <div className="rounded-lg border border-dashed border-border/80 bg-background/60 p-3 text-xs text-muted-foreground">
                  暂无会话，点击上方按钮创建第一个会话。
                </div>
              ) : null}

              {sessions.map((session) => {
                const active = session.id === activeSessionId;
                const deleting = deletingSessionId === session.id;
                const selecting = loadingSessionId === session.id;
                return (
                  <div
                    key={session.id}
                    className={cn(
                      "group relative w-full rounded-xl border px-3 py-2.5 text-left transition-colors",
                      active
                        ? "border-primary/35 bg-primary/10"
                        : "border-border/70 bg-background/65 hover:border-border hover:bg-muted/30",
                    )}
                  >
                    <button
                      type="button"
                      className="w-full pr-8 text-left"
                      onClick={() => {
                        if (session.id === activeSessionId || selecting) return;
                        void loadSession(session.id);
                      }}
                    >
                      <p className="line-clamp-1 text-sm font-medium">
                        {session.title}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {session.latestPreview || "暂无消息"}
                      </p>
                    </button>
                    <button
                      type="button"
                      className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-muted/50 hover:text-foreground"
                      disabled={deleting || selecting}
                      onClick={() => {
                        void (async () => {
                          if (!selectedHome) return;
                          setDeletingSessionId(session.id);
                          try {
                            await api.deleteChatSession(
                              selectedHome,
                              session.id,
                              token,
                            );
                            const nextSessions = sessions.filter(
                              (item) => item.id !== session.id,
                            );
                            await mutateSessions(nextSessions, {
                              revalidate: false,
                            });

                            if (session.id !== activeSessionId) return;

                            if (nextSessions.length > 0) {
                              await loadSession(nextSessions[0].id);
                              return;
                            }

                            const created = await api.createChatSession(
                              selectedHome,
                              {},
                              token,
                            );
                            await mutateSessions([created], {
                              revalidate: false,
                            });
                            await loadSession(created.id);
                          } finally {
                            setDeletingSessionId(undefined);
                          }
                        })();
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            {workspaceLoading ? (
              <div className="grid h-full place-items-center">
                <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  正在加载会话...
                </div>
              </div>
            ) : (
              <ChatWorkspace
                key={`${activeSessionId}-${chatRenderKey}`}
                homeId={selectedHome}
                homeName={currentHome?.name}
                token={token}
                sessionId={activeSessionId}
                initialMessages={sessionMessages}
                onSessionSynced={() => {
                  void mutateSessions();
                }}
              />
            )}
          </div>
        </section>
      </div>
      <Button
        variant="outline"
        size="icon"
        className={cn(
          "fixed top-1/2 z-30 size-9 -translate-y-1/2 rounded-full border-border/80 bg-background/92 shadow-[0_12px_24px_-16px_oklch(0.28_0.02_240_/_45%)] backdrop-blur transition-[left] duration-300 hover:!translate-y-[-50%]",
          sidebarCollapsed ? "left-2" : "left-[calc(18rem+0.5rem)]",
        )}
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        title={sidebarCollapsed ? "展开会话列表" : "收起会话列表"}
      >
        {sidebarCollapsed ? (
          <PanelLeftOpen className="size-4" />
        ) : (
          <PanelLeftClose className="size-4" />
        )}
      </Button>
    </div>
  );
};

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/chat",
  component: ChatPage,
});
