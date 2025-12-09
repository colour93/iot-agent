import { createRoute } from '@tanstack/react-router';
import { Route as RootRoute } from './__root';
import { useAppStore } from '../lib/store';
import { useState } from 'react';
import { useAutomations } from '../lib/swr-hooks';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

function AutomationsPage() {
  const selectedHome = useAppStore((s) => s.selectedHome);
  const { data: automations = [], mutate } = useAutomations(selectedHome);
  const [name, setName] = useState('新建自动化');
  const schema = z.object({
    conditions: z.array(z.any()),
    actions: z.array(z.any()),
  });
  const form = useForm({
    resolver: zodResolver(
      z.object({
        json: z
          .string()
          .refine((val: string) => {
            try {
              const parsed = JSON.parse(val);
              schema.parse(parsed);
              return true;
            } catch {
              return false;
            }
          }, '需为合法 JSON，且包含 conditions/actions 数组'),
      }),
    ),
    defaultValues: {
      json: JSON.stringify(
        {
          conditions: [{ kind: 'attr', deviceId: 'esp32-demo-1', path: 'temperature', op: 'gt', value: 28 }],
          actions: [{ kind: 'command', deviceId: 'ac-1', method: 'set_ac', params: { mode: 'cool', temp: 25 } }],
        },
        null,
        2,
      ),
    },
  });
  const { register, handleSubmit, formState } = form;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">自动化</div>
          <p className="text-sm text-gray-500">确定性 JSON 规则，优先于后台 LLM 执行。</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => mutate()}>
          刷新
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="text-sm font-semibold">现有规则</CardHeader>
          <CardContent className="space-y-3">
            {automations.map((a) => (
              <div key={a.id} className="rounded border p-3">
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>{a.name}</span>
                  <span className={`text-xs ${a.enabled ? 'text-green-600' : 'text-gray-400'}`}>
                    {a.enabled ? '启用' : '停用'}
                  </span>
                </div>
                <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-gray-50 p-2 text-xs">
                  {JSON.stringify(a.definition, null, 2)}
                </pre>
              </div>
            ))}
            {automations.length === 0 && <div className="text-xs text-gray-500">暂无规则</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="text-sm font-semibold">新建/编辑</CardHeader>
          <CardContent className="space-y-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            <form
              className="space-y-2"
              onSubmit={handleSubmit(async (values: { json: string }) => {
                if (!selectedHome) return;
                const def = JSON.parse(values.json);
                await api.saveAutomation(selectedHome, { name, definition: def, enabled: true });
                await mutate();
              })}
            >
              <textarea
                className="h-64 w-full rounded border px-2 py-1 text-xs font-mono"
                {...register('json')}
              />
              {formState.errors.json && (
                <div className="text-xs text-red-600">{formState.errors.json.message}</div>
              )}
              <Button className="w-full" type="submit">
                保存
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/automations',
  component: AutomationsPage,
});

