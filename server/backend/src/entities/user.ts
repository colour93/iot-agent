import { Column, Entity, OneToMany } from 'typeorm';
import { BaseModel } from './base.js';
import { Home } from './home.js';
import { AuditLog } from './auditLog.js';

@Entity('users')
export class User extends BaseModel {
  @Column({ type: 'varchar', unique: true })
  email!: string;

  @Column({ type: 'varchar' })
  passwordHash!: string;

  @Column({ type: 'varchar', default: 'user' })
  role!: 'user' | 'admin';

  @OneToMany(() => Home, (home) => home.owner)
  homes!: Home[];

  @OneToMany(() => AuditLog, (log) => log.user)
  auditLogs!: AuditLog[];
}

