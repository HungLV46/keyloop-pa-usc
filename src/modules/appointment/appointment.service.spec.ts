import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, GoneException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueryFailedError } from 'typeorm';
import { AppointmentService } from './appointment.service';
import { AppointmentRepository } from './appointment.repository';
import { ResourceRepository } from './resource.repository';
import { REDIS_CLIENT } from '../../database/redis.provider';
import { AppointmentStatus } from './appointment-status.enum';
import { Appointment } from './entities/appointment.entity';
import { Dealership } from '../resource/entities/dealership.entity';
import { ServiceType } from '../resource/entities/service-type.entity';

const DEALERSHIP_ID = 'a1b2c3d4-0000-0000-0000-000000000001';
const SERVICE_TYPE_ID = 'e5f6f7f8-0000-0000-0000-000000000002';
const CUSTOMER_ID = 'cust-1';
const TENANT_ID = 'tenant-1';
const VEHICLE_ID = 'v9w0x1y2-0000-0000-0000-000000000003';

const mockDealership: Partial<Dealership> = {
  id: DEALERSHIP_ID,
  tenantId: TENANT_ID,
  timezone: 'UTC',
  // April 7, 2026 is a Tuesday – TUE hours are used for slot generation
  operatingHours: { TUE: { open: '08:00', close: '10:00' } } as any,
};

const mockServiceType: Partial<ServiceType> = {
  id: SERVICE_TYPE_ID,
  durationMin: 60,
  requiredSkills: ['OIL'],
};

const mockAppointmentRepo = {
  createHold: jest.fn(),
  findById: jest.fn(),
  transition: jest.fn(),
  expireOverdueHolds: jest.fn(),
};

const mockResourceRepo = {
  findServiceType: jest.fn(),
  findDealership: jest.fn(),
  findAvailableResourcePair: jest.fn(),
};

const mockRedis = {
  set: jest.fn(),
  eval: jest.fn(),
};

const mockConfig = {
  get: jest.fn((key: string, defaultValue?: any) => defaultValue),
};

