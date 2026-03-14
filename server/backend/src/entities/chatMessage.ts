import type { UIMessage } from 'ai';
import { Column, Entity, ManyToOne } from 'typeorm';
import { BaseModel } from './base.js';
import { ChatSession } from './chatSession.js';

@Entity('chat_messages')
export class ChatMessage extends BaseModel {
  @ManyToOne(() => ChatSession, (session) => session.messages, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  declare session: ChatSession;

  @Column({ type: 'integer' })
  declare sequence: number;

  @Column({ type: 'varchar' })
  declare messageId: string;

  @Column({ type: 'varchar' })
  declare role: string;

  @Column({ type: 'jsonb' })
  declare payload: UIMessage;
}
