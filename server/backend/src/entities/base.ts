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
  id!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @BeforeInsert()
  assignId() {
    if (!this.id) this.id = nanoid();
  }
}

