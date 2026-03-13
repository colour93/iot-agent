import { createRoute, Link } from '@tanstack/react-router';
import { Route as RootRoute } from './__root';
import { useAppStore } from '../lib/store';
import { useAutomations, useHomeStructure, useHomes } from '../lib/swr-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Alert } from '../components/ui/alert';
import { api } from '../lib/api';
import { mutate } from 'swr';
import type { Device, Home, Room } from '../lib/types';

function MetricTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="surface-panel relative overflow-hidden p-4">
      <div className="text-[0.72rem] tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

function HomeCard({
  home,
  active,
  onClick,
}: {
  home: Home;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`surface-panel interactive-panel w-full rounded-[1.15rem] p-4 text-left focus-visible:outline-none ${
        active
          ? 'border-primary/18 bg-primary/6 shadow-[0_18px_34px_-28px_oklch(0.29_0.08_220_/_22%)]'
          : 'bg-card/82'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-foreground">{home.name}</div>
          <div className="mt-1 text-xs text-muted-foreground">{home.timezone || 'Asia/Shanghai'}</div>
        </div>
        <span className="data-pill shrink-0">{home.roomsCount ?? 0} 房间</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
        <div>
          <div className="text-lg font-semibold text-foreground">{home.devicesCount ?? 0}</div>
          <div>设备</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-foreground">{home.onlineDevicesCount ?? 0}</div>
          <div>在线</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-foreground">{home.automationsCount ?? 0}</div>
          <div>规则</div>
        </div>
      </div>
    </button>
  );
}

function RoomCard({
  room,
  active,
  editing,
  draft,
  onSelect,
  onDraftChange,
  onStartEdit,
  onCancelEdit,
  onSave,
}: {
  room: Room;
  active: boolean;
  editing: boolean;
  draft: { name: string; floor: string; type: string };
  onSelect: () => void;
  onDraftChange: (field: 'name' | 'floor' | 'type', value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
}) {
  return (
    <article
      className={`surface-panel rounded-[1.1rem] p-4 ${
        active ? 'border-primary/18 bg-card shadow-[0_18px_34px_-28px_oklch(0.29_0.08_220_/_18%)]' : 'bg-card/78'
      }`}
    >
      {editing ? (
        <div className="space-y-2">
          <Input value={draft.name} onChange={(e) => onDraftChange('name', e.target.value)} placeholder="房间名称" />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={draft.floor} onChange={(e) => onDraftChange('floor', e.target.value)} placeholder="楼层" />
            <Input value={draft.type} onChange={(e) => onDraftChange('type', e.target.value)} placeholder="类型" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={onSave} disabled={!draft.name.trim()}>
              保存
            </Button>
            <Button size="sm" variant="outline" onClick={onCancelEdit}>
              取消
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <button type="button" onClick={onSelect} className="w-full text-left">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{room.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {[room.floor, room.type].filter(Boolean).join(' · ') || '未设置标签'}
                </div>
              </div>
              {active ? <span className="data-pill">当前房间</span> : null}
            </div>
            <div className="mt-4 flex gap-5 text-xs text-muted-foreground">
              <span>{room.devicesCount ?? 0} 台设备</span>
              <span>{room.onlineDevicesCount ?? 0} 台在线</span>
            </div>
          </button>
          <div className="flex gap-2">
            {!active ? (
              <Button size="sm" variant="secondary" onClick={onSelect}>
                进入房间
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={onStartEdit}>
              编辑
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}

function DevicePanel({
  device,
  onSendCommand,
}: {
  device: Device;
  onSendCommand: (deviceId: string, method: string, params: Record<string, unknown>, roomId: string) => Promise<void>;
}) {
  return (
    <article className="surface-panel relative overflow-hidden rounded-[1.15rem] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{device.name}</div>
          <div className="mt-1 text-xs text-muted-foreground">{device.deviceId}</div>
        </div>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs ${
            device.status === 'online'
              ? 'status-live border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-slate-200 bg-slate-100 text-slate-500'
          }`}
        >
          {device.status === 'online' ? '在线' : '离线'}
        </span>
      </div>

      <div className="mt-3 space-y-1 text-xs">
        {device.attrs && Object.keys(device.attrs).length > 0 ? (
          Object.entries(device.attrs).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between gap-3 rounded bg-muted/40 px-2 py-1">
              <span className="text-muted-foreground">{key}</span>
              <span>{String(value)}</span>
            </div>
          ))
        ) : (
          <div className="text-muted-foreground">还没有属性快照</div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {(device.capabilities || []).slice(0, 4).map((cap) => (
          <span key={`${device.deviceId}-${cap.kind}-${cap.name}`} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
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
          await onSendCommand(device.deviceId, method, raw ? { value } : {}, device.roomId);
          form.reset();
        }}
      >
        <Input
          name="method"
          placeholder="方法名"
          defaultValue={device.capabilities?.find((cap) => cap.kind === 'method')?.name || 'set_led'}
        />
        <Input name="value" placeholder='参数值，支持 JSON，例如 {"value":1}' />
        <Button type="submit" size="sm" className="w-full">
          下发命令
        </Button>
      </form>
    </article>
  );
}

