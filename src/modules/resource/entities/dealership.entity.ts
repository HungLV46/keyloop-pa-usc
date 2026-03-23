import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { ServiceBay } from './service-bay.entity';
import { Technician } from './technician.entity';

export type OperatingHours = Record<string, { open: string; close: string }>;

@Entity('dealerships')
export class Dealership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Injected from JWT; enables future row-level multi-tenancy with no schema changes */
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  name: string;

  @Column()
  timezone: string; // IANA timezone, e.g. "Europe/London"

  @Column({ type: 'jsonb', name: 'operating_hours', nullable: true })
  operatingHours: OperatingHours; // { "MON": { "open": "08:00", "close": "18:00" }, ... }

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => ServiceBay, (bay) => bay.dealership)
  serviceBays: ServiceBay[];

  @OneToMany(() => Technician, (tech) => tech.dealership)
  technicians: Technician[];
}
