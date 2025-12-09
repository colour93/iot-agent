import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseModel } from './base.js';
import { Device } from './device.js';

@Entity('telemetry_logs')
export class TelemetryLog extends BaseModel {
  @ManyToOne(() => Device, (device) => device.telemetryLogs, { eager: true })
  device!: Device;

  @Column({ type: 'varchar' })
  homeId!: string;

  @Column({ type: 'varchar' })
  roomId!: string;

  @Column({ type: 'timestamptz' })
  ts!: Date;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;
}