function Dashboard() {
  const selectedHome = useAppStore((s) => s.selectedHome);
  const selectedRoom = useAppStore((s) => s.selectedRoom);
  const selectHome = useAppStore((s) => s.selectHome);
  const selectRoom = useAppStore((s) => s.selectRoom);
  const sendCommand = useAppStore((s) => s.sendCommand);
  const token = useAppStore((s) => s.token);
  const user = useAppStore((s) => s.user);

  const [createHomeOpen, setCreateHomeOpen] = useState(false);
  const [homeDraft, setHomeDraft] = useState({ name: '', timezone: 'Asia/Shanghai', address: '' });
  const [homeMetaDraft, setHomeMetaDraft] = useState({ name: '', timezone: 'Asia/Shanghai', address: '' });
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [roomDraft, setRoomDraft] = useState({ name: '', floor: '', type: '' });
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [roomEditDraft, setRoomEditDraft] = useState({ name: '', floor: '', type: '' });
  const [createDeviceOpen, setCreateDeviceOpen] = useState(false);
  const [deviceSecret, setDeviceSecret] = useState('');
  const [deviceForm, setDeviceForm] = useState({ deviceId: '', name: '', type: '' });

  const { data: homes = [] } = useHomes();
  const { data: structure } = useHomeStructure(selectedHome);
  const { data: automations = [] } = useAutomations(selectedHome);

  const currentHome = structure?.home || homes.find((home) => home.id === selectedHome);
  const rooms = structure?.rooms ?? [];
  const currentRoom = rooms.find((room) => room.id === selectedRoom) ?? rooms[0];
  const currentDevices = currentRoom?.devices ?? [];

  const enabledAutomations = useMemo(
    () => automations.filter((automation) => automation.enabled).length,
    [automations],
  );
  const heroTitle = currentHome
    ? `继续管理 ${currentHome.name} 的空间与设备`
    : '先创建一个家庭，开始整理你的空间与设备';
  const heroDescription = currentHome
    ? currentRoom
      ? `当前聚焦 ${currentRoom.name}，下方可以继续查看设备状态、维护房间信息，并快速进入自动化与观测。`
      : '先选择一个房间，再继续查看设备状态、下发命令或整理自动化。'
    : '创建家庭后，就能按房间归置设备，让命令、自动化和对话都落在明确的空间上下文里。';
  const roomSummary = currentRoom?.name || (rooms.length ? '请选择房间' : '还没有房间');

  useEffect(() => {
    if (!selectedHome && homes.length) {
      selectHome(homes[0].id);
    }
  }, [homes, selectedHome, selectHome]);

  useEffect(() => {
    if (!selectedHome || !currentHome) return;
    setHomeMetaDraft({
      name: currentHome.name || '',
      timezone: currentHome.timezone || 'Asia/Shanghai',
      address: currentHome.address || '',
    });
  }, [selectedHome, currentHome?.id, currentHome?.name, currentHome?.timezone, currentHome?.address]);

  useEffect(() => {
    if (!rooms.length) {
      if (selectedRoom) selectRoom(undefined);
      return;
    }

    const roomStillExists = selectedRoom && rooms.some((room) => room.id === selectedRoom);
    if (!roomStillExists) {
      selectRoom(structure?.selectedRoomId || rooms[0]?.id);
    }
  }, [rooms, selectedRoom, selectRoom, structure?.selectedRoomId]);

  const refreshHomeContext = async (homeId: string) => {
    await Promise.all([
      mutate('/api/homes'),
      mutate(`/api/homes/${homeId}/structure`),
      mutate(`/api/homes/${homeId}/rooms`),
      mutate(`/api/homes/${homeId}/devices`),
      mutate(`/api/homes/${homeId}/automations`),
    ]);
  };

  return (
    <div className="space-y-6">
      <section className="surface-panel relative overflow-hidden px-5 py-6 sm:px-6">
        <div className="ambient-orb -left-14 top-8 bg-[oklch(0.73_0.08_214_/_24%)]" />
        <div className="ambient-orb -right-10 bottom-0 bg-[oklch(0.92_0.02_92_/_48%)] [animation-delay:0.4s]" />
        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="section-eyebrow">家庭控制总览</p>
            <h2 className="mt-1 text-2xl font-semibold sm:text-3xl">{heroTitle}</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{heroDescription}</p>
          </div>
          <div className="flex w-full flex-col gap-3 xl:w-auto xl:items-end">
            <div className="grid gap-2 sm:grid-cols-2 xl:w-[360px]">
              <div className="inset-panel rounded-[1rem] p-3">
                <div className="text-xs text-muted-foreground">当前房间</div>
                <div className="mt-1 text-sm font-semibold">{roomSummary}</div>
              </div>
              <div className="inset-panel rounded-[1rem] p-3">
                <div className="text-xs text-muted-foreground">在线设备</div>
                <div className="mt-1 text-sm font-semibold">{currentHome?.onlineDevicesCount ?? 0} 台</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/automations">
                <Button size="sm" variant="outline">管理自动化</Button>
              </Link>
              <Link to="/chat">
                <Button size="sm" variant="outline">进入对话助手</Button>
              </Link>
              <Link to="/observability">
                <Button size="sm">查看观测面板</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Card className="surface-panel">
            <CardHeader className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">家庭列表</div>
                <div className="mt-1 text-xs text-muted-foreground">从这里切换当前正在管理的空间。</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setCreateHomeOpen((open) => !open)}>
                {createHomeOpen ? '收起' : '新建'}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {homes.length === 0 ? <Alert className="text-xs">先创建一个家庭，后续房间和设备都会归到这个边界里。</Alert> : null}
              {homes.map((home) => (
                <HomeCard
                  key={home.id}
                  home={home}
                  active={selectedHome === home.id}
                  onClick={() => selectHome(home.id)}
                />
              ))}

              {createHomeOpen ? (
                <div className="inset-panel rounded-[1.15rem] p-4">
                  <div className="space-y-2">
                    <Input
                      placeholder="家庭名称"
                      value={homeDraft.name}
                      onChange={(e) => setHomeDraft((draft) => ({ ...draft, name: e.target.value }))}
                    />
                    <Input
                      placeholder="时区"
                      value={homeDraft.timezone}
                      onChange={(e) => setHomeDraft((draft) => ({ ...draft, timezone: e.target.value }))}
                    />
                    <Input
                      placeholder="地址（可选）"
                      value={homeDraft.address}
                      onChange={(e) => setHomeDraft((draft) => ({ ...draft, address: e.target.value }))}
                    />
                    <Button
                      className="w-full"
                      disabled={!homeDraft.name.trim()}
                      onClick={async () => {
                        const created = await api.createHome(
                          {
                            name: homeDraft.name.trim(),
                            timezone: homeDraft.timezone.trim() || 'Asia/Shanghai',
                            address: homeDraft.address.trim() || undefined,
                            ownerId: user?.id,
                          },
                          token,
                        );
                        setHomeDraft({ name: '', timezone: 'Asia/Shanghai', address: '' });
                        setCreateHomeOpen(false);
                        await mutate('/api/homes');
                        selectHome(created.id);
                      }}
                    >
                      创建家庭
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="surface-panel">
            <CardHeader className="text-sm font-semibold">开始前先做这三步</CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>1. 先创建家庭，确认这是你当前要管理的真实空间。</p>
              <p>2. 再把房间按实际使用场景拆开，例如客厅、主卧、书房。</p>
              <p>3. 最后在对应房间里预注册设备，命令和自动化才会自然落位。</p>
            </CardContent>
          </Card>
        </aside>

        <div className="space-y-5">
          {currentHome ? (
            <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
              <div className="surface-panel relative overflow-hidden p-5 sm:p-6">
                <div className="flex flex-col gap-5">
                  <div>
                    <p className="section-eyebrow">当前家庭</p>
                    <h3 className="mt-1 text-2xl font-semibold">{currentHome.name}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      当前家庭是所有房间、设备、自动化和对话上下文的根节点。
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricTile label="房间" value={String(currentHome.roomsCount ?? rooms.length)} hint="当前家庭的空间数量" />
                    <MetricTile label="设备" value={String(currentHome.devicesCount ?? 0)} hint="已归属到房间的设备" />
                    <MetricTile label="在线" value={String(currentHome.onlineDevicesCount ?? 0)} hint="最近仍在线的设备" />
                    <MetricTile label="自动化" value={`${enabledAutomations}/${automations.length || 0}`} hint="已启用规则 / 全部规则" />
                  </div>
                </div>
              </div>

              <Card className="surface-panel">
                <CardHeader>
                  <div className="text-sm font-semibold">家庭信息</div>
                  <div className="mt-1 text-xs text-muted-foreground">把常改字段放在这里，就近维护。</div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    placeholder="家庭名称"
                    value={homeMetaDraft.name}
                    onChange={(e) => setHomeMetaDraft((draft) => ({ ...draft, name: e.target.value }))}
                  />
                  <Input
                    placeholder="时区"
                    value={homeMetaDraft.timezone}
                    onChange={(e) => setHomeMetaDraft((draft) => ({ ...draft, timezone: e.target.value }))}
                  />
                  <Input
                    placeholder="地址（可选）"
                    value={homeMetaDraft.address}
                    onChange={(e) => setHomeMetaDraft((draft) => ({ ...draft, address: e.target.value }))}
                  />
                  <Button
                    disabled={!homeMetaDraft.name.trim()}
                    onClick={async () => {
                      await api.updateHome(
                        currentHome.id,
                        {
                          name: homeMetaDraft.name.trim(),
                          timezone: homeMetaDraft.timezone.trim() || undefined,
                          address: homeMetaDraft.address.trim() || undefined,
                        },
                        token,
                      );
                      await refreshHomeContext(currentHome.id);
                    }}
                  >
                    保存家庭信息
                  </Button>
                </CardContent>
              </Card>
            </section>
          ) : (
            <Alert>还没有可用家庭。先在左侧创建一个家庭，再继续布置房间和设备。</Alert>
          )}

          <div className="grid gap-5 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)]">
            <Card className="surface-panel">
              <CardHeader className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">房间管理</div>
                  <div className="mt-1 text-xs text-muted-foreground">房间是设备归档和命令上下文的直接载体。</div>
                </div>
                {selectedHome ? (
                  <Button size="sm" variant="outline" onClick={() => setCreateRoomOpen((open) => !open)}>
                    {createRoomOpen ? '收起' : '添加房间'}
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-3">
                {!selectedHome ? <Alert className="text-xs">先选择一个家庭，房间才能归到正确的边界里。</Alert> : null}

                {createRoomOpen && selectedHome ? (
                  <div className="inset-panel rounded-[1.15rem] p-4">
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Input
                        placeholder="房间名称"
                        value={roomDraft.name}
                        onChange={(e) => setRoomDraft((draft) => ({ ...draft, name: e.target.value }))}
                      />
                      <Input
                        placeholder="楼层"
                        value={roomDraft.floor}
                        onChange={(e) => setRoomDraft((draft) => ({ ...draft, floor: e.target.value }))}
                      />
                      <Input
                        placeholder="类型"
                        value={roomDraft.type}
                        onChange={(e) => setRoomDraft((draft) => ({ ...draft, type: e.target.value }))}
                      />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        disabled={!roomDraft.name.trim()}
                        onClick={async () => {
                          const room = await api.createRoom(
                            selectedHome,
                            {
                              name: roomDraft.name.trim(),
                              floor: roomDraft.floor.trim() || undefined,
                              type: roomDraft.type.trim() || undefined,
                            },
                            token,
                          );
                          setRoomDraft({ name: '', floor: '', type: '' });
                          setCreateRoomOpen(false);
                          await refreshHomeContext(selectedHome);
                          selectRoom(room.id);
                        }}
                      >
                        创建房间
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setCreateRoomOpen(false)}>
                        取消
                      </Button>
                    </div>
                  </div>
                ) : null}

                {rooms.length === 0 && selectedHome ? <Alert className="text-xs">这个家庭还没有房间，先添加一个空间再放设备。</Alert> : null}

                <div className="space-y-3">
                  {rooms.map((room) => (
                    <RoomCard
                      key={room.id}
                      room={room}
                      active={currentRoom?.id === room.id}
                      editing={editingRoomId === room.id}
                      draft={editingRoomId === room.id ? roomEditDraft : { name: room.name, floor: room.floor || '', type: room.type || '' }}
                      onSelect={() => selectRoom(room.id)}
                      onDraftChange={(field, value) => setRoomEditDraft((draft) => ({ ...draft, [field]: value }))}
                      onStartEdit={() => {
                        setEditingRoomId(room.id);
                        setRoomEditDraft({
                          name: room.name,
                          floor: room.floor || '',
                          type: room.type || '',
                        });
                      }}
                      onCancelEdit={() => setEditingRoomId(null)}
                      onSave={async () => {
                        await api.updateRoom(
                          room.id,
                          {
                            name: roomEditDraft.name.trim(),
                            floor: roomEditDraft.floor.trim() || undefined,
                            type: roomEditDraft.type.trim() || undefined,
                          },
                          token,
                        );
                        setEditingRoomId(null);
                        if (selectedHome) {
                          await refreshHomeContext(selectedHome);
                        }
                      }}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="surface-panel">
              <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">当前房间设备</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {currentRoom ? `所有设备和快捷命令都绑定到 ${currentRoom.name}。` : '先选择一个房间，设备操作才有明确上下文。'}
                  </div>
                </div>
                {selectedHome && currentRoom ? (
                  <Button size="sm" variant="outline" onClick={() => setCreateDeviceOpen((open) => !open)}>
                    {createDeviceOpen ? '收起' : '预注册设备'}
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-4">
                {!currentRoom ? <Alert className="text-xs">还没有选中房间。先在左侧创建或选择一个房间。</Alert> : null}

                {createDeviceOpen && selectedHome && currentRoom ? (
                  <div className="inset-panel rounded-[1.15rem] p-4">
                    <div className="text-sm font-semibold">将新设备归入当前房间</div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Input
                        placeholder="设备 ID"
                        value={deviceForm.deviceId}
                        onChange={(e) => setDeviceForm((form) => ({ ...form, deviceId: e.target.value }))}
                      />
                      <Input
                        placeholder="设备名称"
                        value={deviceForm.name}
                        onChange={(e) => setDeviceForm((form) => ({ ...form, name: e.target.value }))}
                      />
                      <Input
                        placeholder="类型（可选）"
                        value={deviceForm.type}
                        onChange={(e) => setDeviceForm((form) => ({ ...form, type: e.target.value }))}
                      />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        disabled={!deviceForm.deviceId.trim() || !deviceForm.name.trim()}
                        onClick={async () => {
                          const res = await api.preRegisterDevice(
                            selectedHome,
                            {
                              roomId: currentRoom.id,
                              deviceId: deviceForm.deviceId.trim(),
                              name: deviceForm.name.trim(),
                              type: deviceForm.type.trim() || undefined,
                              category: 'both',
                            },
                            token,
                          );
                          setDeviceSecret(res.secret);
                          setDeviceForm({ deviceId: '', name: '', type: '' });
                          await refreshHomeContext(selectedHome);
                        }}
                      >
                        预注册
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setCreateDeviceOpen(false)}>
                        取消
                      </Button>
                    </div>
                    {deviceSecret ? <Alert className="mt-3 text-xs">设备密钥：{deviceSecret}</Alert> : null}
                  </div>
                ) : null}

                {currentRoom && currentDevices.length === 0 ? <Alert className="text-xs">这个房间还没有设备，先预注册一台设备开始联调。</Alert> : null}

                {currentRoom && currentDevices.length > 0 ? (
                  <div className="grid gap-3 xl:grid-cols-2">
                    {currentDevices.map((device) => (
                      <DevicePanel
                        key={device.deviceId}
                        device={device}
                        onSendCommand={(deviceId, method, params, roomId) => sendCommand(deviceId, method, params, roomId)}
                      />
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/',
  component: Dashboard,
});
