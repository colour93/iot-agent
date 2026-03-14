import type { AutomationDefinition } from '../../lib/types';

export const defaultDefinition: AutomationDefinition = {
  conditions: [
    {
      kind: 'attr',
      deviceId: 'esp32-demo-1',
      path: 'temperature',
      op: 'gt',
      value: 28,
    },
  ],
  actions: [
    {
      kind: 'command',
      deviceId: 'ac-1',
      method: 'set_ac',
      params: { mode: 'cool', temp: 25 },
    },
  ],
};

export const presetTemplates = [
  {
    name: '客厅温度过高自动降温',
    definition: {
      conditions: [
        {
          kind: 'attr',
          deviceId: 'esp32-demo-1',
          path: 'temperature',
          op: 'gt',
          value: 28,
        },
      ],
      actions: [
        {
          kind: 'command',
          deviceId: 'ac-1',
          method: 'set_ac',
          params: { mode: 'cool', temp: 25 },
        },
      ],
    },
  },
  {
    name: '夜间湿度过低开启加湿',
    definition: {
      conditions: [
        {
          kind: 'attr',
          deviceId: 'esp32-demo-1',
          path: 'humidity',
          op: 'lt',
          value: 40,
        },
      ],
      actions: [
        {
          kind: 'command',
          deviceId: 'humidifier-1',
          method: 'set_humidifier',
          params: { on: true, level: 2 },
        },
      ],
    },
  },
];
