import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { Appointment } from './entities/appointment.entity';
import { AppointmentStatus } from './appointment-status.enum';

export interface CreateHoldData {
  tenantId: string;
  dealershipId: string;
  customerId: string;
  vehicleId: string;
  serviceTypeId: string;
  technicianId: string;
  serviceBayId: string;
  startTime: Date;
  endTime: Date;
  holdExpiresAt: Date;
}

/**
 * Data-access layer for the Appointment aggregate.
 * Wraps TypeORM operations and exposes only the persistence actions the
 * service layer needs: create a hold, look up by id, transition state, and
 * batch-expire overdue holds via the cron job.
 */
@Injectable()
export class AppointmentRepository {
  constructor(
    @InjectRepository(Appointment) private readonly repo: Repository<Appointment>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Inserts the appointment directly in HOLD state.
   * The PostgreSQL exclusion constraint (migrations/001_initial_schema.sql) rejects this
   * write if another HOLD or CONFIRMED row overlaps the same bay or technician window (L3).
   */
  async createHold(data: CreateHoldData): Promise<Appointment> {
    return this.repo.save(this.repo.create({ ...data, status: AppointmentStatus.HOLD }));
  }

  /** Looks up an appointment by primary key; returns null when not found. */
  async findById(id: string): Promise<Appointment | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** Transitions state inside a pessimistic-write transaction to prevent lost updates */
  async transition(id: string, toStatus: AppointmentStatus): Promise<Appointment> {
    return this.dataSource.transaction(async (manager) => {
      const appt = await manager.findOne(Appointment, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!appt) throw new NotFoundException('Appointment not found');

      appt.status = toStatus;
      if (toStatus !== AppointmentStatus.HOLD) appt.holdExpiresAt = null;
      return manager.save(appt);
    });
  }

  /** Called by the hold-expiry cron — marks expired HOLDs as CANCELLED, restoring capacity */
  async expireOverdueHolds(): Promise<number> {
    const result = await this.repo.update({ status: AppointmentStatus.HOLD, holdExpiresAt: LessThan(new Date()) }, { status: AppointmentStatus.CANCELLED, holdExpiresAt: null });
    return result.affected ?? 0;
  }
}
