import { Column, Entity } from 'typeorm';
import { BaseModel } from './base.js';

@Entity('external_data_cache')
export class ExternalDataCache extends BaseModel {
  @Column({ type: 'varchar' })
  declare source: string; // weather/season/etc

  @Column({ type: 'varchar' })
  declare cacheKey: string;

  @Column({ type: 'jsonb' })
  declare payload: Record<string, unknown>;

  @Column({ type: 'timestamptz' })
  declare expireAt: Date;
}

