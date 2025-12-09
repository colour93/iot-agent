import useSWR from 'swr';
import { api } from './api';
import { mockHomes, mockRooms, mockDevices, mockAutomations } from './mocks';
import type { Automation, Device, Home, Room } from './types';

export function useHomes() {
  const fallback = mockHomes;
  return useSWR<Home[]>('/api/homes', async () => {
    try {
      return await api.listHomes();
    } catch (err) {
      console.warn('fetch homes failed, using fallback', err);
      return fallback;
    }
  }, {
    fallbackData: fallback,
    revalidateOnFocus: false,
    refreshInterval: 5000,
  });
}

export function useRooms(homeId?: string) {
  const fallback = mockRooms.filter((r) => r.homeId === homeId);
  const key = homeId ? `/api/homes/${homeId}/rooms` : null;
  return useSWR<Room[]>(key, async () => {
    if (!homeId) return fallback as Room[];
    try {
      return await api.listRooms(homeId);
    } catch (err) {
      console.warn('fetch rooms failed, using fallback', err);
      return fallback as Room[];
    }
  }, {
    fallbackData: fallback as Room[],
    revalidateOnFocus: false,
    refreshInterval: 5000,
  });
}

export function useDevices(homeId?: string) {
  const fallback = mockDevices.filter((d) => d.homeId === homeId);
  const key = homeId ? `/api/homes/${homeId}/devices` : null;
  return useSWR<Device[]>(key, async () => {
    if (!homeId) return fallback as Device[];
    try {
      return await api.listDevices(homeId);
    } catch (err) {
      console.warn('fetch devices failed, using fallback', err);
      return fallback as Device[];
    }
  }, {
    fallbackData: fallback as Device[],
    revalidateOnFocus: false,
    refreshInterval: 5000,
  });
}

export function useAutomations(homeId?: string) {
  const fallback = mockAutomations.filter((a) => a.homeId === homeId);
  const key = homeId ? `/api/homes/${homeId}/automations` : null;
  return useSWR<Automation[]>(key, async () => {
    if (!homeId) return fallback as Automation[];
    try {
      return await api.listAutomations(homeId);
    } catch (err) {
      console.warn('fetch automations failed, using fallback', err);
      return fallback as Automation[];
    }
  }, {
    fallbackData: fallback as Automation[],
    revalidateOnFocus: false,
    refreshInterval: 5000,
  });
}
