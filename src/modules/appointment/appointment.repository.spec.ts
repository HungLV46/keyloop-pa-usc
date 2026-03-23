import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppointmentRepository } from './appointment.repository';
import { Appointment } from './entities/appointment.entity';
import { AppointmentStatus } from './appointment-status.enum';

const makeApptRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
});

describe('AppointmentRepository', () => {
  let repo: AppointmentRepository;
  let apptRepo: ReturnType<typeof makeApptRepo>;
  let mockManager: { findOne: jest.Mock; save: jest.Mock };
  let mockDataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    apptRepo = makeApptRepo();
    mockManager = { findOne: jest.fn(), save: jest.fn() };
    mockDataSource = {
      transaction: jest.fn().mockImplementation((fn: (m: typeof mockManager) => Promise<any>) => fn(mockManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AppointmentRepository, { provide: getRepositoryToken(Appointment), useValue: apptRepo }, { provide: DataSource, useValue: mockDataSource }],
    }).compile();

    repo = module.get<AppointmentRepository>(AppointmentRepository);
  });

  describe('createHold', () => {
    it('saves an appointment with HOLD status', async () => {
      const data = {
        tenantId: 't-1',
        dealershipId: 'd-1',
        customerId: 'c-1',
        vehicleId: 'v-1',
        serviceTypeId: 'st-1',
        technicianId: 'tech-1',
        serviceBayId: 'bay-1',
        startTime: new Date('2026-04-07T08:00:00Z'),
        endTime: new Date('2026-04-07T09:00:00Z'),
        holdExpiresAt: new Date('2026-04-07T08:05:00Z'),
      };
      const entity = { ...data, status: AppointmentStatus.HOLD };
      const saved = { id: 'appt-1', ...entity };

      apptRepo.create.mockReturnValue(entity);
      apptRepo.save.mockResolvedValue(saved);

      const result = await repo.createHold(data);

      expect(apptRepo.create).toHaveBeenCalledWith({ ...data, status: AppointmentStatus.HOLD });
      expect(apptRepo.save).toHaveBeenCalledWith(entity);
      expect(result).toEqual(saved);
    });
  });

  describe('findById', () => {
    it('returns the appointment when found', async () => {
      const appt = { id: 'appt-1', status: AppointmentStatus.HOLD };
      apptRepo.findOne.mockResolvedValue(appt);

      const result = await repo.findById('appt-1');

      expect(apptRepo.findOne).toHaveBeenCalledWith({ where: { id: 'appt-1' } });
      expect(result).toEqual(appt);
    });

    it('returns null when not found', async () => {
      apptRepo.findOne.mockResolvedValue(null);

      const result = await repo.findById('missing-appt');

      expect(result).toBeNull();
    });
  });

  describe('transition', () => {
    it('transitions to CONFIRMED and clears holdExpiresAt', async () => {
      const appt = {
        id: 'appt-1',
        status: AppointmentStatus.HOLD,
        holdExpiresAt: new Date('2026-04-07T08:05:00Z'),
      };
      const saved = { ...appt, status: AppointmentStatus.CONFIRMED, holdExpiresAt: null };

      mockManager.findOne.mockResolvedValue(appt);
      mockManager.save.mockResolvedValue(saved);

      const result = await repo.transition('appt-1', AppointmentStatus.CONFIRMED);

      expect(appt.status).toBe(AppointmentStatus.CONFIRMED);
      expect(appt.holdExpiresAt).toBeNull();
      expect(mockManager.save).toHaveBeenCalledWith(appt);
      expect(result).toEqual(saved);
    });

    it('throws NotFoundException when appointment does not exist in the transaction', async () => {
      mockManager.findOne.mockResolvedValue(null);

      await expect(repo.transition('missing-appt', AppointmentStatus.CONFIRMED)).rejects.toThrow(NotFoundException);
    });
  });

  describe('expireOverdueHolds', () => {
    it('returns the number of expired holds', async () => {
      apptRepo.update.mockResolvedValue({ affected: 4 });

      const count = await repo.expireOverdueHolds();

      expect(count).toBe(4);
    });

    it('returns 0 when affected is undefined', async () => {
      apptRepo.update.mockResolvedValue({ affected: undefined });

      const count = await repo.expireOverdueHolds();

      expect(count).toBe(0);
    });

    it('only targets HOLD status rows past their TTL', async () => {
      apptRepo.update.mockResolvedValue({ affected: 0 });

      await repo.expireOverdueHolds();

      const [whereClause, updateClause] = apptRepo.update.mock.calls[0];
      expect(whereClause).toMatchObject({ status: AppointmentStatus.HOLD });
      expect(updateClause).toEqual({ status: AppointmentStatus.CANCELLED, holdExpiresAt: null });
    });
  });
});
