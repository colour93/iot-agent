import { create } from 'zustand';
import { api } from './api';

type State = {
  selectedHome?: string;
  selectedRoom?: string;
  chatLog: { role: 'user' | 'assistant'; text: string }[];
  token?: string;
  user?: { id: string; email: string; role: string };
  hydrated: boolean;
};

type Actions = {
  selectHome: (homeId: string) => void;
  selectRoom: (roomId?: string) => void;
  sendCommand: (
    deviceId: string,
    method: string,
    params: Record<string, unknown>,
    roomIdOverride?: string,
  ) => Promise<void>;
  sendChat: (prompt: string) => Promise<void>;
  setAuth: (token: string, user: { id: string; email: string; role: string }) => void;
  logout: () => void;
  hydrate: () => void;
};

export const useAppStore = create<State & Actions>((set, get) => ({
  chatLog: [],
  hydrated: false,

  hydrate: () => {
    const token = localStorage.getItem('authToken') || undefined;
    const userStr = localStorage.getItem('authUser');
    const user = userStr ? (JSON.parse(userStr) as State['user']) : undefined;
    set({ token, user, hydrated: true });
  },

  setAuth: (token, user) => {
    localStorage.setItem('authToken', token);
    localStorage.setItem('authUser', JSON.stringify(user));
    set({ token, user });
  },

  logout: () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    set({ token: undefined, user: undefined, selectedHome: undefined, selectedRoom: undefined, chatLog: [] });
  },

  selectHome: (homeId) => set({ selectedHome: homeId, selectedRoom: undefined }),

  selectRoom: (roomId) => set({ selectedRoom: roomId }),

  sendCommand: async (deviceId, method, params, roomIdOverride) => {
    const homeId = get().selectedHome;
    const roomId = roomIdOverride || get().selectedRoom;
    const token = get().token;
    if (!homeId || !roomId) return;
    await api.sendCommand(deviceId, { homeId, roomId, method, params }, token);
  },

  sendChat: async (prompt) => {
    const homeId = get().selectedHome;
    if (!homeId) return;
    const history = [...get().chatLog, { role: 'user' as const, text: prompt }];
    set({ chatLog: history });
    try {
      const res = await api.callFrontModel(
        homeId,
        history.map((m) => ({ role: m.role, content: m.text })),
        get().token,
      );
      set((s) => ({ chatLog: [...s.chatLog, { role: 'assistant', text: res.text }] }));
    } catch (err) {
      set((s) => ({ chatLog: [...s.chatLog, { role: 'assistant', text: '请求失败，请稍后重试。' }] }));
      throw err;
    }
  },
}));
