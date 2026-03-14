export const defaultDefinition = {
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
        { kind: 'context', path: 'time.hour', op: 'gte', value: 22 },
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
