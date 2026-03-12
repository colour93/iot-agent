import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseModel } from './base.js';
import { Device } from './device.js';

@Entity('device_events')
export class DeviceEvent extends BaseModel {
  @ManyToOne(() => Device, (device) => device.events, { eager: true })
  declare device: Device;

  @Column({ type: 'varchar' })
  declare eventType: string;

  @Column({ type: 'jsonb', nullable: true })
  params?: Record<string, unknown>;

  @Column({ type: 'timestamptz' })
  declare ts: Date;
}

