import { createRoute } from '@tanstack/react-router';
import { Route as RootRoute } from './__root';
import { useAppStore } from '../lib/store';
import { useState } from 'react';
import { Button } from '../components/ui/button';

function ChatPage() {
  const chatLog = useAppStore((s) => s.chatLog);
  const sendChat = useAppStore((s) => s.sendChat);
  const [input, setInput] = useState('');

  return (
    <div className="space-y-4">
      <div>
        <div className="text-lg font-semibold">前台模型对话</div>
        <p className="text-sm text-gray-500">按家庭隔离上下文，可查询状态、创建自动化。</p>
      </div>
      <div className="h-72 overflow-auto rounded border bg-white p-3 text-sm shadow-sm">
        {chatLog.map((m, idx) => (
          <div key={idx} className="mb-2">
            <div className="text-xs text-gray-500">{m.role}</div>
            <div>{m.text}</div>
          </div>
        ))}
        {chatLog.length === 0 && <div className="text-xs text-gray-400">还没有消息</div>}
      </div>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded border px-3 py-2 text-sm"
          placeholder="例如：把客厅温度保持在 25 度并生成自动化"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <Button
          onClick={() => {
            if (!input) return;
            sendChat(input);
            setInput('');
          }}
        >
          发送
        </Button>
      </div>
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/chat',
  component: ChatPage,
});

