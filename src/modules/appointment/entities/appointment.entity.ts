import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentStatus } from '../appointment-status.enum';

/**
 * Represents a single service appointment for a customer vehicle.
 * Lifecycle: HOLD → CONFIRMED | CANCELLED (or HOLD expires via TTL cron).
 *
 * Composite indexes on (serviceBayId, startTime, status) and
 * (technicianId, startTime, status) support the availability query.
 * Hard double-booking prevention is enforced by GiST exclusion constraints
 * defined in migrations/001_initial_schema.sql.
 */
@Entity('appointments')
@Index(['serviceBayId', 'startTime', 'status'])
@Index(['technicianId', 'startTime', 'status'])
export class Appointment {
  @ApiProperty({ example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'tenant-001' })
  @Column({ name: 'tenant_id', type: 'varchar', nullable: true })
  tenantId: string | null;

  @ApiProperty()
  @Column({ name: 'dealership_id' })
  dealershipId: string;

  @ApiProperty({ description: 'Customer ID (cross-service reference, sourced from JWT sub)' })
  @Column({ name: 'customer_id' })
  customerId: string;

  @ApiProperty({ description: 'Vehicle ID (cross-service reference)' })
  @Column({ name: 'vehicle_id' })
  vehicleId: string;

  @ApiPropertyOptional({ description: 'Assigned during CREATED → HOLD; null before hold is acquired' })
  @Column({ name: 'technician_id', type: 'varchar', nullable: true })
  technicianId: string | null;

  @ApiPropertyOptional({ description: 'Assigned during CREATED → HOLD; null before hold is acquired' })
  @Column({ name: 'service_bay_id', type: 'varchar', nullable: true })
  serviceBayId: string | null;

  @ApiProperty()
  @Column({ name: 'service_type_id' })
  serviceTypeId: string;

  @ApiProperty({ example: '2026-04-07T09:00:00.000Z' })
  @Column({ name: 'start_time', type: 'timestamptz' })
  startTime: Date;

  @ApiProperty({ example: '2026-04-07T10:00:00.000Z' })
  @Column({ name: 'end_time', type: 'timestamptz' })
  endTime: Date;

  @ApiProperty({ enum: AppointmentStatus, example: AppointmentStatus.HOLD })
  @Column({
    type: 'enum',
    enum: AppointmentStatus,
    default: AppointmentStatus.CREATED,
  })
  status: AppointmentStatus;

  @ApiPropertyOptional({
    example: '2026-04-07T09:05:00.000Z',
    description: 'Populated only when status=HOLD. Cron expires HOLDs past this time.',
  })
  @Column({ name: 'hold_expires_at', type: 'timestamptz', nullable: true })
  holdExpiresAt: Date | null;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty()
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
