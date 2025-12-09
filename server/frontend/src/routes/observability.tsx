import { createRoute } from '@tanstack/react-router';
import { Route as RootRoute } from './__root';

const cards = [
  { title: '命令成功率', value: '98%', desc: '最近 1h' },
  { title: 'LLM token', value: '12k', desc: '前台+后台' },
  { title: '设备在线', value: '5/6', desc: '家庭 home-1' },
  { title: '自动化命中', value: '14', desc: '今日累计' },
];

function ObservabilityPage() {
  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold">观测与审计</div>
      <div className="grid grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.title} className="rounded border bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-500">{c.title}</div>
            <div className="text-2xl font-semibold">{c.value}</div>
            <div className="text-xs text-gray-400">{c.desc}</div>
          </div>
        ))}
      </div>
      <div className="rounded border bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold">日志示例</div>
        <ul className="mt-2 space-y-2 text-xs text-gray-600">
          <li>[LLM] front session home-1 cost 0.12</li>
          <li>[CMD] device esp32-demo-1 set_led ok</li>
          <li>[AUTO] 夏天客厅降温 已执行</li>
        </ul>
      </div>
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/observability',
  component: ObservabilityPage,
});

