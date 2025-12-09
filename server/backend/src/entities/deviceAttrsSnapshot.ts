import { Column, Entity, OneToOne } from 'typeorm';
import { BaseModel } from './base.js';
import type { Device } from './device.js';

@Entity('device_attrs_snapshot')
export class DeviceAttrsSnapshot extends BaseModel {
  @Column({ type: 'jsonb', default: {} })
  attrs!: Record<string, unknown>;

  // 使用字符串避免运行时循环引用触发 TDZ
  @OneToOne('Device', (device: Device) => device.snapshot)
  device!: Device;
}

