import type {
  Automation,
  Device,
  DeviceAttrsSnapshot,
  Home,
  HomeStructure,
  MetricsSummary,
  MqttMetrics,
  Room,
} from './types';
import { toast } from 'sonner';

function buildHeaders(token?: string, extra?: Record<string, string>) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra || {}),
  };
}

async function fetchJson<T>(url: string, options?: RequestInit, token?: string): Promise<T> {
  const finalToken = token || localStorage.getItem('authToken') || undefined;
  const headers = buildHeaders(finalToken, options?.headers as Record<string, string> | undefined);

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (!res.ok) {
      let errorMsg = res.statusText;
      try {
        const body = await res.json();
        if (body.error) errorMsg = body.error;
        if (body.msg) errorMsg = body.msg;
      } catch {
        // ignore json parse error
      }
      throw new Error(errorMsg);
    }

    return (await res.json()) as T;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : '请求失败');
    throw err;
  }
}

export function fetcherWithFallback<T>(fallback: T) {
  return async (url: string) => {
    try {
      const token = localStorage.getItem('authToken') || undefined;
      return await fetchJson<T>(url, undefined, token);
    } catch (err) {
      console.warn('fallback data for', url, err);
      return fallback;
    }
  };
}

export const api = {
  login: (email: string, password: string) =>
    fetchJson<{ token: string; user: { id: string; email: string; role: string } }>(`/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (email: string, password: string) =>
    fetchJson<{ token: string; user: { id: string; email: string; role: string } }>(`/api/auth/register`, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  listHomes: (token?: string) => fetchJson<Home[]>('/api/homes', undefined, token),

  getHomeStructure: (homeId: string, token?: string) =>
    fetchJson<HomeStructure>(`/api/homes/${homeId}/structure`, undefined, token),

  createHome: (data: { name: string; timezone?: string; address?: string; ownerId?: string }, token?: string) =>
    fetchJson<Home>(
      '/api/homes',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      token,
    ),

  updateHome: (homeId: string, data: { name?: string; timezone?: string; address?: string }, token?: string) =>
    fetchJson<Home>(
      `/api/homes/${homeId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      },
      token,
    ),

  listRooms: (homeId: string, token?: string) => fetchJson<Room[]>(`/api/homes/${homeId}/rooms`, undefined, token),

  createRoom: (homeId: string, data: { name: string; floor?: string; type?: string }, token?: string) =>
    fetchJson<Room>(
      `/api/homes/${homeId}/rooms`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      token,
    ),

  updateRoom: (roomId: string, data: { name?: string; floor?: string; type?: string }, token?: string) =>
    fetchJson<Room>(
      `/api/rooms/${roomId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      },
      token,
    ),

  listDevices: (homeId: string, token?: string) => fetchJson<Device[]>(`/api/homes/${homeId}/devices`, undefined, token),

  preRegisterDevice: (
    homeId: string,
    data: { roomId: string; deviceId: string; name: string; type?: string; category?: string },
    token?: string,
  ) =>
    fetchJson<{ status: string; secret: string; homeId: string; roomId: string; device: Device }>(
      `/api/homes/${homeId}/devices/pre-register`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      token,
    ),

  getDevice: (deviceId: string, token?: string) => fetchJson<Device>(`/api/devices/${deviceId}`, undefined, token),

  getDeviceAttrs: (deviceId: string, token?: string) =>
    fetchJson<DeviceAttrsSnapshot>(`/api/devices/${deviceId}/attrs`, undefined, token),

  sendCommand: (
    deviceId: string,
    body: { homeId: string; roomId: string; method: string; params?: Record<string, unknown> },
    token?: string,
  ) =>
    fetchJson<{ status: string; cmdId: string }>(
      `/api/devices/${deviceId}/command`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      token,
    ),

  listAutomations: async (homeId: string, token?: string) => {
    const list = await fetchJson<any[]>(`/api/homes/${homeId}/automations`, undefined, token);
    return list.map((a) => ({ ...a, homeId: a.home?.id })) as Automation[];
  },

  saveAutomation: (homeId: string, automation: Partial<Automation>, token?: string) =>
    fetchJson<Automation>(
      `/api/homes/${homeId}/automations`,
      {
        method: 'POST',
        body: JSON.stringify(automation),
      },
      token,
    ),

  toggleAutomation: (id: string, enabled: boolean, token?: string) =>
    fetchJson<Automation>(
      `/api/automations/${id}/toggle`,
      {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      },
      token,
    ),

  runAutomation: (id: string, triggerContext?: Record<string, unknown>, token?: string) =>
    fetchJson<{ status: string }>(
      `/api/automations/${id}/run`,
      {
        method: 'POST',
        body: JSON.stringify({ triggerContext }),
      },
      token,
    ),

  getMetricsSummary: (token?: string) => fetchJson<MetricsSummary>('/api/metrics/summary', undefined, token),
  getMqttMetrics: (token?: string) => fetchJson<MqttMetrics>('/api/metrics/mqtt', undefined, token),

  callFrontModel: (homeId: string, messages: Array<{ role: string; content: string }>, token?: string) =>
    fetchJson<{ text: string }>(
      `/api/homes/${homeId}/llm/chat`,
      {
        method: 'POST',
        body: JSON.stringify({ messages }),
      },
      token,
    ),
};
