import type { DeviceStatusData, RoomSummaryData } from './types';

export const toJson = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export const isObjectRecord = (value: unknown): value is Record<string, unknown> => {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
};

export const isPrimitiveStatusValue = (
  value: unknown,
): value is string | number | boolean => {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
};

export const formatPrimitiveStatusValue = (value: string | number | boolean) => {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  return String(value);
};

export const formatToolState = (state: string) => {
  switch (state) {
    case 'input-streaming':
      return '参数生成中';
    case 'input-available':
      return '参数已就绪';
    case 'output-available':
      return '执行完成';
    case 'output-error':
      return '执行失败';
    case 'output-denied':
      return '执行被拒绝';
    case 'approval-requested':
      return '等待确认';
    case 'approval-responded':
      return '已确认';
    default:
      return state;
  }
};

export const isSettledToolState = (state: string) => {
  return (
    state === 'output-available' ||
    state === 'output-error' ||
    state === 'output-denied' ||
    state === 'approval-responded'
  );
};

const normalizeDeviceStatusData = (value: unknown): DeviceStatusData | null => {
  if (!isObjectRecord(value)) return null;

  return {
    deviceId: typeof value.deviceId === 'string' ? value.deviceId : '-',
    name: typeof value.name === 'string' ? value.name : '未命名设备',
    status: typeof value.status === 'string' ? value.status : 'unknown',
    roomName: typeof value.roomName === 'string' ? value.roomName : '未分配房间',
    attrs: isObjectRecord(value.attrs) ? value.attrs : {},
  };
};

const normalizeRoomSummaryData = (value: unknown): RoomSummaryData | null => {
  if (!isObjectRecord(value)) return null;

  return {
    roomId: typeof value.roomId === 'string' ? value.roomId : '-',
    name: typeof value.name === 'string' ? value.name : '未命名房间',
    floor: typeof value.floor === 'string' ? value.floor : null,
    type: typeof value.type === 'string' ? value.type : null,
    devicesCount: typeof value.devicesCount === 'number' ? value.devicesCount : 0,
    onlineDevicesCount:
      typeof value.onlineDevicesCount === 'number' ? value.onlineDevicesCount : 0,
  };
};

export const extractDeviceStatusCards = (toolName: string, output: unknown) => {
  if (toolName === 'get_device_state' && isObjectRecord(output)) {
    const device = normalizeDeviceStatusData(output.device);
    return device ? [device] : [];
  }

  if (toolName === 'list_devices' && Array.isArray(output)) {
    return output
      .map((item) => normalizeDeviceStatusData(item))
      .filter((item): item is DeviceStatusData => item !== null);
  }

  return [];
};

export const extractRoomCards = (toolName: string, output: unknown) => {
  if (toolName !== 'list_rooms' || !Array.isArray(output)) {
    return [];
  }

  return output
    .map((item) => normalizeRoomSummaryData(item))
    .filter((item): item is RoomSummaryData => item !== null);
};
