import type {
  AuthResponse,
  Automation,
  AutomationDefinition,
  CommandRecord,
  Device,
  DeviceAttrsSnapshot,
  Home,
  HomeStructure,
  MetricsSummary,
  MqttMetrics,
  Room,
} from './types';
import { toast } from 'sonner';
import type { UIMessage } from 'ai';

type AutomationApiItem = Omit<Automation, 'homeId'> & {
  home?: {
    id?: string;
  };
};

export type ChatSessionSummary = {
  id: string;
  homeId: string;
  title: string;
  latestPreview: string | null;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatSessionDetail = {
  session: ChatSessionSummary;
  messages: UIMessage[];
};

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
    fetchJson<AuthResponse>(`/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (email: string, password: string) =>
    fetchJson<AuthResponse>(`/api/auth/register`, {
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

  deleteHome: (homeId: string, token?: string) =>
    fetchJson<{ status: string; homeId: string }>(
      `/api/homes/${homeId}`,
      {
        method: 'DELETE',
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

  deleteRoom: (roomId: string, token?: string) =>
    fetchJson<{ status: string; roomId: string }>(
      `/api/rooms/${roomId}`,
      {
        method: 'DELETE',
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

  updateDevice: (
    deviceId: string,
    data: {
      homeId?: string;
      roomId?: string;
      name?: string;
      type?: string;
      category?: 'sensor' | 'actuator' | 'both';
    },
    token?: string,
  ) =>
    fetchJson<Device>(
      `/api/devices/${deviceId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      },
      token,
    ),

  deleteDevice: (deviceId: string, token?: string) =>
    fetchJson<{ status: string; deviceId: string }>(
      `/api/devices/${deviceId}`,
      {
        method: 'DELETE',
      },
      token,
    ),

  getDeviceAttrs: (deviceId: string, token?: string) =>
    fetchJson<DeviceAttrsSnapshot>(`/api/devices/${deviceId}/attrs`, undefined, token),

  sendCommand: (
    deviceId: string,
    body: { homeId: string; roomId: string; method: string; params?: Record<string, unknown> },
    token?: string,
  ) =>
    fetchJson<{ status: string; cmdId: string; commandStatus?: string }>(
      `/api/devices/${deviceId}/command`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      token,
    ),

  listCommands: (homeId: string, query?: { status?: string; deviceId?: string; limit?: number }, token?: string) => {
    const params = new URLSearchParams();
    if (query?.status) params.set('status', query.status);
    if (query?.deviceId) params.set('deviceId', query.deviceId);
    if (typeof query?.limit === 'number') params.set('limit', String(query.limit));
    const suffix = params.toString();
    const url = `/api/homes/${homeId}/commands${suffix ? `?${suffix}` : ''}`;
    return fetchJson<{ commands: CommandRecord[]; limit: number }>(url, undefined, token);
  },

  listAutomations: async (homeId: string, token?: string) => {
    const list = await fetchJson<AutomationApiItem[]>(`/api/homes/${homeId}/automations`, undefined, token);
    return list.map((item) => ({ ...item, homeId: item.home?.id || homeId })) as Automation[];
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

  createAutomationFromNL: (
    homeId: string,
    body: { prompt: string; enabled?: boolean },
    token?: string,
  ) =>
    fetchJson<{ status: string; automation: Automation & { definition: AutomationDefinition } }>(
      `/api/homes/${homeId}/automations/nl`,
      {
        method: 'POST',
        body: JSON.stringify(body),
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

  listChatSessions: async (homeId: string, token?: string) => {
    const result = await fetchJson<{ sessions: ChatSessionSummary[] }>(
      `/api/homes/${homeId}/llm/chat/sessions`,
      undefined,
      token,
    );
    return result.sessions;
  },

  createChatSession: (homeId: string, data?: { title?: string }, token?: string) =>
    fetchJson<ChatSessionSummary>(
      `/api/homes/${homeId}/llm/chat/sessions`,
      {
        method: 'POST',
        body: JSON.stringify(data ?? {}),
      },
      token,
    ),

  getChatSession: (homeId: string, sessionId: string, token?: string) =>
    fetchJson<ChatSessionDetail>(
      `/api/homes/${homeId}/llm/chat/sessions/${sessionId}`,
      undefined,
      token,
    ),

  updateChatSessionMessages: (
    homeId: string,
    sessionId: string,
    messages: UIMessage[],
    token?: string,
  ) =>
    fetchJson<ChatSessionDetail>(
      `/api/homes/${homeId}/llm/chat/sessions/${sessionId}/messages`,
      {
        method: 'PUT',
        body: JSON.stringify({ messages }),
      },
      token,
    ),

  renameChatSession: (homeId: string, sessionId: string, title: string, token?: string) =>
    fetchJson<ChatSessionSummary>(
      `/api/homes/${homeId}/llm/chat/sessions/${sessionId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      },
      token,
    ),

  deleteChatSession: (homeId: string, sessionId: string, token?: string) =>
    fetchJson<{ status: string; sessionId: string }>(
      `/api/homes/${homeId}/llm/chat/sessions/${sessionId}`,
      {
        method: 'DELETE',
      },
      token,
    ),
};
