import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseModel } from './base.js';
import { Device } from './device.js';

@Entity('telemetry_logs')
export class TelemetryLog extends BaseModel {
  @ManyToOne(() => Device, (device) => device.telemetryLogs, { eager: true })
  declare device: Device;

  @Column({ type: 'varchar' })
  declare homeId: string;

  @Column({ type: 'varchar' })
  declare roomId: string;

  @Column({ type: 'timestamptz' })
  declare ts: Date;

  @Column({ type: 'jsonb' })
  declare payload: Record<string, unknown>;
}

