import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseModel } from './base.js';

export type CapabilityKind = 'attr' | 'method' | 'event';

@Entity('device_capabilities')
export class DeviceCapability extends BaseModel {
  @Column({ type: 'varchar' })
  kind!: CapabilityKind;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'jsonb', nullable: true })
  schema?: Record<string, unknown>;

  @ManyToOne('Device', (device: any) => device.capabilities)
  device!: any;
}

