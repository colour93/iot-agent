import { Column, Entity, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from './base.js';
import { User } from './user.js';
import { Room } from './room.js';
import { Automation } from './automation.js';
import { LLMSession } from './llmSession.js';
import { LLMInvocation } from './llmInvocation.js';

@Entity('homes')
export class Home extends BaseModel {
  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar', nullable: true })
  address?: string;

  @Column({ type: 'varchar', default: 'Asia/Shanghai' })
  timezone!: string;

  @ManyToOne(() => User, (user) => user.homes, { eager: true })
  owner!: User;

  @OneToMany(() => Room, (room) => room.home)
  rooms!: Room[];

  @OneToMany(() => Automation, (a) => a.home)
  automations!: Automation[];

  @OneToMany(() => LLMSession, (s) => s.home)
  llmSessions!: LLMSession[];

  @OneToMany(() => LLMInvocation, (i) => i.home)
  llmInvocations!: LLMInvocation[];
}

