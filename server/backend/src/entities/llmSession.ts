import { Column, Entity, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from './base.js';
import { Home } from './home.js';
import { LLMInvocation } from './llmInvocation.js';

export type LlmRole = 'front' | 'back';

@Entity('llm_sessions')
export class LLMSession extends BaseModel {
  @ManyToOne(() => Home, (home) => home.llmSessions, { eager: true })
  home!: Home;

  @Column({ type: 'varchar' })
  role!: LlmRole;

  @Column({ type: 'varchar', nullable: true })
  contextRef?: string;

  @OneToMany(() => LLMInvocation, (inv) => inv.session)
  invocations!: LLMInvocation[];
}

