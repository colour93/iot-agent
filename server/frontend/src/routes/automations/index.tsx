import { createRoute } from '@tanstack/react-router';
import { Route as RootRoute } from '../__root';
import { useAppStore } from '../../lib/store';
import { useState } from 'react';
import { useAutomations } from '../../lib/swr-hooks';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Alert } from '../../components/ui/alert';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RuleStat } from './components/rule-stat';
import { defaultDefinition, presetTemplates } from './constants';

const AutomationsPage = () => {
  const selectedHome = useAppStore((s) => s.selectedHome);
  const token = useAppStore((s) => s.token);
  const { data: automations = [], mutate } = useAutomations(selectedHome);
  const [name, setName] = useState('新建自动化');
  const [workingId, setWorkingId] = useState<string | null>(null);
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
      json: JSON.stringify(defaultDefinition, null, 2),
    },
  });
  const { register, handleSubmit, formState, setValue, getValues } = form;
  const enabledCount = automations.filter((item) => item.enabled).length;
  const llmCount = automations.filter((item) => item.source === 'llm').length;

  return (
    <div className="space-y-6">
      <section className="surface-panel relative overflow-hidden p-5 sm:p-6">
        <div className="ambient-orb -left-10 top-2 bg-[oklch(0.73_0.08_214_/_24%)]" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-eyebrow">自动化中心</p>
            <h2 className="mt-1 text-2xl font-semibold sm:text-3xl">确定性规则编排</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              使用 JSON 规则定义触发条件与动作，适合高频、低延迟的设备联动场景。
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => mutate()}>
            刷新规则
          </Button>
        </div>
        <div className="relative mt-4 grid gap-3 sm:grid-cols-3">
          <RuleStat label="规则总数" value={String(automations.length)} />
          <RuleStat label="已启用" value={String(enabledCount)} />
          <RuleStat label="LLM 来源" value={String(llmCount)} />
        </div>
      </section>

      {!selectedHome && <Alert>请先在总览页选择或创建家庭，然后再管理自动化。</Alert>}

      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <Card className="surface-panel">
          <CardHeader className="text-sm font-semibold">现有规则</CardHeader>
          <CardContent className="space-y-3">
            {automations.map((a) => (
              <article key={a.id} className="inset-panel rounded-xl p-3">
                <div className="flex flex-wrap items-start justify-between gap-2 text-sm font-semibold">
                  <span>{a.name}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] ${
                        a.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {a.enabled ? '启用' : '停用'}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {a.source || 'json'}
                    </span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>作用域: {a.scope || 'home'}</span>
                  <span>规则ID: {a.id}</span>
                </div>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-2 text-xs">
                  {JSON.stringify(a.definition, null, 2)}
                </pre>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={a.enabled ? 'secondary' : 'outline'}
                    disabled={workingId !== null}
                    onClick={async () => {
                      setWorkingId(`toggle-${a.id}`);
                      try {
                        await api.toggleAutomation(a.id, !a.enabled, token);
                        await mutate();
                      } finally {
                        setWorkingId(null);
                      }
                    }}
                  >
                    {workingId === `toggle-${a.id}` ? '处理中...' : a.enabled ? '停用' : '启用'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={workingId !== null}
                    onClick={async () => {
                      setWorkingId(`run-${a.id}`);
                      try {
                        await api.runAutomation(a.id, undefined, token);
                      } finally {
                        setWorkingId(null);
                      }
                    }}
                  >
                    {workingId === `run-${a.id}` ? '执行中...' : '手动执行'}
                  </Button>
                </div>
              </article>
            ))}
            {automations.length === 0 && <div className="text-xs text-muted-foreground">暂无规则</div>}
          </CardContent>
        </Card>

        <Card className="surface-panel">
          <CardHeader className="text-sm font-semibold">新建 / 编辑规则</CardHeader>
          <CardContent className="space-y-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="自动化名称" />
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">预设模板</div>
              <div className="flex flex-wrap gap-2">
                {presetTemplates.map((template) => (
                  <Button
                    key={template.name}
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setName(template.name);
                      setValue('json', JSON.stringify(template.definition, null, 2), { shouldValidate: true });
                    }}
                  >
                    {template.name}
                  </Button>
                ))}
              </div>
            </div>
            <p className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              编辑器要求 `conditions` 与 `actions` 为数组。点击“格式化 JSON”可自动整理结构，便于审阅。
            </p>
            <form
              className="space-y-2"
              onSubmit={handleSubmit(async (values: { json: string }) => {
                if (!selectedHome) return;
                const def = JSON.parse(values.json);
                await api.saveAutomation(selectedHome, { name, definition: def, enabled: true, source: 'json' }, token);
                await mutate();
              })}
            >
              <textarea
                className="h-72 w-full rounded-md border border-border/80 bg-background/92 px-3 py-2 text-xs font-mono shadow-[inset_0_1px_0_oklch(1_0_0_/_50%)] outline-none transition-[border-color,box-shadow,background-color] duration-200 focus:border-primary/20 focus:ring-2 focus:ring-ring/70"
                {...register('json')}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const raw = getValues('json');
                    try {
                      const parsed = JSON.parse(raw);
                      setValue('json', JSON.stringify(parsed, null, 2), { shouldValidate: true });
                    } catch {
                      // keep user input as-is and let validator show message
                    }
                  }}
                >
                  格式化 JSON
                </Button>
                <Button className="min-w-32" type="submit" disabled={!selectedHome}>
                  保存规则
                </Button>
              </div>
              {formState.errors.json && <div className="text-xs text-destructive">{formState.errors.json.message}</div>}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/automations',
  component: AutomationsPage,
});

