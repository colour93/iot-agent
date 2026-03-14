export type DeviceCategory = 'sensor' | 'actuator' | 'both';

export type DeviceDraft = {
  deviceId?: string;
  name: string;
  type: string;
  category: DeviceCategory;
  roomId: string;
};
