import { createRoute, Link } from '@tanstack/react-router';
import { Route as RootRoute } from './__root';
import { useAppStore } from '../lib/store';
import { useHomes, useRooms, useDevices, useAutomations } from '../lib/swr-hooks';
import { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Alert } from '../components/ui/alert';
import { api } from '../lib/api';
import { mutate } from 'swr';

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <article className="surface-panel relative overflow-hidden p-4 sm:p-5">
      <div className="text-[0.68rem] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold sm:text-3xl">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </article>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold sm:text-xl">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function HomeSelector() {
  const { data: homes = [] } = useHomes();
  const selectedHome = useAppStore((s) => s.selectedHome);
  const selectHome = useAppStore((s) => s.selectHome);

  useEffect(() => {
    if (!selectedHome && homes.length) selectHome(homes[0].id);
  }, [homes, selectedHome, selectHome]);

  if (!homes.length) {
    return <Alert className="text-xs">暂无家庭，请先创建</Alert>;
  }

  return (
    <label className="flex min-w-[13rem] flex-col gap-1 text-xs text-muted-foreground">
      当前家庭
      <select
        className="h-10 rounded-lg border border-border bg-white/92 px-3 text-sm text-foreground shadow-sm"
        value={selectedHome || ''}
        onChange={(e) => selectHome(e.target.value)}
      >
        {homes.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Dashboard() {
  const selectedHome = useAppStore((s) => s.selectedHome);
  const selectedRoom = useAppStore((s) => s.selectedRoom);
  const selectRoom = useAppStore((s) => s.selectRoom);
  const sendCommand = useAppStore((s) => s.sendCommand);
  const token = useAppStore((s) => s.token);
  const user = useAppStore((s) => s.user);

  const [homeName, setHomeName] = useState('');
  const [showCreateHome, setShowCreateHome] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomFloor, setRoomFloor] = useState('');
  const [roomType, setRoomType] = useState('');
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [deviceForm, setDeviceForm] = useState({ deviceId: '', name: '', type: '', roomId: '', secret: '' });

  const { data: homes = [] } = useHomes();
  const { data: rooms = [] } = useRooms(selectedHome);
  const { data: devices = [] } = useDevices(selectedHome);
  const { data: automations = [] } = useAutomations(selectedHome);

  const onlineCount = devices.filter((item) => item.status === 'online').length;
  const enabledAutomations = automations.filter((item) => item.enabled).length;

  useEffect(() => {
    if (!selectedRoom && rooms.length) selectRoom(rooms[0].id);
  }, [rooms, selectedRoom, selectRoom]);

  useEffect(() => {
    if (selectedRoom && !deviceForm.roomId) {
      setDeviceForm((prev) => ({ ...prev, roomId: selectedRoom }));
    }
  }, [selectedRoom, deviceForm.roomId]);

  const hasHome = !!selectedHome;
  const hasRoom = rooms.length > 0;
  const filteredDevices = devices.filter((item) => !selectedRoom || item.roomId === selectedRoom);
  const [showCreateDevice, setShowCreateDevice] = useState(false);

  return (
    <div className="space-y-6">
      <section className="surface-panel relative overflow-hidden p-5 sm:p-6">
        <div className="ambient-orb -left-12 top-8 bg-[oklch(0.73_0.13_220_/_45%)]" />
        <div className="ambient-orb -right-10 -bottom-20 bg-[oklch(0.76_0.08_176_/_45%)] [animation-delay:0.35s]" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="section-eyebrow">Home Topology</p>
            <h2 className="mt-1 text-2xl font-semibold sm:text-3xl">家庭 / 房间 / 设备总览</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              以家庭为边界组织设备链路，统一承载命令下发、自动化执行与前台模型对话。
            </p>
          </div>
          <div className="flex w-full flex-wrap items-end gap-2 lg:w-auto lg:justify-end">
            <HomeSelector />
            <Button size="sm" variant="outline" onClick={() => setShowCreateHome((value) => !value)}>
              {showCreateHome ? '收起创建' : '创建家庭'}
            </Button>
          </div>
        </div>
        <div className="relative mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="家庭数" value={String(homes.length)} hint="当前可访问家庭" />
          <StatCard label="房间数" value={String(rooms.length)} hint="当前家庭房间总量" />
          <StatCard label="设备在线" value={`${onlineCount}/${devices.length || 0}`} hint="基于状态快照" />
          <StatCard label="自动化启用" value={`${enabledAutomations}/${automations.length || 0}`} hint="确定性规则引擎" />
        </div>
      </section>

      {(!homes.length || showCreateHome) && (
        <Card className="surface-panel">
          <CardHeader className="text-sm font-semibold">创建家庭</CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input placeholder="家庭名称" value={homeName} onChange={(e) => setHomeName(e.target.value)} />
              <Button
                disabled={!homeName || !user}
                onClick={async () => {
                  if (!homeName || !user) return;
                  const home = await api.createHome({ name: homeName, ownerId: user.id }, token);
                  setHomeName('');
                  setShowCreateHome(false);
                  mutate('/api/homes');
                  useAppStore.setState({ selectedHome: home.id });
                }}
              >
                创建
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">建议按真实地理位置命名，便于后续自动化策略按家庭隔离。</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_1.7fr]">
        <Card className="surface-panel">
          <CardHeader className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">
            <span>房间管理</span>
            {hasHome && (
              <Button size="sm" variant="outline" onClick={() => setShowCreateRoom((value) => !value)}>
                {showCreateRoom ? '收起创建' : '创建房间'}
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {rooms.length === 0 && <div className="text-xs text-muted-foreground">暂无房间</div>}
            {showCreateRoom || (!rooms.length && hasHome) ? (
              <div className="space-y-2 rounded-xl border border-border/80 p-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input placeholder="房间名称" value={roomName} onChange={(e) => setRoomName(e.target.value)} />
                  <Input placeholder="楼层(可选)" value={roomFloor} onChange={(e) => setRoomFloor(e.target.value)} />
                  <Input placeholder="类型(可选)" value={roomType} onChange={(e) => setRoomType(e.target.value)} />
                </div>
                <Button
                  disabled={!roomName || !hasHome}
                  onClick={async () => {
                    await api.createRoom(selectedHome!, { name: roomName, floor: roomFloor || undefined, type: roomType || undefined }, token);
                    setRoomName('');
                    setRoomFloor('');
                    setRoomType('');
                    setShowCreateRoom(false);
                    mutate(`/api/homes/${selectedHome}/rooms`);
                  }}
                >
                  创建房间
                </Button>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {rooms.map((r) => (
                <Button
                  key={r.id}
                  size="sm"
                  variant={selectedRoom === r.id ? 'default' : 'secondary'}
                  className="px-3"
                  onClick={() => selectRoom(r.id)}
                  disabled={!hasHome}
                >
                  {r.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="surface-panel">
          <CardHeader className="flex items-center justify-between">
            <div className="text-sm font-semibold">策略与协作入口</div>
            <Link to="/automations" className="text-xs font-medium text-primary hover:underline">
              管理自动化
            </Link>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <SectionTitle
              title="先规则，后对话"
              subtitle="自动化页用于维护确定性规则；对话页负责解释状态和草拟新规则。"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                to="/automations"
                className="surface-panel relative block rounded-xl p-3 text-xs text-muted-foreground transition hover:-translate-y-px hover:text-foreground"
              >
                <div className="section-eyebrow">Deterministic</div>
                <div className="mt-1 text-sm font-medium text-foreground">自动化规则编排</div>
                <p className="mt-1 leading-relaxed">维护 JSON 规则、启停策略并手动触发验证。</p>
              </Link>
              <Link
                to="/chat"
                className="surface-panel relative block rounded-xl p-3 text-xs text-muted-foreground transition hover:-translate-y-px hover:text-foreground"
              >
                <div className="section-eyebrow">Copilot</div>
                <div className="mt-1 text-sm font-medium text-foreground">前台对话助手</div>
                <p className="mt-1 leading-relaxed">通过自然语言查询状态、生成可执行的策略草案。</p>
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/observability"
                className="rounded-full border border-border bg-white/85 px-3 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                打开观测面板
              </Link>
              <Link
                to="/chat"
                className="rounded-full border border-border bg-white/85 px-3 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                发起会话
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="surface-panel">
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">设备与命令链路</div>
            <p className="mt-1 text-xs text-muted-foreground">设备能力展示、属性快照与方法调用统一在此处完成。</p>
          </div>
          <div className="data-pill">
            当前筛选房间: {rooms.find((item) => item.id === selectedRoom)?.name || '未选择'}
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold">设备列表</div>
            {hasHome && hasRoom && (
              <Button size="sm" variant="outline" onClick={() => setShowCreateDevice((value) => !value)}>
                {showCreateDevice ? '收起创建' : '预注册设备'}
              </Button>
            )}
          </div>

          {!hasHome && <Alert className="mb-3 text-xs">请先创建或选择家庭，再管理设备。</Alert>}
          {hasHome && !hasRoom && <Alert className="mb-3 text-xs">当前家庭暂无房间，请先创建房间再预注册设备。</Alert>}

          {hasHome && hasRoom && showCreateDevice && (
            <div className="mb-3 space-y-2 rounded-xl border border-border/80 bg-white/65 p-3 text-xs">
              <div className="text-sm font-semibold">预注册设备</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  placeholder="设备ID"
                  value={deviceForm.deviceId}
                  onChange={(e) => setDeviceForm({ ...deviceForm, deviceId: e.target.value })}
                />
                <Input placeholder="名称" value={deviceForm.name} onChange={(e) => setDeviceForm({ ...deviceForm, name: e.target.value })} />
                <Input
                  placeholder="类型(可选)"
                  value={deviceForm.type}
                  onChange={(e) => setDeviceForm({ ...deviceForm, type: e.target.value })}
                />
                <select
                  className="h-10 rounded-md border border-border bg-white px-2 text-sm"
                  value={deviceForm.roomId}
                  onChange={(e) => setDeviceForm({ ...deviceForm, roomId: e.target.value })}
                >
                  <option value="">选择房间</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                disabled={!deviceForm.deviceId || !deviceForm.name || !deviceForm.roomId}
                onClick={async () => {
                  const res = await api.preRegisterDevice(selectedHome!, {
                    roomId: deviceForm.roomId,
                    deviceId: deviceForm.deviceId,
                    name: deviceForm.name,
                    type: deviceForm.type || undefined,
                    category: 'both',
                  }, token);
                  setDeviceForm({ ...deviceForm, secret: res.secret });
                  mutate(`/api/homes/${selectedHome}/devices`);
                }}
              >
                预注册
              </Button>
              {deviceForm.secret && <Alert className="text-xs">设备密钥：{deviceForm.secret}</Alert>}
            </div>
          )}
          {filteredDevices.length === 0 ? (
            <div className="text-xs text-muted-foreground">暂无设备</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {filteredDevices.map((item) => (
                <article key={item.deviceId} className="surface-panel relative overflow-hidden rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{item.name}</div>
                      <div className="text-xs text-muted-foreground">{item.deviceId}</div>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        item.status === 'online'
                          ? 'status-live border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-slate-100 text-slate-500'
                      }`}
                    >
                      {item.status === 'online' ? '在线' : '离线'}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1 text-xs">
                    {item.attrs && Object.keys(item.attrs).length > 0 ? (
                      Object.entries(item.attrs).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between gap-3 rounded bg-muted/40 px-2 py-1">
                          <span className="text-muted-foreground">{key}</span>
                          <span>{String(value)}</span>
                        </div>
                      ))
                    ) : (
                      <div className="text-muted-foreground">暂无属性快照</div>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {(item.capabilities || []).slice(0, 4).map((cap) => (
                      <span
                        key={`${item.deviceId}-${cap.kind}-${cap.name}`}
                        className="rounded-full bg-muted px-2 py-0.5 text-[11px]"
                      >
                        {cap.kind}:{cap.name}
                      </span>
                    ))}
                  </div>
                  <form
                    className="mt-3 space-y-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.target as HTMLFormElement;
                      const method = (form.elements.namedItem('method') as HTMLInputElement).value;
                      const raw = (form.elements.namedItem('value') as HTMLInputElement).value.trim();
                      let value: unknown = raw;
                      if (raw) {
                        try {
                          value = JSON.parse(raw);
                        } catch {
                          value = raw;
                        }
                      }
                      await sendCommand(item.deviceId, method, raw ? { value } : {});
                      form.reset();
                    }}
                  >
                    <Input
                      name="method"
                      placeholder="方法名"
                      defaultValue={item.capabilities?.find((cap) => cap.kind === 'method')?.name || 'set_led'}
                    />
                    <Input name="value" placeholder='参数值，支持 JSON，例如 {"value":1}' />
                    <Button type="submit" size="sm" className="w-full">
                      下发命令
                    </Button>
                  </form>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/',
  component: Dashboard,
});

