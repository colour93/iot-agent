import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseModel } from './base.js';
import { LLMSession } from './llmSession.js';
import { Home } from './home.js';

@Entity('llm_invocations')
export class LLMInvocation extends BaseModel {
  @ManyToOne(() => LLMSession, (session) => session.invocations, {
    eager: true,
  })
  session!: LLMSession;

  @ManyToOne(() => Home, (home) => home.llmInvocations, { eager: true })
  home!: Home;

  @Column({ type: 'varchar' })
  role!: 'front' | 'back';

  @Column({ type: 'varchar', nullable: true })
  summary?: string;

  @Column({ type: 'jsonb', nullable: true })
  input?: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  output?: Record<string, unknown>;

  @Column({ type: 'integer', default: 0 })
  tokensIn!: number;

  @Column({ type: 'integer', default: 0 })
  tokensOut!: number;

  @Column({ type: 'float', default: 0 })
  cost!: number;
}

