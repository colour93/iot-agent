import { Column, Entity, OneToMany } from 'typeorm';
import { BaseModel } from './base.js';
import { Home } from './home.js';
import { AuditLog } from './auditLog.js';

@Entity('users')
export class User extends BaseModel {
  @Column({ type: 'varchar', unique: true })
  declare email: string;

  @Column({ type: 'varchar' })
  declare passwordHash: string;

  @Column({ type: 'varchar', default: 'user' })
  declare role: 'user' | 'admin';

  @OneToMany(() => Home, (home) => home.owner)
  declare homes: Home[];

  @OneToMany(() => AuditLog, (log) => log.user)
  declare auditLogs: AuditLog[];
}

