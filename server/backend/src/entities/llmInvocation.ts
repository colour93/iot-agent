import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseModel } from './base.js';
import { LLMSession } from './llmSession.js';
import { Home } from './home.js';

@Entity('llm_invocations')
export class LLMInvocation extends BaseModel {
  @ManyToOne(() => LLMSession, (session) => session.invocations, {
    eager: true,
  })
  declare session: LLMSession;

  @ManyToOne(() => Home, (home) => home.llmInvocations, { eager: true })
  declare home: Home;

  @Column({ type: 'varchar' })
  declare role: 'front' | 'back';

  @Column({ type: 'varchar', nullable: true })
  summary?: string;

  @Column({ type: 'jsonb', nullable: true })
  input?: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  output?: Record<string, unknown>;

  @Column({ type: 'integer', default: 0 })
  declare tokensIn: number;

  @Column({ type: 'integer', default: 0 })
  declare tokensOut: number;

  @Column({ type: 'float', default: 0 })
  declare cost: number;
}

