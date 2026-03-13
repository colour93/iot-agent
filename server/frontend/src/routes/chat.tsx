import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isDataUIPart,
  isToolUIPart,
  type UIMessage,
} from "ai";
import { createRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Alert } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { useHomes } from "../lib/swr-hooks";
import { useAppStore } from "../lib/store";
import { Route as RootRoute } from "./__root";

const quickPrompts = [
  "总结当前家庭在线设备状态",
  "列出客厅设备并读取最新状态",
  "检查最近是否有异常事件",
  "把客厅空调设置为制冷 25 度",
];

function PromptChip({
  disabled,
  prompt,
  onClick,
}: {
  disabled: boolean;
  prompt: string;
  onClick: () => void;
}) {
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
}

function toJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPrimitiveStatusValue(
  value: unknown,
): value is string | number | boolean {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function formatPrimitiveStatusValue(value: string | number | boolean) {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

function formatToolState(state: string) {
  switch (state) {
    case "input-streaming":
      return "参数生成中";
    case "input-available":
      return "参数已就绪";
    case "output-available":
      return "执行完成";
    case "output-error":
      return "执行失败";
    case "output-denied":
      return "执行被拒绝";
    case "approval-requested":
      return "等待确认";
    case "approval-responded":
      return "已确认";
    default:
      return state;
  }
}

type DeviceStatusData = {
  deviceId: string;
  name: string;
  status: string;
  roomName: string;
  attrs: Record<string, unknown>;
};

type RoomSummaryData = {
  roomId: string;
  name: string;
  floor: string | null;
  type: string | null;
  devicesCount: number;
  onlineDevicesCount: number;
};

function normalizeDeviceStatusData(value: unknown): DeviceStatusData | null {
  if (!isObjectRecord(value)) return null;
  return {
    deviceId: typeof value.deviceId === "string" ? value.deviceId : "-",
    name: typeof value.name === "string" ? value.name : "未命名设备",
    status: typeof value.status === "string" ? value.status : "unknown",
    roomName:
      typeof value.roomName === "string" ? value.roomName : "未分配房间",
    attrs: isObjectRecord(value.attrs) ? value.attrs : {},
  };
}

function normalizeRoomSummaryData(value: unknown): RoomSummaryData | null {
  if (!isObjectRecord(value)) return null;
  return {
    roomId: typeof value.roomId === "string" ? value.roomId : "-",
    name: typeof value.name === "string" ? value.name : "未命名房间",
    floor: typeof value.floor === "string" ? value.floor : null,
    type: typeof value.type === "string" ? value.type : null,
    devicesCount:
      typeof value.devicesCount === "number" ? value.devicesCount : 0,
    onlineDevicesCount:
      typeof value.onlineDevicesCount === "number"
        ? value.onlineDevicesCount
        : 0,
  };
}

function extractDeviceStatusCards(toolName: string, output: unknown) {
  if (toolName === "get_device_state" && isObjectRecord(output)) {
    const device = normalizeDeviceStatusData(output.device);
    return device ? [device] : [];
  }

  if (toolName === "list_devices" && Array.isArray(output)) {
    return output
      .map((item) => normalizeDeviceStatusData(item))
      .filter((item): item is DeviceStatusData => item !== null);
  }

  return [];
}

function extractRoomCards(toolName: string, output: unknown) {
  if (toolName !== "list_rooms" || !Array.isArray(output)) {
    return [];
  }

  return output
    .map((item) => normalizeRoomSummaryData(item))
    .filter((item): item is RoomSummaryData => item !== null);
}

function MarkdownBlock({ text }: { text: string }) {
  if (!text.trim()) return null;

  return (
    <div className="chat-markdown break-words text-sm">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: (props) => (
            <p className="[&:not(:first-child)]:mt-2 leading-6" {...props} />
          ),
          ul: (props) => (
            <ul className="mt-2 list-disc space-y-1 pl-5" {...props} />
          ),
          ol: (props) => (
            <ol className="mt-2 list-decimal space-y-1 pl-5" {...props} />
          ),
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
              typeof className === "string" && className.includes("language-");
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
              <table
                className="w-full border-collapse text-left text-xs"
                {...props}
              />
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
}

function DeviceStatusCard({ device }: { device: DeviceStatusData }) {
  const statusEntries = Object.entries(device.attrs).filter(([, value]) =>
    isPrimitiveStatusValue(value),
  );

  return (
    <Card className="inset-panel rounded-[1rem] border-border/65 bg-card/88">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {device.name}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {device.deviceId}
            </p>
          </div>
          <span
            className={`rounded-full border px-2 py-0.5 text-xs ${
              device.status === "online"
                ? "status-live border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-slate-100 text-slate-500"
            }`}
          >
            {device.status}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">房间: {device.roomName}</p>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {statusEntries.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/80 px-3 py-2 text-xs text-muted-foreground">
            暂无可展示的设备状态字段
          </div>
        ) : (
          <div className="space-y-2">
            {statusEntries.map(([key, rawValue]) => {
              const value = rawValue as string | number | boolean;
              const toneClass =
                typeof value === "boolean"
                  ? value
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-100 text-slate-600"
                  : typeof value === "number"
                    ? "border-sky-200 bg-sky-50 text-sky-700"
                    : "border-amber-200 bg-amber-50 text-amber-700";

              return (
                <div
                  key={`${device.deviceId}-${key}`}
                  className="rounded-md border border-border/80 bg-background/90 px-2.5 py-2"
                >
                  <div className="text-[11px] text-muted-foreground">{key}</div>
                  <div
                    className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${toneClass}`}
                  >
                    {formatPrimitiveStatusValue(value)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RoomSummaryCard({ room }: { room: RoomSummaryData }) {
  return (
    <Card className="inset-panel rounded-[1rem] border-border/65 bg-card/88">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">{room.name}</p>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {room.roomId}
            </p>
          </div>
          <span className="data-pill py-0.5 text-[11px]">
            {room.onlineDevicesCount} 在线
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0 text-xs">
        <div className="rounded-md border border-border/80 bg-background/90 px-2.5 py-2">
          <span className="text-muted-foreground">楼层: </span>
          <span>{room.floor || "-"}</span>
        </div>
        <div className="rounded-md border border-border/80 bg-background/90 px-2.5 py-2">
          <span className="text-muted-foreground">类型: </span>
          <span>{room.type || "-"}</span>
        </div>
        <div className="rounded-md border border-border/80 bg-background/90 px-2.5 py-2">
          <span className="text-muted-foreground">设备数: </span>
          <span>{room.devicesCount}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function ToolPartCard({ part }: { part: UIMessage["parts"][number] }) {
  if (!isToolUIPart(part)) return null;

  const toolName = getToolName(part);
  const devices =
    part.state === "output-available"
      ? extractDeviceStatusCards(toolName, part.output)
      : [];
  const rooms =
    part.state === "output-available"
      ? extractRoomCards(toolName, part.output)
      : [];

  return (
    <Card className="inset-panel w-fit max-w-full rounded-2xl border-border/65 bg-card/88">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold tracking-wide text-foreground">
            工具调用: {toolName}
          </p>
          <span className="data-pill py-0.5 text-[11px]">
            {formatToolState(part.state)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {part.state === "input-streaming" ? (
          <div className="text-xs text-muted-foreground">正在生成工具参数...</div>
        ) : null}

        {part.state === "input-available" ? (
          <pre className="overflow-x-auto rounded-md border border-border/70 bg-background/90 p-2 text-xs">
            {toJson(part.input)}
          </pre>
        ) : null}

        {part.state === "output-error" ? (
          <Alert variant="destructive" className="text-xs">
            {part.errorText}
          </Alert>
        ) : null}

        {part.state === "output-denied" ? (
          <Alert className="text-xs">该工具调用被拒绝，未执行。</Alert>
        ) : null}

        {part.state === "output-available" ? (
          <>
            {devices.length > 0 ? (
              <div className="space-y-2">
                {devices.map((device) => (
                  <DeviceStatusCard
                    key={`${toolName}-${device.deviceId}`}
                    device={device}
                  />
                ))}
              </div>
            ) : rooms.length > 0 ? (
              <div className="space-y-2">
                {rooms.map((room) => (
                  <RoomSummaryCard key={`${toolName}-${room.roomId}`} room={room} />
                ))}
              </div>
            ) : (
              <pre className="overflow-x-auto rounded-md border border-border/70 bg-background/90 p-2 text-xs">
                {toJson(part.output)}
              </pre>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ChatSession({
  homeId,
  homeName,
  token,
}: {
  homeId: string;
  homeName?: string;
  token?: string;
}) {
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
    transport,
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
      {error ? <Alert variant="destructive">{error.message || "请求失败，请稍后重试。"}</Alert> : null}

      <section className="surface-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.25rem]">
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-4 sm:px-5">
          {messages.length === 0 ? (
            <div className="grid min-h-full place-items-center py-8">
              <div className="inset-panel relative w-full max-w-3xl overflow-hidden rounded-[1.25rem] p-5 sm:p-6">
                <div className="ambient-orb -right-20 -top-16 bg-[oklch(0.73_0.08_214_/_24%)]" />
                <div className="relative">
                  <p className="section-eyebrow">对话助手</p>
                  <h2 className="mt-1 text-2xl font-semibold">家庭上下文对话</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    基于 AI SDK 流式响应，支持工具调用与设备控制。输入自然语言即可主动查询设备、房间与状态。
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="data-pill">当前家庭: {homeName || homeId}</span>
                    {/* <span className="data-pill">已准备 {quickPrompts.length} 个示例问题</span> */}
                  </div>
                  <div className="mt-5">
                    <p className="text-xs font-semibold tracking-wide text-muted-foreground">试试这些问题</p>
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
                    <div className="flex flex-col items-start gap-2">
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
                <div className="status-live text-xs text-muted-foreground">模型正在思考...</div>
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
            <span className="text-xs text-muted-foreground">Enter 发送，Shift + Enter 换行</span>
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
}

function ChatPage() {
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
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: "/chat",
  component: ChatPage,
});
