import useSWR from 'swr';
import { api } from './api';
import { mockAutomations, mockDevices, mockHomes, mockRooms } from './mocks';
import type {
  AuditLogEntry,
  Automation,
  CommandRecord,
  Device,
  Home,
  HomeStructure,
  MetricAlert,
  MetricsSummary,
  MqttMetrics,
  Room,
} from './types';

function hasAuthSession() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.localStorage.getItem('authToken'));
}

function shouldUseMockFallback() {
  return !hasAuthSession();
}

function buildMockStructure(homeId?: string): HomeStructure | null {
  if (!homeId) return null;

  const home = mockHomes.find((item) => item.id === homeId);
  if (!home) return null;

  const rooms = mockRooms
    .filter((room) => room.homeId === homeId)
    .map((room) => {
      const devices = mockDevices.filter((device) => device.roomId === room.id);
      return {
        ...room,
        devices,
        devicesCount: devices.length,
        onlineDevicesCount: devices.filter((device) => device.status === 'online').length,
      };
    });

  return {
    home: {
      ...home,
      roomsCount: rooms.length,
      devicesCount: rooms.flatMap((room) => room.devices ?? []).length,
      onlineDevicesCount: rooms.flatMap((room) => room.devices ?? []).filter((device) => device.status === 'online').length,
      automationsCount: mockAutomations.filter((automation) => automation.homeId === homeId).length,
    },
    rooms,
    selectedRoomId: rooms[0]?.id ?? null,
  };
}

export function useHomes(enabled = true) {
  const fallback = shouldUseMockFallback() ? mockHomes : [];
  const key = enabled ? '/api/homes' : null;
  return useSWR<Home[]>(
    key,
    async () => {
      try {
        return await api.listHomes();
      } catch (err) {
        console.warn('fetch homes failed, using fallback', err);
        if (!shouldUseMockFallback()) return [];
        return fallback;
      }
    },
    {
      fallbackData: fallback,
      revalidateOnFocus: false,
      refreshInterval: 5000,
    },
  );
}

export function useHomeStructure(homeId?: string) {
  const fallback = shouldUseMockFallback() ? buildMockStructure(homeId) : null;
  const key = homeId ? `/api/homes/${homeId}/structure` : null;
  return useSWR<HomeStructure | null>(
    key,
    async () => {
      if (!homeId) return null;
      try {
        return await api.getHomeStructure(homeId);
      } catch (err) {
        console.warn('fetch home structure failed, using fallback', err);
        if (!shouldUseMockFallback()) return null;
        return fallback;
      }
    },
    {
      fallbackData: fallback,
      revalidateOnFocus: false,
      refreshInterval: 5000,
    },
  );
}

export function useRooms(homeId?: string) {
  const fallback = shouldUseMockFallback() ? mockRooms.filter((r) => r.homeId === homeId) : [];
  const key = homeId ? `/api/homes/${homeId}/rooms` : null;
  return useSWR<Room[]>(
    key,
    async () => {
      if (!homeId) return fallback as Room[];
      try {
        return await api.listRooms(homeId);
      } catch (err) {
        console.warn('fetch rooms failed, using fallback', err);
        if (!shouldUseMockFallback()) return [];
        return fallback as Room[];
      }
    },
    {
      fallbackData: fallback as Room[],
      revalidateOnFocus: false,
      refreshInterval: 5000,
    },
  );
}

export function useDevices(homeId?: string) {
  const fallback = shouldUseMockFallback() ? mockDevices.filter((d) => d.homeId === homeId) : [];
  const key = homeId ? `/api/homes/${homeId}/devices` : null;
  return useSWR<Device[]>(
    key,
    async () => {
      if (!homeId) return fallback as Device[];
      try {
        return await api.listDevices(homeId);
      } catch (err) {
        console.warn('fetch devices failed, using fallback', err);
        if (!shouldUseMockFallback()) return [];
        return fallback as Device[];
      }
    },
    {
      fallbackData: fallback as Device[],
      revalidateOnFocus: false,
      refreshInterval: 5000,
    },
  );
}

export function useAutomations(homeId?: string) {
  const fallback = shouldUseMockFallback() ? mockAutomations.filter((a) => a.homeId === homeId) : [];
  const key = homeId ? `/api/homes/${homeId}/automations` : null;
  return useSWR<Automation[]>(
    key,
    async () => {
      if (!homeId) return fallback as Automation[];
      try {
        return await api.listAutomations(homeId);
      } catch (err) {
        console.warn('fetch automations failed, using fallback', err);
        if (!shouldUseMockFallback()) return [];
        return fallback as Automation[];
      }
    },
    {
      fallbackData: fallback as Automation[],
      revalidateOnFocus: false,
      refreshInterval: 5000,
    },
  );
}

