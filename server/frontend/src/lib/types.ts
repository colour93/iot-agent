export type DeviceCapability = {
  kind: 'attr' | 'method' | 'event';
  name: string;
  schema?: Record<string, unknown>;
};

export type AutomationCondition =
  | {
      kind: 'attr';
      deviceId: string;
      path: string;
      op: 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
      value: number | string | boolean;
    }
  | {
      kind: 'event';
      deviceId: string;
      eventType: string;
    }
  | {
      kind: 'time';
      cron: string;
    }
  | {
      kind: 'external';
      source: 'weather' | 'season';
      key: string;
      op: 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
      value: number | string;
    };

export type AutomationAction =
  | {
      kind: 'command';
      deviceId: string;
      method: string;
      params: Record<string, unknown>;
    }
  | {
      kind: 'notify';
      channel: 'log';
      message: string;
    }
  | {
      kind: 'llm';
      role: 'back';
      prompt: string;
    };

export type AutomationDefinition = {
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  [key: string]: unknown;
};

export type Device = {
  id?: string;
  deviceId: string;
  name: string;
  type?: string | null;
  category?: string | null;
  status: 'online' | 'offline';
  retryCount?: number;
  roomId: string;
  homeId: string;
  attrs?: Record<string, unknown>;
  capabilities?: DeviceCapability[];
  secret?: string;
  lastSeen?: string | Date | null;
  fwVersion?: string | null;
};

export type DeviceAttrsSnapshot = {
  id: number;
  deviceId: string;
  ts: Date;
  attrs: Record<string, unknown>;
};

export type Room = {
  id: string;
  homeId: string;
  name: string;
  floor?: string | null;
  type?: string | null;
  devicesCount?: number;
  onlineDevicesCount?: number;
  devices?: Device[];
};

export type Home = {
  id: string;
  name: string;
  address?: string | null;
  timezone?: string;
  owner?: { id: string; email?: string };
  roomsCount?: number;
  devicesCount?: number;
  onlineDevicesCount?: number;
  automationsCount?: number;
};

export type HomeStructure = {
  home: Home;
  rooms: Room[];
  selectedRoomId?: string | null;
};

export type Automation = {
  id: string;
  homeId: string;
  name: string;
  enabled: boolean;
  definition: AutomationDefinition;
  scope?: string;
  source?: 'json' | 'nl' | 'preset';
};

export type User = {
  id: string;
  email: string;
  role: string;
};

export type AuthResponse = {
  token: string;
  homeIds: string[];
  user: User;
};

export type MetricsSummary = {
  onlineDevices: number;
  totalCommands: number;
  ackedCommands?: number;
  failedCommands?: number;
  timeoutCommands?: number;
  commandSuccessRate?: number;
  totalAutomationRuns?: number;
  succeededAutomationRuns?: number;
  failedAutomationRuns?: number;
  automationSuccessRate?: number;
  totalLlmInvocations?: number;
  failedLlmInvocations?: number;
  llmFailureRate?: number;
};

export type MqttMetrics = {
  connected: boolean;
  lastError?: string | null;
};
