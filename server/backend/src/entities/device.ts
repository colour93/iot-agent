import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { BaseModel } from './base.js';
import { Room } from './room.js';
import { DeviceAttrsSnapshot } from './deviceAttrsSnapshot.js';
import { TelemetryLog } from './telemetryLog.js';
import { DeviceEvent } from './deviceEvent.js';
import { Command } from './command.js';
import type { DeviceCapability } from './deviceCapability.js';

export type DeviceCategory = 'sensor' | 'actuator' | 'both';

@Entity('devices')
export class Device extends BaseModel {
  @Column({ type: 'varchar', unique: true })
  declare deviceId: string; // 物理 ID

  @Column({ type: 'varchar' })
  declare name: string;

  @Column({ type: 'varchar', nullable: true })
  type?: string;

  @Column({ type: 'varchar', default: 'both' })
  declare category: DeviceCategory;

  @Column({ type: 'varchar', default: 'offline' })
  declare status: 'online' | 'offline';

  @Column({ type: 'varchar', nullable: true })
  fwVersion?: string;

  @Column({ type: 'varchar', nullable: true })
  secret?: string;

  @Column({ type: 'timestamptz', nullable: true })
  lastSeen?: Date;

  @ManyToOne(() => Room, (room) => room.devices, { eager: true })
  declare room: Room;

  @OneToMany('DeviceCapability', (cap: DeviceCapability) => cap.device, { cascade: true })
  declare capabilities: DeviceCapability[];

  @OneToOne(() => DeviceAttrsSnapshot, (snap) => snap.device, {
    cascade: true,
    eager: true,
  })
  @JoinColumn()
  snapshot?: DeviceAttrsSnapshot;

  @OneToMany(() => TelemetryLog, (log) => log.device)
  declare telemetryLogs: TelemetryLog[];

  @OneToMany(() => DeviceEvent, (event) => event.device)
  declare events: DeviceEvent[];

  @OneToMany(() => Command, (cmd) => cmd.device)
  declare commands: Command[];
}

