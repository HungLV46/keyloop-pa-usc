import { BadRequestException, ConflictException, GoneException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { QueryFailedError } from 'typeorm';
import { fromZonedTime } from 'date-fns-tz';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../database/redis.provider';
import { Appointment } from './entities/appointment.entity';
import { AppointmentStatus } from './appointment-status.enum';
import { AppointmentRepository } from './appointment.repository';
import { ResourceRepository } from './resource.repository';
import { CheckAvailabilityDto } from './dto/check-availability.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

export interface AvailableSlot {
  slotStart: Date;
  slotEnd: Date;
  available: true;
}

/** Convert JS Date.getDay() (0 = Sunday) to app convention (0 = Monday) */
const toAppDayOfWeek = (jsDay: number): number => (jsDay + 6) % 7;

/**
 * Core business-logic service for the appointment domain.
 * Orchestrates the three-layer double-booking defense described in ADR-003:
 *   L1 – pre-lock availability revalidation (fast-fail)
 *   L2 – Redis distributed lock to serialise concurrent hold attempts
 *   L3 – PostgreSQL GiST exclusion constraint as the authoritative last resort
 *
 * Also owns a cron job that periodically expires overdue HOLDs.
 */
@Injectable()
export class AppointmentService {
  private readonly logger = new Logger(AppointmentService.name);

  constructor(
    private readonly appointmentRepo: AppointmentRepository,
    private readonly resourceRepo: ResourceRepository,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {}

  // ── 1. Check Availability ────────────────────────────────────────────────────

  async getAvailableSlots(dto: CheckAvailabilityDto, tenantId: string): Promise<AvailableSlot[]> {
    const [serviceType, dealership] = await Promise.all([this.resourceRepo.findServiceType(dto.serviceTypeId), this.resourceRepo.findDealership(dto.dealershipId, tenantId)]);
    if (!serviceType) throw new NotFoundException('Service type not found');
    if (!dealership) throw new NotFoundException('Dealership not found');

    // Resolve day name in the dealership's local timezone
    const dayAbbr = new Intl.DateTimeFormat('en', {
      weekday: 'short',
      timeZone: dealership.timezone,
    }).format(new Date(`${dto.date}T12:00:00Z`)); // noon UTC avoids date-boundary edge cases

    const DAY_MAP: Record<string, string> = {
      Mon: 'MON',
      Tue: 'TUE',
      Wed: 'WED',
      Thu: 'THU',
      Fri: 'FRI',
      Sat: 'SAT',
      Sun: 'SUN',
    };
    const hours = dealership.operatingHours?.[DAY_MAP[dayAbbr] ?? ''];
    if (!hours) return []; // dealership closed that day

    const candidateSlots = this.generateSlots(dto.date, hours.open, hours.close, serviceType.durationMin, dealership.timezone);

    const available: AvailableSlot[] = [];
    for (const slot of candidateSlots) {
      const pair = await this.resourceRepo.findAvailableResourcePair(dto.dealershipId, serviceType.requiredSkills, slot.start, slot.end, toAppDayOfWeek(slot.start.getDay()));
      if (pair) available.push({ slotStart: slot.start, slotEnd: slot.end, available: true });
    }
    return available;
  }

  // ── 2. Create Appointment with three-layer defense (ADR-003) ─────────────────

  /**
   * L1: Pre-lock availability revalidation
   *     Rejects stale-read attempts immediately; avoids acquiring a lock for hopeless requests.
   * L2: Short-lived Redis distributed lock
   *     Serializes concurrent hold attempts for the same slot across API instances.
   *     Falls through gracefully on Redis failure — L3 still protects correctness.
   * L3: PostgreSQL exclusion constraint on (bay × tstzrange) and (technician × tstzrange)
   *     Final authoritative rejection of overlapping HOLD/CONFIRMED rows.
   *     See migrations/001_initial_schema.sql for EXCLUDE USING gist definitions.
   */
  async createAppointment(dto: CreateAppointmentDto, customerId: string, tenantId: string): Promise<Appointment> {
    // Resolve dealership + service type up front (same as getAvailableSlots)
    const [serviceType, dealership] = await Promise.all([this.resourceRepo.findServiceType(dto.serviceTypeId), this.resourceRepo.findDealership(dto.dealershipId, tenantId)]);
    if (!serviceType) throw new NotFoundException('Service type not found');
    if (!dealership) throw new NotFoundException('Dealership not found');

    const dayAbbr = new Intl.DateTimeFormat('en', {
      weekday: 'short',
      timeZone: dealership.timezone,
    }).format(new Date(`${dto.date}T12:00:00Z`));

    const DAY_MAP: Record<string, string> = {
      Mon: 'MON',
      Tue: 'TUE',
      Wed: 'WED',
      Thu: 'THU',
      Fri: 'FRI',
      Sat: 'SAT',
      Sun: 'SUN',
    };
    const hours = dealership.operatingHours?.[DAY_MAP[dayAbbr] ?? ''];
    if (!hours) throw new ConflictException('Dealership is closed on the requested date');

    const candidateSlots = this.generateSlots(dto.date, hours.open, hours.close, serviceType.durationMin, dealership.timezone);

    // L1: Collect all slots that have a free resource pair (pre-lock revalidation)
    type SlotWithResources = { slotStart: Date; slotEnd: Date; technicianId: string; bayId: string };
    const availableSlots: SlotWithResources[] = [];
    for (const slot of candidateSlots) {
      const pair = await this.resourceRepo.findAvailableResourcePair(dto.dealershipId, serviceType.requiredSkills, slot.start, slot.end, toAppDayOfWeek(slot.start.getDay()));
      if (pair) availableSlots.push({ slotStart: slot.start, slotEnd: slot.end, technicianId: pair.technicianId, bayId: pair.bayId });
    }

    if (availableSlots.length === 0) throw new ConflictException('No availability for the requested date');

    const holdExpiresAt = new Date(Date.now() + this.config.get<number>('HOLD_TTL_MINUTES', 5) * 60_000);

    // L2 + L3: Try each slot — acquire Redis lock, then persist; move on if either fails
    for (const slot of availableSlots) {
      const lockKey = `lock:slot:${dto.dealershipId}:${slot.slotStart.toISOString()}`;
      const lockToken = await this.acquireLock(lockKey);
      if (!lockToken) continue; // slot locked by a concurrent request — try next

      try {
        // L3: DB write — exclusion constraint rejects overlapping HOLD/CONFIRMED rows
        return await this.appointmentRepo.createHold({
          tenantId,
          dealershipId: dto.dealershipId,
          customerId,
          vehicleId: dto.vehicleId,
          serviceTypeId: dto.serviceTypeId,
          technicianId: slot.technicianId,
          serviceBayId: slot.bayId,
          startTime: slot.slotStart,
          endTime: slot.slotEnd,
          holdExpiresAt,
        });
      } catch (err) {
        // PostgreSQL exclusion_violation (23P01): concurrent request committed first — try next slot
        if (err instanceof QueryFailedError && (err as any).code === '23P01') continue;
        throw err;
      } finally {
        await this.releaseLock(lockKey, lockToken);
      }
    }

    throw new ConflictException('No slots could be secured — all available slots are currently being booked');
  }

  // ── 3. Confirm Appointment ───────────────────────────────────────────────────

  async confirmAppointment(id: string, customerId: string): Promise<Appointment> {
    const appt = await this.appointmentRepo.findById(id);
    if (!appt || appt.customerId !== customerId) throw new NotFoundException('Appointment not found');
    if (appt.status !== AppointmentStatus.HOLD) {
      throw new BadRequestException(`Cannot confirm an appointment in ${appt.status} state`);
    }
    if (appt.holdExpiresAt && appt.holdExpiresAt < new Date()) {
      throw new GoneException('Hold has expired — please select a new slot');
    }
    return this.appointmentRepo.transition(id, AppointmentStatus.CONFIRMED);
  }

  // ── 4. Cancel Appointment ────────────────────────────────────────────────────

  async cancelAppointment(id: string, customerId: string): Promise<void> {
    const appt = await this.appointmentRepo.findById(id);
    if (!appt || appt.customerId !== customerId) throw new NotFoundException('Appointment not found');
    if (appt.status === AppointmentStatus.CANCELLED) {
      throw new BadRequestException('Appointment is already cancelled');
    }
    await this.appointmentRepo.transition(id, AppointmentStatus.CANCELLED);
  }

  // ── Background: Hold Expiry ──────────────────────────────────────────────────

  /** Scans every minute for HOLD rows past their TTL and marks them CANCELLED */
  @Cron(CronExpression.EVERY_MINUTE)
  async expireOverdueHolds(): Promise<void> {
    const expired = await this.appointmentRepo.expireOverdueHolds();
    if (expired > 0) this.logger.log(`Expired ${expired} overdue hold(s)`);
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Generates candidate 30-minute slot start times within the dealership's operating hours.
   * Slot end times must be <= close time. Times are interpreted in the dealership's timezone.
   */
  private generateSlots(date: string, openTime: string, closeTime: string, durationMin: number, timezone: string): Array<{ start: Date; end: Date }> {
    const openUtc = fromZonedTime(`${date}T${openTime}:00`, timezone);
    const closeUtc = fromZonedTime(`${date}T${closeTime}:00`, timezone);

    const slots: Array<{ start: Date; end: Date }> = [];
    let current = openUtc;

    while (current.getTime() + durationMin * 60_000 <= closeUtc.getTime()) {
      slots.push({
        start: new Date(current),
        end: new Date(current.getTime() + durationMin * 60_000),
      });
      current = new Date(current.getTime() + 30 * 60_000); // 30-minute increments
    }
    return slots;
  }

  /**
   * Acquires an exclusive Redis lock (SET NX PX).
   * Returns the lock token on success, or null if the lock is already held.
   * Falls through with a token on Redis failure so L3 (DB constraint) remains the final arbiter.
   */
  private async acquireLock(key: string): Promise<string | null> {
    const token = randomUUID();
    const ttlMs = this.config.get<number>('LOCK_TTL_MS', 500);
    try {
      const result = await this.redis.set(key, token, 'PX', ttlMs, 'NX');
      return result === 'OK' ? token : null;
    } catch {
      this.logger.warn('Redis unavailable — proceeding without lock; L3 (DB constraint) still active');
      return token;
    }
  }

  /** Releases the lock atomically — only if the token still matches (prevents stale release) */
  private async releaseLock(key: string, token: string): Promise<void> {
    const script = `if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end`;
    try {
      await this.redis.eval(script, 1, key, token);
    } catch {
      // Lock already expired via TTL — no action needed
    }
  }
}
