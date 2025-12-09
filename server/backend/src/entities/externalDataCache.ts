import { Column, Entity } from 'typeorm';
import { BaseModel } from './base.js';

@Entity('external_data_cache')
export class ExternalDataCache extends BaseModel {
  @Column({ type: 'varchar' })
  source!: string; // weather/season/etc

  @Column({ type: 'varchar' })
  cacheKey!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'timestamptz' })
  expireAt!: Date;
}

