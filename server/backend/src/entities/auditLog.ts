import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseModel } from './base.js';
import { User } from './user.js';

@Entity('audit_logs')
export class AuditLog extends BaseModel {
  @ManyToOne(() => User, (user) => user.auditLogs, { eager: true })
  declare user: User;

  @Column({ type: 'varchar' })
  declare action: string;

  @Column({ type: 'varchar', nullable: true })
  target?: string;

  @Column({ type: 'jsonb', nullable: true })
  meta?: Record<string, unknown>;
}

