import { Column, Entity, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from './base.js';
import { Home } from './home.js';
import { Device } from './device.js';

@Entity('rooms')
export class Room extends BaseModel {
  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'varchar', nullable: true })
  floor?: string;

  @Column({ type: 'varchar', nullable: true })
  type?: string;

  @ManyToOne(() => Home, (home) => home.rooms, { eager: true })
  home!: Home;

  @OneToMany(() => Device, (device) => device.room)
  devices!: Device[];
}

