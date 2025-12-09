import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseModel } from './base.js';
import { Device } from './device.js';

export type CommandStatus = 'pending' | 'sent' | 'acked' | 'failed' | 'timeout';

@Entity('commands')
export class Command extends BaseModel {
  @ManyToOne(() => Device, (device) => device.commands, { eager: true })
  device!: Device;

  @Column({ type: 'varchar', nullable: true })
  homeId?: string;

  @Column({ type: 'varchar', nullable: true })
  roomId?: string;

  @Column({ type: 'varchar' })
  cmdId!: string;

  @Column({ type: 'varchar' })
  method!: string;

  @Column({ type: 'jsonb', default: {} })
  params!: Record<string, unknown>;

  @Column({ type: 'varchar', default: 'pending' })
  status!: CommandStatus;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  ackAt?: Date;

  @Column({ type: 'varchar', nullable: true })
  error?: string;

  @Column({ type: 'int', default: 0 })
  retryCount!: number;
}

