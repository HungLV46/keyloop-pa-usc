import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Technician } from './technician.entity';

@Entity('technician_shifts')
export class TechnicianShift {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'technician_id' })
  technicianId: string;

  @ManyToOne(() => Technician, (t) => t.shifts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'technician_id' })
  technician: Technician;

  /** 0 = Monday, 1 = Tuesday, …, 6 = Sunday (dealership local timezone) */
  @Column({ name: 'day_of_week', type: 'smallint' })
  dayOfWeek: number;

  /** Local dealership time, e.g. "08:00:00" */
  @Column({ name: 'start_time', type: 'time' })
  startTime: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime: string;
}
