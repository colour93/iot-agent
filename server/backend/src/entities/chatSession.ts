import { Column, Entity, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from './base.js';
import { Home } from './home.js';
import { ChatMessage } from './chatMessage.js';

export const DEFAULT_CHAT_SESSION_TITLE = '新会话';

@Entity('chat_sessions')
export class ChatSession extends BaseModel {
  @ManyToOne(() => Home, (home) => home.chatSessions, {
    eager: true,
    nullable: false,
    onDelete: 'CASCADE',
  })
  declare home: Home;

  @Column({ type: 'varchar', default: DEFAULT_CHAT_SESSION_TITLE })
  declare title: string;

  @Column({ type: 'varchar', nullable: true })
  latestPreview?: string;

  @Column({ type: 'integer', default: 0 })
  declare messageCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastMessageAt?: Date;

  @OneToMany(() => ChatMessage, (message) => message.session)
  declare messages: ChatMessage[];
}
