import { Column, Entity, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from './base.js';
import { Home } from './home.js';
import { AutomationRun } from './automationRun.js';

export type AutomationSource = 'preset' | 'nl' | 'json';

@Entity('automations')
export class Automation extends BaseModel {
  @ManyToOne(() => Home, (home) => home.automations, { eager: true })
  home!: Home;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'varchar', default: 'json' })
  source!: AutomationSource;

  @Column({ type: 'jsonb', default: {} })
  definition!: Record<string, unknown>;

  @Column({ type: 'varchar', nullable: true })
  scope?: string; // room/device/all

  @OneToMany(() => AutomationRun, (run) => run.automation)
  runs!: AutomationRun[];
}

