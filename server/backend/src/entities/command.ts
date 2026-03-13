import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseModel } from './base.js';
import { Device } from './device.js';

export type CommandStatus = 'pending' | 'sent' | 'acked' | 'failed' | 'timeout';

@Entity('commands')
export class Command extends BaseModel {
  @ManyToOne(() => Device, (device) => device.commands, { eager: true })
  declare device: Device;

  @Column({ type: 'varchar', nullable: true })
  homeId?: string;

  @Column({ type: 'varchar', nullable: true })
  roomId?: string;

  @Column({ type: 'varchar' })
  declare cmdId: string;

  @Column({ type: 'varchar' })
  declare method: string;

  @Column({ type: 'jsonb', default: {} })
  declare params: Record<string, unknown>;

  @Column({ type: 'varchar', default: 'pending' })
  declare status: CommandStatus;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  ackAt?: Date;

  @Column({ type: 'varchar', nullable: true })
  error?: string;

  @Column({ type: 'jsonb', nullable: true })
  result?: Record<string, unknown>;

  @Column({ type: 'int', default: 0 })
  declare retryCount: number;
}

