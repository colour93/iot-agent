export type DeviceStatusData = {
  deviceId: string;
  name: string;
  status: string;
  roomName: string;
  attrs: Record<string, unknown>;
};

export type RoomSummaryData = {
  roomId: string;
  name: string;
  floor: string | null;
  type: string | null;
  devicesCount: number;
  onlineDevicesCount: number;
};
