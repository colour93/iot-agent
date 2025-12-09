import { createRoute, Link } from '@tanstack/react-router';
import { Route as RootRoute } from './__root';
import { useAppStore } from '../lib/store';
import { useHomes, useRooms, useDevices } from '../lib/swr-hooks';
import { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Table, THead, TBody, TR, TH, TD } from '../components/ui/table';
import { Alert } from '../components/ui/alert';
import { api } from '../lib/api';
import { mutate } from 'swr';

function HomeSelector() {
  const { data: homes = [] } = useHomes();
  const selectedHome = useAppStore((s) => s.selectedHome);
  const selectHome = useAppStore((s) => s.selectHome);

  useEffect(() => {
    if (!selectedHome && homes.length) selectHome(homes[0].id);
  }, [homes, selectedHome, selectHome]);

  return (
    <select
      className="rounded border px-2 py-1 text-sm"
      value={selectedHome || ''}
      onChange={(e) => selectHome(e.target.value)}
    >
      {homes.map((h) => (
        <option key={h.id} value={h.id}>
          {h.name}
        </option>
      ))}
    </select>
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

  useEffect(() => {
    if (!selectedRoom && rooms.length) selectRoom(rooms[0].id);
  }, [rooms, selectedRoom, selectRoom]);

  const hasHome = !!selectedHome;
  const hasRoom = rooms.length > 0;

  const filteredDevices = devices.filter((d) => !selectedRoom || d.roomId === selectedRoom);
  const [showCreateDevice, setShowCreateDevice] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">家庭与房间</div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowCreateHome((v) => !v)}>
            {showCreateHome ? '收起创建' : '创建家庭'}
          </Button>
          {homes.length ? <HomeSelector /> : <Alert className="text-xs">暂无家庭，请先创建</Alert>}
        </div>
      </div>

      {(!homes.length || showCreateHome) && (
        <Card>
          <CardHeader className="text-sm font-semibold">创建家庭</CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
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
          </CardContent>
        </Card>
      )}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex items-center justify-between text-sm font-semibold">
            <span>房间</span>
            {hasHome && (
              <Button size="sm" variant="outline" onClick={() => setShowCreateRoom((v) => !v)}>
                {showCreateRoom ? '收起创建' : '创建房间'}
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {rooms.length === 0 && <div className="text-xs text-gray-500">暂无房间</div>}
            {showCreateRoom || (!rooms.length && hasHome) ? (
              <div className="space-y-2 rounded border p-3">
                <div className="grid grid-cols-3 gap-2">
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
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div className="text-sm font-semibold">自动化快捷</div>
            <Link to="/automations" className="text-xs text-blue-600">
              管理
            </Link>
          </CardHeader>
          <CardContent className="text-xs text-gray-500">可在自动化页启停或新建规则。</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <div className="text-sm font-semibold">设备</div>
          <Link to="/chat" className="text-xs text-blue-600">
            前台对话
          </Link>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold">设备列表</div>
            {hasHome && hasRoom && (
              <Button size="sm" variant="outline" onClick={() => setShowCreateDevice((v) => !v)}>
                {showCreateDevice ? '收起创建' : '预注册设备'}
              </Button>
            )}
          </div>
          {hasHome && hasRoom && showCreateDevice && (
            <div className="space-y-2 rounded border p-3 mb-3 text-xs">
              <div className="text-sm font-semibold text-gray-700">预注册设备</div>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="设备ID" value={deviceForm.deviceId} onChange={(e) => setDeviceForm({ ...deviceForm, deviceId: e.target.value })} />
                <Input placeholder="名称" value={deviceForm.name} onChange={(e) => setDeviceForm({ ...deviceForm, name: e.target.value })} />
                <Input placeholder="类型(可选)" value={deviceForm.type} onChange={(e) => setDeviceForm({ ...deviceForm, type: e.target.value })} />
                <select
                  className="rounded border px-2 py-1 text-sm"
                  value={deviceForm.roomId}
                  onChange={(e) => setDeviceForm({ ...deviceForm, roomId: e.target.value })}
                >
                  <option value="">选择房间</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
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
              {deviceForm.secret && (
                <Alert className="text-xs">设备密钥：{deviceForm.secret}</Alert>
              )}
            </div>
          )}
          {filteredDevices.length === 0 ? (
            <div className="text-xs text-gray-500">暂无设备</div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>设备</TH>
                  <TH>状态</TH>
                  <TH>属性</TH>
                  <TH>下发命令</TH>
                </TR>
              </THead>
              <TBody>
                {filteredDevices.map((d) => (
                  <TR key={d.deviceId}>
                    <TD>
                      <div className="font-semibold">{d.name}</div>
                      <div className="text-xs text-gray-500">{d.deviceId}</div>
                    </TD>
                    <TD className={d.status === 'online' ? 'text-green-600' : 'text-gray-400'}>{d.status}</TD>
                    <TD>
                      <div className="space-y-1 text-xs text-gray-700">
                        {d.attrs &&
                          Object.entries(d.attrs).map(([k, v]) => (
                            <div key={k} className="flex justify-between gap-2">
                              <span>{k}</span>
                              <span>{String(v)}</span>
                            </div>
                          ))}
                      </div>
                    </TD>
                    <TD>
                      <form
                        className="space-y-2"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const form = e.target as HTMLFormElement;
                          const method = (form.elements.namedItem('method') as HTMLInputElement).value;
                          const value = (form.elements.namedItem('value') as HTMLInputElement).value;
                          await sendCommand(d.deviceId, method, { value });
                          form.reset();
                        }}
                      >
                        <Input
                          name="method"
                          placeholder="方法名"
                          defaultValue={d.capabilities?.find((c) => c.kind === 'method')?.name || 'set_led'}
                        />
                        <Input name="value" placeholder="参数值" />
                        <Button type="submit" size="sm" className="w-full">
                          下发
                        </Button>
                      </form>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
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

