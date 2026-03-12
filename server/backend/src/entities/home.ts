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
  declare name: string;

  @Column({ type: 'varchar', nullable: true })
  address?: string;

  @Column({ type: 'varchar', default: 'Asia/Shanghai' })
  declare timezone: string;

  @ManyToOne(() => User, (user) => user.homes, { eager: true })
  declare owner: User;

  @OneToMany(() => Room, (room) => room.home)
  declare rooms: Room[];

  @OneToMany(() => Automation, (a) => a.home)
  declare automations: Automation[];

  @OneToMany(() => LLMSession, (s) => s.home)
  declare llmSessions: LLMSession[];

  @OneToMany(() => LLMInvocation, (i) => i.home)
  declare llmInvocations: LLMInvocation[];
}

