import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ResourceService } from './resource.service';
import { Dealership } from '../entities/dealership.entity';
import { ServiceBay } from '../entities/service-bay.entity';
import { ServiceType } from '../entities/service-type.entity';
import { Technician } from '../entities/technician.entity';

const makeRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
});

describe('ResourceService', () => {
  let service: ResourceService;
  let dealershipRepo: ReturnType<typeof makeRepo>;
  let serviceBayRepo: ReturnType<typeof makeRepo>;
  let serviceTypeRepo: ReturnType<typeof makeRepo>;
  let technicianRepo: ReturnType<typeof makeRepo>;

  beforeEach(async () => {
    dealershipRepo = makeRepo();
    serviceBayRepo = makeRepo();
    serviceTypeRepo = makeRepo();
    technicianRepo = makeRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceService,
        { provide: getRepositoryToken(Dealership), useValue: dealershipRepo },
        { provide: getRepositoryToken(ServiceBay), useValue: serviceBayRepo },
        { provide: getRepositoryToken(ServiceType), useValue: serviceTypeRepo },
        { provide: getRepositoryToken(Technician), useValue: technicianRepo },
      ],
    }).compile();

    service = module.get<ResourceService>(ResourceService);
  });

  // ── Dealerships ─────────────────────────────────────────────────────────────

  describe('createDealership', () => {
    it('merges tenantId and persists the dealership', async () => {
      const dto = { name: 'Acme Auto', timezone: 'Europe/London' };
      const entity = { ...dto, tenantId: 'tenant-1' };
      const saved = { id: 'uuid-1', ...entity, isActive: true };

      dealershipRepo.create.mockReturnValue(entity);
      dealershipRepo.save.mockResolvedValue(saved);

      const result = await service.createDealership(dto, 'tenant-1');

      expect(dealershipRepo.create).toHaveBeenCalledWith({ ...dto, tenantId: 'tenant-1' });
      expect(dealershipRepo.save).toHaveBeenCalledWith(entity);
      expect(result).toEqual(saved);
    });
  });

  describe('findDealerships', () => {
    it('queries by tenantId and isActive=true', async () => {
      const rows = [{ id: 'uuid-1', tenantId: 'tenant-1', isActive: true }];
      dealershipRepo.find.mockResolvedValue(rows);

      const result = await service.findDealerships('tenant-1');

      expect(dealershipRepo.find).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1', isActive: true } });
      expect(result).toEqual(rows);
    });
  });

  describe('findDealership', () => {
    it('returns the dealership when found', async () => {
      const row = { id: 'uuid-1', tenantId: 'tenant-1' };
      dealershipRepo.findOne.mockResolvedValue(row);

      const result = await service.findDealership('uuid-1', 'tenant-1');

      expect(dealershipRepo.findOne).toHaveBeenCalledWith({ where: { id: 'uuid-1', tenantId: 'tenant-1' } });
      expect(result).toEqual(row);
    });

    it('throws NotFoundException when dealership does not exist', async () => {
      dealershipRepo.findOne.mockResolvedValue(null);

      await expect(service.findDealership('missing-id', 'tenant-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteDealership', () => {
    it('soft-deletes by setting isActive=false', async () => {
      dealershipRepo.findOne.mockResolvedValue({ id: 'uuid-1', tenantId: 'tenant-1', isActive: true });
      dealershipRepo.update.mockResolvedValue({ affected: 1 });

      await service.deleteDealership('uuid-1', 'tenant-1');

      expect(dealershipRepo.update).toHaveBeenCalledWith({ id: 'uuid-1', tenantId: 'tenant-1' }, { isActive: false });
    });

    it('throws NotFoundException when the dealership is not owned by the tenant', async () => {
      dealershipRepo.findOne.mockResolvedValue(null);

      await expect(service.deleteDealership('uuid-1', 'tenant-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ── Service Bays ─────────────────────────────────────────────────────────────

  describe('createServiceBay', () => {
    it('creates and saves a service bay', async () => {
      const dto = { dealershipId: 'd-1', name: 'Bay A' };
      const entity = { ...dto };
      const saved = { id: 'b-1', ...entity, isActive: true };

      serviceBayRepo.create.mockReturnValue(entity);
      serviceBayRepo.save.mockResolvedValue(saved);

      const result = await service.createServiceBay(dto);

      expect(serviceBayRepo.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(saved);
    });
  });

  describe('findServiceBays', () => {
    it('queries by dealershipId and isActive=true', async () => {
      const rows = [{ id: 'b-1', dealershipId: 'd-1', isActive: true }];
      serviceBayRepo.find.mockResolvedValue(rows);

      const result = await service.findServiceBays('d-1');

      expect(serviceBayRepo.find).toHaveBeenCalledWith({ where: { dealershipId: 'd-1', isActive: true } });
      expect(result).toEqual(rows);
    });
  });

  describe('deleteServiceBay', () => {
    it('soft-deletes a service bay', async () => {
      serviceBayRepo.findOne.mockResolvedValue({ id: 'b-1', isActive: true });
      serviceBayRepo.update.mockResolvedValue({ affected: 1 });

      await service.deleteServiceBay('b-1');

      expect(serviceBayRepo.update).toHaveBeenCalledWith('b-1', { isActive: false });
    });

    it('throws NotFoundException when bay does not exist', async () => {
      serviceBayRepo.findOne.mockResolvedValue(null);

      await expect(service.deleteServiceBay('missing-bay')).rejects.toThrow(NotFoundException);
    });
  });

  // ── Service Types ─────────────────────────────────────────────────────────────

  describe('createServiceType', () => {
    it('merges tenantId and persists the service type', async () => {
      const dto = { name: 'Oil Change', durationMin: 60, requiredSkills: ['OIL'] };
      const entity = { ...dto, tenantId: 'tenant-1' };
      const saved = { id: 'st-1', ...entity };

      serviceTypeRepo.create.mockReturnValue(entity);
      serviceTypeRepo.save.mockResolvedValue(saved);

      const result = await service.createServiceType(dto, 'tenant-1');

      expect(serviceTypeRepo.create).toHaveBeenCalledWith({ ...dto, tenantId: 'tenant-1' });
      expect(result).toEqual(saved);
    });
  });

  describe('findServiceTypes', () => {
    it('returns all service types for the tenant', async () => {
      const rows = [{ id: 'st-1', tenantId: 'tenant-1', name: 'Oil Change' }];
      serviceTypeRepo.find.mockResolvedValue(rows);

      const result = await service.findServiceTypes('tenant-1');

      expect(serviceTypeRepo.find).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1' } });
      expect(result).toEqual(rows);
    });
  });

  // ── Technicians ───────────────────────────────────────────────────────────────

  describe('createTechnician', () => {
    it('creates and saves a technician', async () => {
      const dto = { dealershipId: 'd-1', name: 'Alice', skills: ['EV', 'OIL'] };
      const entity = { ...dto };
      const saved = { id: 't-1', ...entity, isActive: true };

      technicianRepo.create.mockReturnValue(entity);
      technicianRepo.save.mockResolvedValue(saved);

      const result = await service.createTechnician(dto);

      expect(technicianRepo.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(saved);
    });
  });

  describe('findTechnicians', () => {
    it('returns active technicians with shifts eager-loaded', async () => {
      const rows = [{ id: 't-1', dealershipId: 'd-1', isActive: true, shifts: [] }];
      technicianRepo.find.mockResolvedValue(rows);

      const result = await service.findTechnicians('d-1');

      expect(technicianRepo.find).toHaveBeenCalledWith({
        where: { dealershipId: 'd-1', isActive: true },
        relations: ['shifts'],
      });
      expect(result).toEqual(rows);
    });
  });

  describe('deleteTechnician', () => {
    it('soft-deletes a technician', async () => {
      technicianRepo.findOne.mockResolvedValue({ id: 't-1', isActive: true });
      technicianRepo.update.mockResolvedValue({ affected: 1 });

      await service.deleteTechnician('t-1');

      expect(technicianRepo.update).toHaveBeenCalledWith('t-1', { isActive: false });
    });

    it('throws NotFoundException when technician does not exist', async () => {
      technicianRepo.findOne.mockResolvedValue(null);

      await expect(service.deleteTechnician('missing-tech')).rejects.toThrow(NotFoundException);
    });
  });
});
