import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseModel } from './base.js';
import type { Device } from './device.js';

export type CapabilityKind = 'attr' | 'method' | 'event';

@Entity('device_capabilities')
export class DeviceCapability extends BaseModel {
  @Column({ type: 'varchar' })
  declare kind: CapabilityKind;

  @Column({ type: 'varchar' })
  declare name: string;

  @Column({ type: 'jsonb', nullable: true })
  schema?: Record<string, unknown>;

  @ManyToOne('Device', (device: Device) => device.capabilities)
  declare device: Device;
}

