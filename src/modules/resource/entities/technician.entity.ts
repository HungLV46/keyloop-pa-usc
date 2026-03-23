import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Dealership } from './dealership.entity';
import { TechnicianShift } from './technician-shift.entity';

@Entity('technicians')
export class Technician {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'dealership_id' })
  dealershipId: string;

  @ManyToOne(() => Dealership, (d) => d.technicians)
  @JoinColumn({ name: 'dealership_id' })
  dealership: Dealership;

  @Column()
  name: string;

  /** Technician is qualified if their skills contain all of the ServiceType's required_skills */
  @Column('text', { array: true, default: '{}' })
  skills: string[]; // e.g. ["EV", "BRAKE", "OIL"]

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => TechnicianShift, (shift) => shift.technician, { cascade: true })
  shifts: TechnicianShift[];
}