export function useCommands(homeId?: string, limit = 20) {
  const fallback: CommandRecord[] = [];
  const key = homeId ? `/api/homes/${homeId}/commands?limit=${limit}` : null;
  return useSWR<CommandRecord[]>(
    key,
    async () => {
      if (!homeId) return fallback;
      try {
        const result = await api.listCommands(homeId, { limit });
        return result.commands;
      } catch (err) {
        console.warn('fetch commands failed, using fallback', err);
        return fallback;
      }
    },
    {
      fallbackData: fallback,
      revalidateOnFocus: false,
      refreshInterval: 5000,
    },
  );
}

export function useMetricsSummary() {
  const fallback: MetricsSummary = { onlineDevices: 0, totalCommands: 0 };
  return useSWR<MetricsSummary>(
    '/api/metrics/summary',
    async () => {
      try {
        return await api.getMetricsSummary();
      } catch (err) {
        console.warn('fetch metrics summary failed, using fallback', err);
        return fallback;
      }
    },
    {
      fallbackData: fallback,
      revalidateOnFocus: false,
      refreshInterval: 5000,
    },
  );
}

export function useHomeMetricsSummary(homeId?: string) {
  const fallback: MetricsSummary = { onlineDevices: 0, totalCommands: 0 };
  const key = homeId ? `/api/homes/${homeId}/metrics/summary` : null;
  return useSWR<MetricsSummary>(
    key,
    async () => {
      if (!homeId) return fallback;
      try {
        return await api.getHomeMetricsSummary(homeId);
      } catch (err) {
        console.warn('fetch home metrics summary failed, using fallback', err);
        return fallback;
      }
    },
    {
      fallbackData: fallback,
      revalidateOnFocus: false,
      refreshInterval: 5000,
    },
  );
}

export function useMetricAlerts() {
  const fallback: MetricAlert[] = [];
  return useSWR<MetricAlert[]>(
    '/api/metrics/alerts',
    async () => {
      try {
        const result = await api.getMetricAlerts();
        return result.alerts ?? [];
      } catch (err) {
        console.warn('fetch metric alerts failed, using fallback', err);
        return fallback;
      }
    },
    {
      fallbackData: fallback,
      revalidateOnFocus: false,
      refreshInterval: 5000,
    },
  );
}

export function useHomeMetricAlerts(homeId?: string) {
  const fallback: MetricAlert[] = [];
  const key = homeId ? `/api/homes/${homeId}/metrics/alerts` : null;
  return useSWR<MetricAlert[]>(
    key,
    async () => {
      if (!homeId) return fallback;
      try {
        const result = await api.getHomeMetricAlerts(homeId);
        return result.alerts ?? [];
      } catch (err) {
        console.warn('fetch home metric alerts failed, using fallback', err);
        return fallback;
      }
    },
    {
      fallbackData: fallback,
      revalidateOnFocus: false,
      refreshInterval: 5000,
    },
  );
}

export function useMqttMetrics() {
  const fallback: MqttMetrics = { connected: false, lastError: null };
  return useSWR<MqttMetrics>(
    '/api/metrics/mqtt',
    async () => {
      try {
        return await api.getMqttMetrics();
      } catch (err) {
        console.warn('fetch mqtt metrics failed, using fallback', err);
        return fallback;
      }
    },
    {
      fallbackData: fallback,
      revalidateOnFocus: false,
      refreshInterval: 5000,
    },
  );
}

export function useAuditLogs(homeId?: string, limit = 20) {
  const fallback: AuditLogEntry[] = [];
  const key = homeId ? `/api/homes/${homeId}/audit-logs?limit=${limit}` : null;
  return useSWR<AuditLogEntry[]>(
    key,
    async () => {
      if (!homeId) return fallback;
      try {
        const result = await api.listHomeAuditLogs(homeId, { limit });
        return result.logs ?? [];
      } catch (err) {
        console.warn('fetch audit logs failed, using fallback', err);
        return fallback;
      }
    },
    {
      fallbackData: fallback,
      revalidateOnFocus: false,
      refreshInterval: 5000,
    },
  );
}
