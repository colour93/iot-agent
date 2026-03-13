export type DeviceCapability = {
  kind: 'attr' | 'method' | 'event';
  name: string;
  schema?: Record<string, unknown>;
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
