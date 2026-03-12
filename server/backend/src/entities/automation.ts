import { Column, Entity, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from './base.js';
import { Home } from './home.js';
import { AutomationRun } from './automationRun.js';

export type AutomationSource = 'preset' | 'nl' | 'json';

@Entity('automations')
export class Automation extends BaseModel {
  @ManyToOne(() => Home, (home) => home.automations, { eager: true })
  declare home: Home;

  @Column({ type: 'varchar' })
  declare name: string;

  @Column({ type: 'boolean', default: true })
  declare enabled: boolean;

  @Column({ type: 'varchar', default: 'json' })
  declare source: AutomationSource;

  @Column({ type: 'jsonb', default: {} })
  declare definition: Record<string, unknown>;

  @Column({ type: 'varchar', nullable: true })
  scope?: string; // room/device/all

  @OneToMany(() => AutomationRun, (run) => run.automation)
  declare runs: AutomationRun[];
}

