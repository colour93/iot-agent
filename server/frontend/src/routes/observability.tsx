import { createRoute } from '@tanstack/react-router';
import { Route as RootRoute } from './__root';
import { useAppStore } from '../lib/store';
import { useAutomations, useDevices, useMetricsSummary, useMqttMetrics } from '../lib/swr-hooks';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '../components/ui/table';
import { Alert } from '../components/ui/alert';

function MetricCard({ title, value, desc }: { title: string; value: string; desc: string }) {
  return (
    <Card className="surface-panel relative overflow-hidden rounded-xl">
      <CardContent className="space-y-1 p-4">
        <div className="text-[0.68rem] uppercase tracking-[0.2em] text-muted-foreground">{title}</div>
        <div className="text-2xl font-semibold">{value}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </CardContent>
    </Card>
  );
}

function ObservabilityPage() {
  const selectedHome = useAppStore((s) => s.selectedHome);
  const { data: devices = [] } = useDevices(selectedHome);
  const { data: automations = [] } = useAutomations(selectedHome);
  const { data: summary } = useMetricsSummary();
  const { data: mqtt } = useMqttMetrics();

  const online = devices.filter((item) => item.status === 'online').length;
  const enabledAutomations = automations.filter((item) => item.enabled).length;
  const commandVolume = summary?.totalCommands ?? 0;
  const mqttConnected = mqtt?.connected ?? false;
  const mqttError = mqtt?.lastError || '无';

  return (
    <div className="space-y-4">
      <section className="surface-panel relative overflow-hidden p-5 sm:p-6">
        <div className="ambient-orb -left-16 top-2 bg-[oklch(0.73_0.08_214_/_24%)]" />
        <div className="relative">
          <p className="section-eyebrow">运行观测</p>
          <h2 className="mt-1 text-2xl font-semibold sm:text-3xl">观测与审计面板</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            聚合设备在线状态、命令吞吐、MQTT 健康度和自动化规则快照，便于快速定位链路问题。
          </p>
        </div>
      </section>
      {!selectedHome && <Alert>当前未选择家庭，以下指标为全局与回退数据。</Alert>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="设备在线" value={`${online}/${devices.length || 0}`} desc="当前家庭在线比" />
        <MetricCard title="自动化启用" value={`${enabledAutomations}/${automations.length || 0}`} desc="确定性规则状态" />
        <MetricCard title="命令总量" value={String(commandVolume)} desc="后端累计命令计数" />
        <MetricCard title="MQTT 连接" value={mqttConnected ? '已连接' : '未连接'} desc={`最近错误: ${mqttError}`} />
      </div>

      <Card className="surface-panel">
        <CardHeader className="text-sm font-semibold">设备状态快照</CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <div className="text-xs text-muted-foreground">当前家庭暂无设备数据。</div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[640px]">
                <THead>
                  <TR>
                    <TH>设备</TH>
                    <TH>状态</TH>
                    <TH>房间</TH>
                    <TH>关键属性</TH>
                  </TR>
                </THead>
                <TBody>
                  {devices.map((device) => (
                    <TR key={device.deviceId}>
                      <TD>
                        <div className="font-medium">{device.name}</div>
                        <div className="text-xs text-muted-foreground">{device.deviceId}</div>
                      </TD>
                      <TD className={device.status === 'online' ? 'text-emerald-700' : 'text-slate-500'}>
                        {device.status === 'online' ? '在线' : device.status === 'offline' ? '离线' : device.status}
                      </TD>
                      <TD>{device.roomId || '-'}</TD>
                      <TD>
                        <div className="max-w-sm truncate text-xs text-muted-foreground">
                          {device.attrs ? JSON.stringify(device.attrs) : '-'}
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="surface-panel">
        <CardHeader className="text-sm font-semibold">自动化规则快照</CardHeader>
        <CardContent className="space-y-2">
          {automations.slice(0, 5).map((automation) => (
            <div key={automation.id} className="inset-panel rounded-lg p-3">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">{automation.name}</span>
                <span className={automation.enabled ? 'text-emerald-700' : 'text-slate-500'}>
                  {automation.enabled ? '启用' : '停用'}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                来源: {automation.source || 'json'} | 范围: {automation.scope || 'home'}
              </div>
            </div>
          ))}
          {automations.length === 0 && <div className="text-xs text-muted-foreground">暂无自动化规则。</div>}
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/observability',
  component: ObservabilityPage,
});

