export type DeviceCapability = {
  kind: 'attr' | 'method' | 'event';
  name: string;
  schema?: Record<string, unknown>;
};

export type Device = {
  deviceId: string;
  name: string;
  type?: string;
  category?: string;
  status: 'online' | 'offline';
  retryCount?: number;
  roomId: string;
  homeId: string;
  attrs?: Record<string, unknown>;
  capabilities?: DeviceCapability[];
  secret?: string; // returned on pre-register
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
  floor?: string;
  type?: string;
};

export type Home = {
  id: string;
  name: string;
  timezone?: string;
  owner?: { id: string };
};

export type Automation = {
  id: string;
  homeId: string;
  name: string;
  enabled: boolean;
  definition: Record<string, unknown>;
  scope?: string;
  source?: 'json' | 'llm';
};

export type User = {
  id: string;
  email: string;
  role: string;
};

export type AuthResponse = {
  token: string;
  user: User;
};

export type MetricsSummary = {
  onlineDevices: number;
  totalCommands: number;
};

export type MqttMetrics = {
  connected: boolean;
  lastError?: string | null;
};
