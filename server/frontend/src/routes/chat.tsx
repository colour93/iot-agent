import { createRoute } from '@tanstack/react-router';
import { Route as RootRoute } from './__root';
import { useAppStore } from '../lib/store';
import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Alert } from '../components/ui/alert';
import { useHomes } from '../lib/swr-hooks';

const quickPrompts = [
  '总结当前家庭在线设备状态',
  '帮我创建一个夜间温湿度联动自动化',
  '检查客厅设备最近是否异常',
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

function ChatPage() {
  const chatLog = useAppStore((s) => s.chatLog);
  const sendChat = useAppStore((s) => s.sendChat);
  const selectedHome = useAppStore((s) => s.selectedHome);
  const { data: homes = [] } = useHomes();
  const currentHome = homes.find((item) => item.id === selectedHome);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doSend = async (raw: string) => {
    const prompt = raw.trim();
    if (!prompt || !selectedHome || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendChat(prompt);
      setInput('');
    } catch {
      setError('消息发送失败，请稍后重试。');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="surface-panel relative overflow-hidden p-4 sm:p-5">
        <div className="ambient-orb -right-16 -top-16 bg-[oklch(0.73_0.08_214_/_24%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="section-eyebrow">对话助手</p>
            <div className="mt-1 text-lg font-semibold sm:text-xl">家庭上下文对话</div>
            <p className="mt-1 text-sm text-muted-foreground">支持状态问答、策略生成和异常排查，所有会话按家庭隔离。</p>
          </div>
          <span className="data-pill">
            当前家庭: {currentHome?.name || '未选择'}
          </span>
        </div>
        <div className="relative mt-3 flex flex-wrap gap-2">
          {quickPrompts.map((prompt) => (
            <PromptChip
              key={prompt}
              prompt={prompt}
              disabled={!selectedHome || sending}
              onClick={() => {
                void doSend(prompt);
              }}
            />
          ))}
        </div>
      </section>
      {!selectedHome && <Alert>请先在总览页选择家庭后再发起对话。</Alert>}
      {error && <Alert variant="destructive">{error}</Alert>}
      <div className="surface-panel h-[26rem] overflow-auto rounded-2xl p-3 text-sm sm:h-[30rem]">
        {chatLog.map((m, idx) => (
          <div key={idx} className={`mb-3 flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[86%] rounded-2xl px-3 py-2 sm:max-w-[78%] ${
                m.role === 'user'
                  ? 'bg-primary text-primary-foreground shadow-[0_8px_18px_-14px_oklch(0.35_0.13_220_/_90%)]'
                  : 'border border-border/80 bg-card/92 text-foreground'
              }`}
            >
              <div className="mb-1 text-[10px] uppercase tracking-wide opacity-70">{m.role === 'user' ? '你' : '助手'}</div>
              <div className="whitespace-pre-wrap break-words">{m.text}</div>
            </div>
          </div>
        ))}
        {chatLog.length === 0 && <div className="text-xs text-muted-foreground">还没有消息，试试上方快捷提问。</div>}
        {sending && <div className="status-live text-xs text-muted-foreground">模型正在思考...</div>}
      </div>
      <div className="surface-panel rounded-xl p-3">
        <textarea
          className="min-h-24 w-full resize-y rounded-md border border-border/80 bg-background/92 px-3 py-2 text-sm outline-none transition-[border-color,box-shadow,background-color] duration-200 focus:border-primary/20 focus:bg-card focus:ring-2 focus:ring-ring/70"
          placeholder="例如：把客厅温度保持在 25 度并生成自动化"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              await doSend(input);
            }
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Enter 发送，Shift + Enter 换行</span>
          <Button
            disabled={!selectedHome || !input.trim() || sending}
            onClick={async () => {
              await doSend(input);
            }}
          >
            {sending ? '发送中...' : '发送'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/chat',
  component: ChatPage,
});