describe('AppointmentService', () => {
  let service: AppointmentService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentService,
        { provide: AppointmentRepository, useValue: mockAppointmentRepo },
        { provide: ResourceRepository, useValue: mockResourceRepo },
        { provide: REDIS_CLIENT, useValue: mockRedis },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    // Suppress cron registration noise in test output
    service = module.get<AppointmentService>(AppointmentService);
  });

  // ── getAvailableSlots ────────────────────────────────────────────────────────

  describe('getAvailableSlots', () => {
    const dto = { dealershipId: DEALERSHIP_ID, serviceTypeId: SERVICE_TYPE_ID, date: '2026-04-07' };

    it('throws NotFoundException when service type does not exist', async () => {
      mockResourceRepo.findServiceType.mockResolvedValue(null);
      mockResourceRepo.findDealership.mockResolvedValue(mockDealership);

      await expect(service.getAvailableSlots(dto, TENANT_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when dealership does not exist', async () => {
      mockResourceRepo.findServiceType.mockResolvedValue(mockServiceType);
      mockResourceRepo.findDealership.mockResolvedValue(null);

      await expect(service.getAvailableSlots(dto, TENANT_ID)).rejects.toThrow(NotFoundException);
    });

    it('returns an empty array when the dealership is closed that day', async () => {
      mockResourceRepo.findServiceType.mockResolvedValue(mockServiceType);
      mockResourceRepo.findDealership.mockResolvedValue({
        ...mockDealership,
        operatingHours: { MON: { open: '08:00', close: '17:00' } }, // only Monday; April 7 is Tuesday
      });

      const result = await service.getAvailableSlots(dto, TENANT_ID);

      expect(result).toEqual([]);
      expect(mockResourceRepo.findAvailableResourcePair).not.toHaveBeenCalled();
    });

    it('returns available slots when resource pairs are free', async () => {
      mockResourceRepo.findServiceType.mockResolvedValue(mockServiceType);
      mockResourceRepo.findDealership.mockResolvedValue(mockDealership);
      mockResourceRepo.findAvailableResourcePair.mockResolvedValue({ bayId: 'b-1', technicianId: 't-1' });

      const result = await service.getAvailableSlots(dto, TENANT_ID);

      // 08:00→09:00, 08:30→09:30, 09:00→10:00 — three 60-min slots in a 2-hour window
      expect(result).toHaveLength(3);
      result.forEach((slot) => expect(slot.available).toBe(true));
      expect(result[0].slotStart).toEqual(new Date('2026-04-07T08:00:00.000Z'));
      expect(result[0].slotEnd).toEqual(new Date('2026-04-07T09:00:00.000Z'));
    });

    it('excludes slots where no resource pair is free', async () => {
      mockResourceRepo.findServiceType.mockResolvedValue(mockServiceType);
      mockResourceRepo.findDealership.mockResolvedValue(mockDealership);
      mockResourceRepo.findAvailableResourcePair.mockResolvedValue(null);

      const result = await service.getAvailableSlots(dto, TENANT_ID);

      expect(result).toHaveLength(0);
    });
  });

  // ── createAppointment ────────────────────────────────────────────────────────
  // April 7 2026 is a Tuesday; mockDealership has TUE: 08:00–10:00, durationMin=60
  // → 3 candidate slots: 08:00-09:00, 08:30-09:30, 09:00-10:00

  describe('createAppointment', () => {
    const dto = {
      dealershipId: DEALERSHIP_ID,
      vehicleId: VEHICLE_ID,
      serviceTypeId: SERVICE_TYPE_ID,
      date: '2026-04-07',
    };

    const savedAppt: Partial<Appointment> = {
      id: 'appt-1',
      status: AppointmentStatus.HOLD,
      dealershipId: DEALERSHIP_ID,
      customerId: CUSTOMER_ID,
    };

    // ── resource resolution ──────────────────────────────────────────────────

    it('throws NotFoundException when service type does not exist', async () => {
      mockResourceRepo.findServiceType.mockResolvedValue(null);
      mockResourceRepo.findDealership.mockResolvedValue(mockDealership);

      await expect(service.createAppointment(dto, CUSTOMER_ID, TENANT_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when dealership does not exist', async () => {
      mockResourceRepo.findServiceType.mockResolvedValue(mockServiceType);
      mockResourceRepo.findDealership.mockResolvedValue(null);

      await expect(service.createAppointment(dto, CUSTOMER_ID, TENANT_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when the dealership is closed on the requested date', async () => {
      mockResourceRepo.findServiceType.mockResolvedValue(mockServiceType);
      mockResourceRepo.findDealership.mockResolvedValue({
        ...mockDealership,
        operatingHours: { MON: { open: '08:00', close: '17:00' } }, // only Monday; Apr 7 is Tuesday
      });

      await expect(service.createAppointment(dto, CUSTOMER_ID, TENANT_ID)).rejects.toThrow(ConflictException);
    });

    // ── L1: pre-lock availability check ─────────────────────────────────────

    it('throws ConflictException (no availability) when no slot has a free resource pair', async () => {
      mockResourceRepo.findServiceType.mockResolvedValue(mockServiceType);
      mockResourceRepo.findDealership.mockResolvedValue(mockDealership);
      mockResourceRepo.findAvailableResourcePair.mockResolvedValue(null); // all 3 slots occupied

      await expect(service.createAppointment(dto, CUSTOMER_ID, TENANT_ID)).rejects.toThrow(
        new ConflictException('No availability for the requested date'),
      );
      expect(mockRedis.set).not.toHaveBeenCalled(); // never reached L2
    });

    // ── L2: Redis lock per slot ──────────────────────────────────────────────

    it('books the first slot when the lock is acquired immediately', async () => {
      mockResourceRepo.findServiceType.mockResolvedValue(mockServiceType);
      mockResourceRepo.findDealership.mockResolvedValue(mockDealership);
      mockResourceRepo.findAvailableResourcePair.mockResolvedValue({ bayId: 'b-1', technicianId: 't-1' });
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);
      mockAppointmentRepo.createHold.mockResolvedValue(savedAppt);

      const result = await service.createAppointment(dto, CUSTOMER_ID, TENANT_ID);

      expect(mockAppointmentRepo.createHold).toHaveBeenCalledTimes(1);
      expect(mockAppointmentRepo.createHold).toHaveBeenCalledWith(
        expect.objectContaining({
          dealershipId: DEALERSHIP_ID,
          customerId: CUSTOMER_ID,
          vehicleId: VEHICLE_ID,
          serviceTypeId: SERVICE_TYPE_ID,
          technicianId: 't-1',
          serviceBayId: 'b-1',
          startTime: new Date('2026-04-07T08:00:00.000Z'),
          endTime: new Date('2026-04-07T09:00:00.000Z'),
        }),
      );
      expect(mockRedis.eval).toHaveBeenCalledTimes(1); // lock released
      expect(result).toEqual(savedAppt);
    });

    it('skips a slot whose Redis lock is held and books the next available slot', async () => {
      mockResourceRepo.findServiceType.mockResolvedValue(mockServiceType);
      mockResourceRepo.findDealership.mockResolvedValue(mockDealership);
      mockResourceRepo.findAvailableResourcePair.mockResolvedValue({ bayId: 'b-1', technicianId: 't-1' });
      // slot 1 locked by a concurrent request, slot 2 free
      mockRedis.set.mockResolvedValueOnce(null).mockResolvedValueOnce('OK');
      mockRedis.eval.mockResolvedValue(1);
      mockAppointmentRepo.createHold.mockResolvedValue(savedAppt);

      const result = await service.createAppointment(dto, CUSTOMER_ID, TENANT_ID);

      expect(mockAppointmentRepo.createHold).toHaveBeenCalledTimes(1);
      expect(mockAppointmentRepo.createHold).toHaveBeenCalledWith(
        expect.objectContaining({ startTime: new Date('2026-04-07T08:30:00.000Z') }),
      );
      expect(result).toEqual(savedAppt);
    });

    it('throws ConflictException when all slots are locked by concurrent requests', async () => {
      mockResourceRepo.findServiceType.mockResolvedValue(mockServiceType);
      mockResourceRepo.findDealership.mockResolvedValue(mockDealership);
      mockResourceRepo.findAvailableResourcePair.mockResolvedValue({ bayId: 'b-1', technicianId: 't-1' });
      mockRedis.set.mockResolvedValue(null); // every slot lock attempt fails

      await expect(service.createAppointment(dto, CUSTOMER_ID, TENANT_ID)).rejects.toThrow(ConflictException);
      expect(mockAppointmentRepo.createHold).not.toHaveBeenCalled();
    });

    it('falls through to L3 when Redis is unavailable (proceeds without lock)', async () => {
      mockResourceRepo.findServiceType.mockResolvedValue(mockServiceType);
      mockResourceRepo.findDealership.mockResolvedValue(mockDealership);
      mockResourceRepo.findAvailableResourcePair.mockResolvedValue({ bayId: 'b-1', technicianId: 't-1' });
      mockRedis.set.mockRejectedValue(new Error('Redis connection refused'));
      mockRedis.eval.mockResolvedValue(0);
      mockAppointmentRepo.createHold.mockResolvedValue(savedAppt);

      const result = await service.createAppointment(dto, CUSTOMER_ID, TENANT_ID);

      expect(result).toEqual(savedAppt);
    });

    // ── L3: PostgreSQL exclusion constraint ──────────────────────────────────

    it('skips a slot that hits a 23P01 exclusion violation and books the next slot', async () => {
      const pgError = Object.assign(new QueryFailedError('INSERT', [], {}), { code: '23P01' });

      mockResourceRepo.findServiceType.mockResolvedValue(mockServiceType);
      mockResourceRepo.findDealership.mockResolvedValue(mockDealership);
      mockResourceRepo.findAvailableResourcePair.mockResolvedValue({ bayId: 'b-1', technicianId: 't-1' });
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);
      // slot 1 → exclusion violation, slot 2 → success
      mockAppointmentRepo.createHold.mockRejectedValueOnce(pgError).mockResolvedValueOnce(savedAppt);

      const result = await service.createAppointment(dto, CUSTOMER_ID, TENANT_ID);

      expect(mockAppointmentRepo.createHold).toHaveBeenCalledTimes(2);
      expect(result).toEqual(savedAppt);
    });

    it('throws ConflictException when all slots hit 23P01 exclusion violations', async () => {
      const pgError = Object.assign(new QueryFailedError('INSERT', [], {}), { code: '23P01' });

      mockResourceRepo.findServiceType.mockResolvedValue(mockServiceType);
      mockResourceRepo.findDealership.mockResolvedValue(mockDealership);
      mockResourceRepo.findAvailableResourcePair.mockResolvedValue({ bayId: 'b-1', technicianId: 't-1' });
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);
      mockAppointmentRepo.createHold.mockRejectedValue(pgError);

      await expect(service.createAppointment(dto, CUSTOMER_ID, TENANT_ID)).rejects.toThrow(ConflictException);
      expect(mockAppointmentRepo.createHold).toHaveBeenCalledTimes(3); // tried all 3 slots
    });

    it('propagates unexpected DB errors immediately without trying the next slot', async () => {
      const dbError = new Error('unexpected DB error');

      mockResourceRepo.findServiceType.mockResolvedValue(mockServiceType);
      mockResourceRepo.findDealership.mockResolvedValue(mockDealership);
      mockResourceRepo.findAvailableResourcePair.mockResolvedValue({ bayId: 'b-1', technicianId: 't-1' });
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);
      mockAppointmentRepo.createHold.mockRejectedValue(dbError);

      await expect(service.createAppointment(dto, CUSTOMER_ID, TENANT_ID)).rejects.toThrow('unexpected DB error');
      expect(mockAppointmentRepo.createHold).toHaveBeenCalledTimes(1); // bailed out on first slot
    });

    it('releases the Redis lock even when the DB write throws an unexpected error', async () => {
      mockResourceRepo.findServiceType.mockResolvedValue(mockServiceType);
      mockResourceRepo.findDealership.mockResolvedValue(mockDealership);
      mockResourceRepo.findAvailableResourcePair.mockResolvedValue({ bayId: 'b-1', technicianId: 't-1' });
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.eval.mockResolvedValue(1);
      mockAppointmentRepo.createHold.mockRejectedValue(new Error('DB error'));

      await expect(service.createAppointment(dto, CUSTOMER_ID, TENANT_ID)).rejects.toThrow('DB error');
      expect(mockRedis.eval).toHaveBeenCalledTimes(1); // lock released in finally
    });
  });

  // ── confirmAppointment ───────────────────────────────────────────────────────

  describe('confirmAppointment', () => {
    it('throws NotFoundException when appointment does not exist', async () => {
      mockAppointmentRepo.findById.mockResolvedValue(null);

      await expect(service.confirmAppointment('appt-1', CUSTOMER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when appointment belongs to a different customer', async () => {
      mockAppointmentRepo.findById.mockResolvedValue({ id: 'appt-1', customerId: 'other-customer', status: AppointmentStatus.HOLD });

      await expect(service.confirmAppointment('appt-1', CUSTOMER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when appointment is not in HOLD state', async () => {
      mockAppointmentRepo.findById.mockResolvedValue({
        id: 'appt-1',
        customerId: CUSTOMER_ID,
        status: AppointmentStatus.CONFIRMED,
      });

      await expect(service.confirmAppointment('appt-1', CUSTOMER_ID)).rejects.toThrow(BadRequestException);
    });

    it('throws GoneException when the hold TTL has expired', async () => {
      mockAppointmentRepo.findById.mockResolvedValue({
        id: 'appt-1',
        customerId: CUSTOMER_ID,
        status: AppointmentStatus.HOLD,
        holdExpiresAt: new Date('2020-01-01T00:00:00Z'), // in the past
      });

      await expect(service.confirmAppointment('appt-1', CUSTOMER_ID)).rejects.toThrow(GoneException);
    });

    it('confirms a valid HOLD appointment', async () => {
      const confirmed: Partial<Appointment> = { id: 'appt-1', status: AppointmentStatus.CONFIRMED };
      mockAppointmentRepo.findById.mockResolvedValue({
        id: 'appt-1',
        customerId: CUSTOMER_ID,
        status: AppointmentStatus.HOLD,
        holdExpiresAt: new Date(Date.now() + 60_000), // valid TTL
      });
      mockAppointmentRepo.transition.mockResolvedValue(confirmed);

      const result = await service.confirmAppointment('appt-1', CUSTOMER_ID);

      expect(mockAppointmentRepo.transition).toHaveBeenCalledWith('appt-1', AppointmentStatus.CONFIRMED);
      expect(result).toEqual(confirmed);
    });
  });

  // ── cancelAppointment ────────────────────────────────────────────────────────

  describe('cancelAppointment', () => {
    it('throws NotFoundException when appointment does not exist', async () => {
      mockAppointmentRepo.findById.mockResolvedValue(null);

      await expect(service.cancelAppointment('appt-1', CUSTOMER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when appointment belongs to a different customer', async () => {
      mockAppointmentRepo.findById.mockResolvedValue({ id: 'appt-1', customerId: 'other-customer', status: AppointmentStatus.HOLD });

      await expect(service.cancelAppointment('appt-1', CUSTOMER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when appointment is already cancelled', async () => {
      mockAppointmentRepo.findById.mockResolvedValue({
        id: 'appt-1',
        customerId: CUSTOMER_ID,
        status: AppointmentStatus.CANCELLED,
      });

      await expect(service.cancelAppointment('appt-1', CUSTOMER_ID)).rejects.toThrow(BadRequestException);
    });

    it('cancels a HOLD appointment', async () => {
      mockAppointmentRepo.findById.mockResolvedValue({
        id: 'appt-1',
        customerId: CUSTOMER_ID,
        status: AppointmentStatus.HOLD,
      });
      mockAppointmentRepo.transition.mockResolvedValue(undefined);

      await service.cancelAppointment('appt-1', CUSTOMER_ID);

      expect(mockAppointmentRepo.transition).toHaveBeenCalledWith('appt-1', AppointmentStatus.CANCELLED);
    });

    it('cancels a CONFIRMED appointment', async () => {
      mockAppointmentRepo.findById.mockResolvedValue({
        id: 'appt-1',
        customerId: CUSTOMER_ID,
        status: AppointmentStatus.CONFIRMED,
      });
      mockAppointmentRepo.transition.mockResolvedValue(undefined);

      await service.cancelAppointment('appt-1', CUSTOMER_ID);

      expect(mockAppointmentRepo.transition).toHaveBeenCalledWith('appt-1', AppointmentStatus.CANCELLED);
    });
  });

  // ── expireOverdueHolds (cron) ─────────────────────────────────────────────────

  describe('expireOverdueHolds', () => {
    it('delegates expiry to AppointmentRepository', async () => {
      mockAppointmentRepo.expireOverdueHolds.mockResolvedValue(2);

      await service.expireOverdueHolds();

      expect(mockAppointmentRepo.expireOverdueHolds).toHaveBeenCalled();
    });

    it('does not throw when there are no expired holds', async () => {
      mockAppointmentRepo.expireOverdueHolds.mockResolvedValue(0);

      await expect(service.expireOverdueHolds()).resolves.not.toThrow();
    });
  });
});
