import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('service_types')
export class ServiceType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  name: string; // e.g. "Oil Change"

  @Column({ name: 'duration_min' })
  durationMin: number; // e.g. 60

  /** Technician must have ALL of these skills to qualify for this service */
  @Column('text', { array: true, name: 'required_skills', default: '{}' })
  requiredSkills: string[]; // e.g. ["OIL", "GENERAL"]

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
