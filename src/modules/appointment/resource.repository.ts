import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Dealership } from '../resource/entities/dealership.entity';
import { ServiceType } from '../resource/entities/service-type.entity';

export interface ResourcePair {
  bayId: string;
  technicianId: string;
}

/**
 * Read-only resource queries used by AppointmentService.
 * Kept separate from the write-heavy AppointmentRepository to maintain
 * clear responsibility boundaries and to allow independent mocking in tests.
 */
@Injectable()
export class ResourceRepository {
  constructor(
    @InjectRepository(ServiceType) private readonly serviceTypeRepo: Repository<ServiceType>,
    @InjectRepository(Dealership) private readonly dealershipRepo: Repository<Dealership>,
    private readonly dataSource: DataSource,
  ) {}

  /** Looks up a ServiceType by id regardless of tenant — service types may be shared. */
  findServiceType(id: string): Promise<ServiceType | null> {
    return this.serviceTypeRepo.findOne({ where: { id } });
  }

  /** Looks up a Dealership by id scoped to the given tenant. */
  findDealership(id: string, tenantId: string): Promise<Dealership | null> {
    return this.dealershipRepo.findOne({ where: { id, tenantId } });
  }

  /**
   * Finds the first bay + qualified-technician pair that is free for the requested window.
   * Used for both L1 pre-lock revalidation and the L1+L2 re-check inside the lock.
   *
   * dayOfWeek: 0 = Monday … 6 = Sunday (app convention, matching TechnicianShift.dayOfWeek)
   */
  async findAvailableResourcePair(dealershipId: string, requiredSkills: string[], slotStart: Date, slotEnd: Date, dayOfWeek: number): Promise<ResourcePair | null> {
    // Extract time portion for shift boundary comparison
    const slotStartTime = slotStart.toISOString().substring(11, 19); // "HH:MM:SS"
    const slotEndTime = slotEnd.toISOString().substring(11, 19);

    const rows: Array<{ bay_id: string; technician_id: string }> = await this.dataSource.query(
      `
      SELECT sb.id AS bay_id, t.id AS technician_id
      FROM service_bays sb
      CROSS JOIN technicians t
      INNER JOIN technician_shifts ts
        ON ts.technician_id = t.id
       AND ts.day_of_week   = $4
       AND $5::time >= ts.start_time
       AND $6::time <= ts.end_time
      WHERE sb.dealership_id = $1
        AND sb.is_active     = true
        AND t.dealership_id  = $1
        AND t.is_active      = true
        AND t.skills @> $2::text[]
        AND NOT EXISTS (
          SELECT 1 FROM appointments a
          WHERE a.service_bay_id = sb.id
            AND a.status IN ('HOLD', 'CONFIRMED')
            AND tstzrange(a.start_time, a.end_time) && tstzrange($3, $7)
        )
        AND NOT EXISTS (
          SELECT 1 FROM appointments a
          WHERE a.technician_id = t.id
            AND a.status IN ('HOLD', 'CONFIRMED')
            AND tstzrange(a.start_time, a.end_time) && tstzrange($3, $7)
        )
      LIMIT 1
      `,
      [dealershipId, requiredSkills, slotStart, dayOfWeek, slotStartTime, slotEndTime, slotEnd],
    );

    return rows[0] ? { bayId: rows[0].bay_id, technicianId: rows[0].technician_id } : null;
  }
}
