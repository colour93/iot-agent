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
import type { Device, Room } from '../lib/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Pencil, Plus, Trash2 } from 'lucide-react';

type DeviceCategory = 'sensor' | 'actuator' | 'both';

type DeviceDraft = {
  deviceId?: string;
  name: string;
  type: string;
  category: DeviceCategory;
  roomId: string;
};

const nativeSelectClassName =
  'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/70';

function MetricTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="surface-panel relative overflow-hidden p-4">
      <div className="text-[0.72rem] tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}

function RoomTabs({
  rooms,
  currentRoomId,
  onSelect,
  onEdit,
  onDelete,
}: {
  rooms: Room[];
  currentRoomId?: string;
  onSelect: (room: Room) => void;
  onEdit: (room: Room) => void;
  onDelete: (room: Room) => void;
}) {
  return (
    <div className="overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="inline-flex min-w-full gap-2 rounded-[1rem] border border-border/70 bg-muted/40 p-1.5">
        {rooms.map((room) => {
          const active = room.id === currentRoomId;
          return (
            <div
              key={room.id}
              className={`flex min-w-[168px] items-start gap-2 rounded-[0.75rem] px-2 py-2 text-left text-xs transition-all ${
                active
                  ? 'border border-primary/25 bg-card text-foreground shadow-[0_12px_26px_-22px_oklch(0.29_0.08_220_/_34%)]'
                  : 'border border-transparent text-muted-foreground hover:border-primary/12 hover:bg-card/70 hover:text-foreground'
              }`}
            >
              <button type="button" onClick={() => onSelect(room)} className="min-w-0 flex-1 px-1 text-left">
                <div className="truncate font-semibold">{room.name}</div>
                <div className="mt-1 flex items-center gap-2 text-[11px]">
                  <span>{room.devicesCount ?? 0} 设备</span>
                  <span>{room.onlineDevicesCount ?? 0} 在线</span>
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/70 bg-background/70 text-muted-foreground transition-colors hover:border-primary/18 hover:text-foreground"
                  title={`编辑 ${room.name}`}
                  onClick={() => onEdit(room)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border/70 bg-background/70 text-muted-foreground transition-colors hover:border-destructive/35 hover:text-destructive"
                  title={`删除 ${room.name}`}
                  onClick={() => onDelete(room)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DevicePanel({
  device,
  onEdit,
  onDelete,
  onSendCommand,
}: {
  device: Device;
  onEdit: (device: Device) => void;
  onDelete: (deviceId: string) => Promise<void>;
  onSendCommand: (deviceId: string, method: string, params: Record<string, unknown>, roomId: string) => Promise<void>;
}) {
  const [deleteArmed, setDeleteArmed] = useState(false);

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
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">category:{device.category || 'both'}</span>
        {(device.capabilities || []).slice(0, 4).map((cap) => (
          <span key={`${device.deviceId}-${cap.kind}-${cap.name}`} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
            {cap.kind}:{cap.name}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => onEdit(device)}>
          编辑设备
        </Button>
        <Button
          size="sm"
          variant={deleteArmed ? 'secondary' : 'outline'}
          onClick={async () => {
            if (!deleteArmed) {
              setDeleteArmed(true);
              return;
            }
            await onDelete(device.deviceId);
            setDeleteArmed(false);
          }}
        >
          {deleteArmed ? '确认删除' : '删除设备'}
        </Button>
      </div>
      {deleteArmed ? <Alert variant="destructive" className="mt-3 text-xs">再点一次确认删除设备。</Alert> : null}

      <form
        className="mt-3 space-y-2"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
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

function SetupStep({
  index,
  title,
  description,
  done,
  actionLabel,
  onAction,
}: {
  index: number;
  title: string;
  description: string;
  done: boolean;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div
      className={`inset-panel rounded-[1rem] p-3 transition-colors ${
        done ? 'border-emerald-200/70 bg-emerald-50/70' : 'border-border/65'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
              done ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-foreground'
            }`}
          >
            {index}
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <span className={`data-pill whitespace-nowrap ${done ? 'status-live' : ''}`}>{done ? '已完成' : '待完成'}</span>
      </div>
      {!done ? (
        <Button size="sm" variant="outline" className="mt-3" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

function QuickStartCard({
  hasHome,
  hasRoom,
  hasDevice,
  onCreateHome,
  onCreateRoom,
  onPreRegisterDevice,
}: {
  hasHome: boolean;
  hasRoom: boolean;
  hasDevice: boolean;
  onCreateHome: () => void;
  onCreateRoom: () => void;
  onPreRegisterDevice: () => void;
}) {
  const completedCount = Number(hasHome) + Number(hasRoom) + Number(hasDevice);
  const progress = `${Math.round((completedCount / 3) * 100)}%`;

  return (
    <Card className="surface-panel relative overflow-hidden">
      <div className="ambient-orb -right-10 -top-8 bg-[oklch(0.78_0.08_220_/_20%)]" />
      <CardHeader className="relative space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">快速开始</p>
            <p className="mt-1 text-xs text-muted-foreground">完成这 3 步后，设备控制和自动化会更顺畅。</p>
          </div>
          <span className="data-pill">{completedCount}/3</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: progress }} />
        </div>
      </CardHeader>
      <CardContent className="relative space-y-2.5">
        <SetupStep
          index={1}
          title="创建家庭"
          description="先确认你当前要管理的真实空间。"
          done={hasHome}
          actionLabel="新建家庭"
          onAction={onCreateHome}
        />
        <SetupStep
          index={2}
          title="添加房间"
          description="按实际场景拆分，例如客厅、主卧、书房。"
          done={hasRoom}
          actionLabel="添加房间"
          onAction={onCreateRoom}
        />
        <SetupStep
          index={3}
          title="预注册设备"
          description="把设备归到房间，命令和自动化才能精准落位。"
          done={hasDevice}
          actionLabel="预注册设备"
          onAction={onPreRegisterDevice}
        />
      </CardContent>
    </Card>
  );
}

function EmptyRoomsPlaceholder({ onCreateRoom }: { onCreateRoom: () => void }) {
  return (
    <section className="surface-panel relative overflow-hidden px-8 py-12 text-center sm:px-12 sm:py-16">
      <div className="ambient-orb -left-10 top-2 bg-[oklch(0.74_0.07_218_/_20%)]" />
      <div className="ambient-orb -right-10 bottom-0 bg-[oklch(0.92_0.02_92_/_40%)] [animation-delay:0.5s]" />
      <div className="relative mx-auto max-w-xl">
        <p className="section-eyebrow">房间为空</p>
        <h3 className="mt-2 text-2xl font-semibold">当前家庭还没有房间</h3>
        <p className="mt-3 text-sm text-muted-foreground">
          先创建一个房间，再添加设备和自动化。这里不会再显示示例房间内容。
        </p>
        <Button className="mt-6" onClick={onCreateRoom}>
          立即创建第一个房间
        </Button>
      </div>
    </section>
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
  const [editHomeOpen, setEditHomeOpen] = useState(false);
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [editRoomOpen, setEditRoomOpen] = useState(false);
  const [createDeviceOpen, setCreateDeviceOpen] = useState(false);
  const [editDeviceOpen, setEditDeviceOpen] = useState(false);

  const [createHomeDraft, setCreateHomeDraft] = useState({ name: '', timezone: 'Asia/Shanghai', address: '' });
  const [editHomeDraft, setEditHomeDraft] = useState({ name: '', timezone: 'Asia/Shanghai', address: '' });
  const [createRoomDraft, setCreateRoomDraft] = useState({ name: '', floor: '', type: '' });
  const [editRoomDraft, setEditRoomDraft] = useState({ name: '', floor: '', type: '' });
  const [createDeviceDraft, setCreateDeviceDraft] = useState<DeviceDraft>({
    deviceId: '',
    name: '',
    type: '',
    category: 'both',
    roomId: '',
  });
  const [editDeviceDraft, setEditDeviceDraft] = useState<DeviceDraft>({
    name: '',
    type: '',
    category: 'both',
    roomId: '',
  });
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [deviceSecret, setDeviceSecret] = useState('');

  const { data: homes = [] } = useHomes();
  const { data: structure } = useHomeStructure(selectedHome);
  const { data: automations = [] } = useAutomations(selectedHome);

  const currentHome = structure?.home || homes.find((home) => home.id === selectedHome);
  const rooms = useMemo(() => structure?.rooms ?? [], [structure?.rooms]);
  const currentRoom = useMemo(() => rooms.find((room) => room.id === selectedRoom) ?? rooms[0], [rooms, selectedRoom]);
  const currentDevices = useMemo(() => currentRoom?.devices ?? [], [currentRoom?.devices]);
  const editingDevice = useMemo(
    () => currentDevices.find((device) => device.deviceId === editingDeviceId) ?? null,
    [currentDevices, editingDeviceId],
  );

  const roomCount = currentHome?.roomsCount ?? rooms.length;
  const deviceCount = currentHome?.devicesCount ?? 0;
  const hasHome = homes.length > 0;
  const hasRoom = roomCount > 0;
  const hasDevice = deviceCount > 0;

  const enabledAutomations = useMemo(
    () => automations.filter((automation) => automation.enabled).length,
    [automations],
  );
  const heroTitle = currentHome
    ? `继续管理 ${currentHome.name} 的空间与设备`
    : '先创建一个家庭，开始整理你的空间与设备';
  const heroDescription = currentHome
    ? currentRoom
      ? `当前聚焦 ${currentRoom.name}。`
      : '先创建房间，再继续查看设备状态、下发命令和整理自动化。'
    : '创建家庭后，就能按房间归置设备，让命令、自动化和对话都落在明确的空间上下文里。';
  const roomSummary = currentRoom?.name || (rooms.length ? '请选择房间' : '暂无房间');

  useEffect(() => {
    if (!homes.length) {
      if (selectedHome) {
        selectHome(undefined);
      }
      return;
    }

    if (!selectedHome || !homes.some((home) => home.id === selectedHome)) {
      selectHome(homes[0].id);
    }
  }, [homes, selectedHome, selectHome]);

  useEffect(() => {
    if (!selectedHome || !rooms.length) {
      if (selectedRoom) {
        selectRoom(undefined);
      }
      return;
    }

    if (!selectedRoom || !rooms.some((room) => room.id === selectedRoom)) {
      selectRoom(rooms[0].id);
    }
  }, [selectedHome, rooms, selectedRoom, selectRoom]);

  const refreshHomeContext = async (homeId: string) => {
    await Promise.all([
      mutate('/api/homes'),
      mutate(`/api/homes/${homeId}/structure`),
      mutate(`/api/homes/${homeId}/rooms`),
      mutate(`/api/homes/${homeId}/devices`),
      mutate(`/api/homes/${homeId}/automations`),
    ]);
  };

  const openCreateHomeModal = () => {
    setCreateHomeDraft({ name: '', timezone: 'Asia/Shanghai', address: '' });
    setCreateHomeOpen(true);
  };

  const openEditHomeModal = () => {
    if (!currentHome) return;
    setEditHomeDraft({
      name: currentHome.name || '',
      timezone: currentHome.timezone || 'Asia/Shanghai',
      address: currentHome.address || '',
    });
    setEditHomeOpen(true);
  };

  const openCreateRoomModal = () => {
    if (!selectedHome) {
      openCreateHomeModal();
      return;
    }
    setCreateRoomDraft({ name: '', floor: '', type: '' });
    setCreateRoomOpen(true);
  };

  const openEditRoomModal = (room?: Room) => {
    const targetRoom = room ?? currentRoom;
    if (!targetRoom) return;
    setEditRoomDraft({
      name: targetRoom.name,
      floor: targetRoom.floor || '',
      type: targetRoom.type || '',
    });
    setEditRoomOpen(true);
  };

  const openCreateDeviceModal = () => {
    if (!selectedHome) {
      openCreateHomeModal();
      return;
    }
    if (!rooms.length) {
      openCreateRoomModal();
      return;
    }
    const roomId = currentRoom?.id || rooms[0].id;
    setCreateDeviceDraft({
      deviceId: '',
      name: '',
      type: '',
      category: 'both',
      roomId,
    });
    setDeviceSecret('');
    setCreateDeviceOpen(true);
  };

  const openEditDeviceModal = (device: Device) => {
    setEditingDeviceId(device.deviceId);
    setEditDeviceDraft({
      name: device.name,
      type: device.type || '',
      category: device.category || 'both',
      roomId: device.roomId,
    });
    setEditDeviceOpen(true);
  };

  return (
    <>
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
                  <Button size="sm" variant="outline">
                    管理自动化
                  </Button>
                </Link>
                <Link to="/chat">
                  <Button size="sm" variant="outline">
                    进入对话助手
                  </Button>
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
              <CardHeader className="space-y-1.5">
                <div className="text-sm font-semibold">家庭选择</div>
                <div className="text-xs text-muted-foreground">下拉切换当前家庭，操作记录会保存在本地。</div>
              </CardHeader>
              <CardContent className="space-y-3">
                {homes.length > 0 ? (
                  <>
                    <Select
                      value={selectedHome}
                      onValueChange={(homeId) => {
                        selectHome(homeId);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="请选择家庭" />
                      </SelectTrigger>
                      <SelectContent>
                        {homes.map((home) => (
                          <SelectItem key={home.id} value={home.id}>
                            {home.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {currentHome ? (
                      <div className="inset-panel rounded-[1rem] p-3 text-xs">
                        <div className="text-sm font-semibold text-foreground">{currentHome.name}</div>
                        <div className="mt-1 text-muted-foreground">时区：{currentHome.timezone || 'Asia/Shanghai'}</div>
                        <div className="mt-1 text-muted-foreground">地址：{currentHome.address || '-'}</div>
                        <div className="mt-2 flex items-center gap-2 text-muted-foreground">
                          <span>{currentHome.roomsCount ?? 0} 房间</span>
                          <span>{currentHome.devicesCount ?? 0} 设备</span>
                          <span>{currentHome.onlineDevicesCount ?? 0} 在线</span>
                        </div>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" onClick={openCreateHomeModal}>
                        <Plus className="mr-1 h-4 w-4" />
                        新建
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 px-0"
                        disabled={!currentHome}
                        onClick={openEditHomeModal}
                        title="编辑家庭"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 px-0 text-destructive hover:text-destructive"
                        disabled={!currentHome}
                        title="删除家庭"
                        onClick={async () => {
                          if (!currentHome) return;
                          if (!window.confirm(`确认删除家庭「${currentHome.name}」吗？房间与设备会一并删除。`)) return;

                          await api.deleteHome(currentHome.id, token);
                          const refreshedHomes = await api.listHomes(token);
                          await mutate('/api/homes', refreshedHomes, false);
                          await mutate(`/api/homes/${currentHome.id}/structure`, null, false);

                          if (!refreshedHomes.length) {
                            selectHome(undefined);
                            selectRoom(undefined);
                            return;
                          }

                          selectHome(refreshedHomes[0].id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <Alert className="text-xs">还没有家庭。先创建一个家庭开始管理。</Alert>
                    <Button size="sm" onClick={openCreateHomeModal}>
                      新建家庭
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            <QuickStartCard
              hasHome={hasHome}
              hasRoom={hasRoom}
              hasDevice={hasDevice}
              onCreateHome={openCreateHomeModal}
              onCreateRoom={openCreateRoomModal}
              onPreRegisterDevice={openCreateDeviceModal}
            />
          </aside>

          <div className="space-y-5">
            {currentHome ? (
              <section>
                <div className="surface-panel relative overflow-hidden p-5 sm:p-6">
                  <div className="flex flex-col gap-5">
                    <div>
                      <p className="section-eyebrow">当前家庭</p>
                      <h3 className="mt-1 text-2xl font-semibold">{currentHome.name}</h3>
                      <p className="mt-2 text-sm text-muted-foreground">家庭是房间、设备、自动化和对话上下文的根节点。</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <MetricTile label="房间" value={String(currentHome.roomsCount ?? rooms.length)} hint="当前家庭的空间数量" />
                      <MetricTile label="设备" value={String(currentHome.devicesCount ?? 0)} hint="已归属到房间的设备" />
                      <MetricTile label="在线" value={String(currentHome.onlineDevicesCount ?? 0)} hint="最近仍在线的设备" />
                      <MetricTile
                        label="自动化"
                        value={`${enabledAutomations}/${automations.length || 0}`}
                        hint="已启用规则 / 全部规则"
                      />
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              <Alert>还没有可用家庭。先创建一个家庭，再继续布置房间和设备。</Alert>
            )}

            {currentHome ? (
              rooms.length === 0 ? (
                <EmptyRoomsPlaceholder onCreateRoom={openCreateRoomModal} />
              ) : (
                <div className="grid gap-5 2xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)]">
                  <Card className="surface-panel">
                    <CardHeader className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">房间管理</div>
                        <div className="mt-1 text-xs text-muted-foreground">默认自动选中第一个房间，编辑在弹窗中进行。</div>
                      </div>
                      <Button size="sm" variant="outline" onClick={openCreateRoomModal}>
                        添加房间
                      </Button>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <RoomTabs
                        rooms={rooms}
                        currentRoomId={currentRoom?.id}
                        onSelect={(room) => selectRoom(room.id)}
                        onEdit={(room) => {
                          selectRoom(room.id);
                          openEditRoomModal(room);
                        }}
                        onDelete={(room) => {
                          if (!currentHome) return;
                          if (!window.confirm(`确认删除房间「${room.name}」吗？该房间下设备会一并删除。`)) return;
                          void (async () => {
                            await api.deleteRoom(room.id, token);
                            await refreshHomeContext(currentHome.id);
                          })();
                        }}
                      />

                      {currentRoom ? (
                        <div className="inset-panel rounded-[1rem] p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="text-sm font-semibold">{currentRoom.name}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {currentRoom.devicesCount ?? 0} 台设备 · {currentRoom.onlineDevicesCount ?? 0} 台在线
                              </div>
                            </div>
                            <span className="data-pill">当前 Tab</span>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">房间编辑与删除入口已并入 Tab 右侧图标按钮。</p>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>

                  <Card className="surface-panel">
                    <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">当前房间设备</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {currentRoom ? `所有设备和命令都绑定到 ${currentRoom.name}。` : '先选择一个房间。'}
                        </div>
                      </div>
                      {currentRoom ? (
                        <Button size="sm" variant="outline" onClick={openCreateDeviceModal}>
                          预注册设备
                        </Button>
                      ) : null}
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {!currentRoom ? <Alert className="text-xs">还没有选中房间。</Alert> : null}
                      {currentRoom && currentDevices.length === 0 ? (
                        <Alert className="text-xs">这个房间还没有设备，点击“预注册设备”开始联调。</Alert>
                      ) : null}
                      {currentRoom && currentDevices.length > 0 ? (
                        <div className="grid gap-3 xl:grid-cols-2">
                          {currentDevices.map((device) => (
                            <DevicePanel
                              key={`${device.deviceId}:${device.roomId}:${device.name}:${device.type || ''}:${device.category || 'both'}`}
                              device={device}
                              onEdit={openEditDeviceModal}
                              onDelete={async (deviceId) => {
                                await api.deleteDevice(deviceId, token);
                                await refreshHomeContext(currentHome.id);
                              }}
                              onSendCommand={(deviceId, method, params, roomId) => sendCommand(deviceId, method, params, roomId)}
                            />
                          ))}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              )
            ) : null}
          </div>
        </div>
      </div>

      <Dialog open={createHomeOpen} onOpenChange={setCreateHomeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建家庭</DialogTitle>
            <DialogDescription>创建一个新的家庭空间作为管理边界。</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const created = await api.createHome(
                {
                  name: createHomeDraft.name.trim(),
                  timezone: createHomeDraft.timezone.trim() || 'Asia/Shanghai',
                  address: createHomeDraft.address.trim() || undefined,
                  ownerId: user?.id,
                },
                token,
              );
              await mutate('/api/homes');
              setCreateHomeOpen(false);
              selectHome(created.id);
            }}
          >
            <Input
              placeholder="家庭名称"
              value={createHomeDraft.name}
              onChange={(event) => setCreateHomeDraft((draft) => ({ ...draft, name: event.target.value }))}
            />
            <Input
              placeholder="时区"
              value={createHomeDraft.timezone}
              onChange={(event) => setCreateHomeDraft((draft) => ({ ...draft, timezone: event.target.value }))}
            />
            <Input
              placeholder="地址（可选）"
              value={createHomeDraft.address}
              onChange={(event) => setCreateHomeDraft((draft) => ({ ...draft, address: event.target.value }))}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateHomeOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={!createHomeDraft.name.trim()}>
                创建家庭
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editHomeOpen} onOpenChange={setEditHomeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑家庭</DialogTitle>
            <DialogDescription>更新家庭基础信息。</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!currentHome) return;
              await api.updateHome(
                currentHome.id,
                {
                  name: editHomeDraft.name.trim(),
                  timezone: editHomeDraft.timezone.trim() || undefined,
                  address: editHomeDraft.address.trim() || undefined,
                },
                token,
              );
              await refreshHomeContext(currentHome.id);
              setEditHomeOpen(false);
            }}
          >
            <Input
              placeholder="家庭名称"
              value={editHomeDraft.name}
              onChange={(event) => setEditHomeDraft((draft) => ({ ...draft, name: event.target.value }))}
            />
            <Input
              placeholder="时区"
              value={editHomeDraft.timezone}
              onChange={(event) => setEditHomeDraft((draft) => ({ ...draft, timezone: event.target.value }))}
            />
            <Input
              placeholder="地址（可选）"
              value={editHomeDraft.address}
              onChange={(event) => setEditHomeDraft((draft) => ({ ...draft, address: event.target.value }))}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditHomeOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={!editHomeDraft.name.trim()}>
                保存修改
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={createRoomOpen} onOpenChange={setCreateRoomOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建房间</DialogTitle>
            <DialogDescription>给当前家庭创建一个新的房间节点。</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!selectedHome) return;
              const room = await api.createRoom(
                selectedHome,
                {
                  name: createRoomDraft.name.trim(),
                  floor: createRoomDraft.floor.trim() || undefined,
                  type: createRoomDraft.type.trim() || undefined,
                },
                token,
              );
              await refreshHomeContext(selectedHome);
              setCreateRoomOpen(false);
              selectRoom(room.id);
            }}
          >
            <Input
              placeholder="房间名称"
              value={createRoomDraft.name}
              onChange={(event) => setCreateRoomDraft((draft) => ({ ...draft, name: event.target.value }))}
            />
            <Input
              placeholder="楼层（可选）"
              value={createRoomDraft.floor}
              onChange={(event) => setCreateRoomDraft((draft) => ({ ...draft, floor: event.target.value }))}
            />
            <Input
              placeholder="类型（可选）"
              value={createRoomDraft.type}
              onChange={(event) => setCreateRoomDraft((draft) => ({ ...draft, type: event.target.value }))}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateRoomOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={!createRoomDraft.name.trim()}>
                创建房间
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={editRoomOpen} onOpenChange={setEditRoomOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑房间</DialogTitle>
            <DialogDescription>修改当前房间的显示信息。</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!currentRoom || !currentHome) return;
              await api.updateRoom(
                currentRoom.id,
                {
                  name: editRoomDraft.name.trim(),
                  floor: editRoomDraft.floor.trim() || undefined,
                  type: editRoomDraft.type.trim() || undefined,
                },
                token,
              );
              await refreshHomeContext(currentHome.id);
              setEditRoomOpen(false);
            }}
          >
            <Input
              placeholder="房间名称"
              value={editRoomDraft.name}
              onChange={(event) => setEditRoomDraft((draft) => ({ ...draft, name: event.target.value }))}
            />
            <Input
              placeholder="楼层（可选）"
              value={editRoomDraft.floor}
              onChange={(event) => setEditRoomDraft((draft) => ({ ...draft, floor: event.target.value }))}
            />
            <Input
              placeholder="类型（可选）"
              value={editRoomDraft.type}
              onChange={(event) => setEditRoomDraft((draft) => ({ ...draft, type: event.target.value }))}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditRoomOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={!editRoomDraft.name.trim()}>
                保存修改
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={createDeviceOpen} onOpenChange={setCreateDeviceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>预注册设备</DialogTitle>
            <DialogDescription>新设备创建统一在弹窗中完成。</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!selectedHome) return;
              const result = await api.preRegisterDevice(
                selectedHome,
                {
                  roomId: createDeviceDraft.roomId,
                  deviceId: (createDeviceDraft.deviceId || '').trim(),
                  name: createDeviceDraft.name.trim(),
                  type: createDeviceDraft.type.trim() || undefined,
                  category: createDeviceDraft.category,
                },
                token,
              );
              await refreshHomeContext(selectedHome);
              setDeviceSecret(result.secret);
              setCreateDeviceDraft((draft) => ({ ...draft, deviceId: '', name: '', type: '' }));
            }}
          >
            <Input
              placeholder="设备 ID"
              value={createDeviceDraft.deviceId || ''}
              onChange={(event) => setCreateDeviceDraft((draft) => ({ ...draft, deviceId: event.target.value }))}
            />
            <Input
              placeholder="设备名称"
              value={createDeviceDraft.name}
              onChange={(event) => setCreateDeviceDraft((draft) => ({ ...draft, name: event.target.value }))}
            />
            <Input
              placeholder="设备类型（可选）"
              value={createDeviceDraft.type}
              onChange={(event) => setCreateDeviceDraft((draft) => ({ ...draft, type: event.target.value }))}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                className={nativeSelectClassName}
                value={createDeviceDraft.category}
                onChange={(event) =>
                  setCreateDeviceDraft((draft) => ({ ...draft, category: event.target.value as DeviceCategory }))
                }
              >
                <option value="both">both</option>
                <option value="sensor">sensor</option>
                <option value="actuator">actuator</option>
              </select>
              <select
                className={nativeSelectClassName}
                value={createDeviceDraft.roomId}
                onChange={(event) => setCreateDeviceDraft((draft) => ({ ...draft, roomId: event.target.value }))}
              >
                {rooms.map((room) => (
                  <option key={`create-device-room-${room.id}`} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </div>
            {deviceSecret ? <Alert className="text-xs">设备密钥：{deviceSecret}</Alert> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateDeviceOpen(false)}>
                关闭
              </Button>
              <Button type="submit" disabled={!createDeviceDraft.deviceId?.trim() || !createDeviceDraft.name.trim()}>
                预注册设备
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editDeviceOpen}
        onOpenChange={(open) => {
          setEditDeviceOpen(open);
          if (!open) setEditingDeviceId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑设备</DialogTitle>
            <DialogDescription>修改设备名称、类型、分类或房间归属。</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!editingDevice || !selectedHome) return;
              await api.updateDevice(
                editingDevice.deviceId,
                {
                  homeId: selectedHome,
                  roomId: editDeviceDraft.roomId,
                  name: editDeviceDraft.name.trim(),
                  type: editDeviceDraft.type.trim() || undefined,
                  category: editDeviceDraft.category,
                },
                token,
              );
              await refreshHomeContext(selectedHome);
              setEditDeviceOpen(false);
              setEditingDeviceId(null);
            }}
          >
            <Input
              placeholder="设备名称"
              value={editDeviceDraft.name}
              onChange={(event) => setEditDeviceDraft((draft) => ({ ...draft, name: event.target.value }))}
            />
            <Input
              placeholder="设备类型（可选）"
              value={editDeviceDraft.type}
              onChange={(event) => setEditDeviceDraft((draft) => ({ ...draft, type: event.target.value }))}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                className={nativeSelectClassName}
                value={editDeviceDraft.category}
                onChange={(event) =>
                  setEditDeviceDraft((draft) => ({ ...draft, category: event.target.value as DeviceCategory }))
                }
              >
                <option value="both">both</option>
                <option value="sensor">sensor</option>
                <option value="actuator">actuator</option>
              </select>
              <select
                className={nativeSelectClassName}
                value={editDeviceDraft.roomId}
                onChange={(event) => setEditDeviceDraft((draft) => ({ ...draft, roomId: event.target.value }))}
              >
                {rooms.map((room) => (
                  <option key={`edit-device-room-${room.id}`} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditDeviceOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={!editDeviceDraft.name.trim()}>
                保存修改
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/',
  component: Dashboard,
});
