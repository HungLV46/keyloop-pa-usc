import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Dealership } from './dealership.entity';

@Entity('service_bays')
export class ServiceBay {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'dealership_id' })
  dealershipId: string;

  @ManyToOne(() => Dealership, (d) => d.serviceBays)
  @JoinColumn({ name: 'dealership_id' })
  dealership: Dealership;

  @Column()
  name: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
