import type { Automation, Device, Home, Room } from './types';

export const mockHomes: Home[] = [{ id: 'home-1', name: '演示家庭', timezone: 'Asia/Shanghai' }];
export const mockRooms: Room[] = [
  { id: 'room-1', homeId: 'home-1', name: '客厅', type: 'living' },
  { id: 'room-2', homeId: 'home-1', name: '卧室', type: 'bedroom' },
];
export const mockDevices: Device[] = [
  {
    deviceId: 'esp32-demo-1',
    homeId: 'home-1',
    roomId: 'room-1',
    name: '温湿度节点',
    status: 'online',
    capabilities: [
      { kind: 'attr', name: 'temperature' },
      { kind: 'attr', name: 'humidity' },
      { kind: 'method', name: 'set_led' },
    ],
    attrs: { temperature: 23.4, humidity: 58 },
  },
];
export const mockAutomations: Automation[] = [
  {
    id: 'auto-1',
    homeId: 'home-1',
    name: '夏天客厅降温',
    enabled: true,
    scope: 'room-1',
    definition: {
      conditions: [{ kind: 'attr', deviceId: 'esp32-demo-1', path: 'temperature', op: 'gt', value: 28 }],
      actions: [{ kind: 'command', deviceId: 'ac-1', method: 'set_ac', params: { mode: 'cool', temp: 25 } }],
    },
  },
];

