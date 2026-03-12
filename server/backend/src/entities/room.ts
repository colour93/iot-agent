import { Column, Entity, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from './base.js';
import { Home } from './home.js';
import { Device } from './device.js';

@Entity('rooms')
export class Room extends BaseModel {
  @Column({ type: 'varchar' })
  declare name: string;

  @Column({ type: 'varchar', nullable: true })
  floor?: string;

  @Column({ type: 'varchar', nullable: true })
  type?: string;

  @ManyToOne(() => Home, (home) => home.rooms, { eager: true })
  declare home: Home;

  @OneToMany(() => Device, (device) => device.room)
  declare devices: Device[];
}

