import {
  BaseEntity,
  CreateDateColumn,
  PrimaryColumn,
  UpdateDateColumn,
  BeforeInsert,
} from 'typeorm';
import { nanoid } from 'nanoid';

export abstract class BaseModel extends BaseEntity {
  @PrimaryColumn({ type: 'varchar' })
  declare id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  declare updatedAt: Date;

  @BeforeInsert()
  assignId() {
    if (!this.id) this.id = nanoid();
  }
}

