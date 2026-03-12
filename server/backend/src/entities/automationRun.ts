import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseModel } from './base.js';
import { Automation } from './automation.js';

@Entity('automation_runs')
export class AutomationRun extends BaseModel {
  @ManyToOne(() => Automation, (automation) => automation.runs, { eager: true })
  declare automation: Automation;

  @Column({ type: 'jsonb', nullable: true })
  input?: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  output?: Record<string, unknown>;

  @Column({ type: 'varchar', default: 'pending' })
  declare status: 'pending' | 'running' | 'succeeded' | 'failed';

  @Column({ type: 'timestamptz', nullable: true })
  executedAt?: Date;
}

