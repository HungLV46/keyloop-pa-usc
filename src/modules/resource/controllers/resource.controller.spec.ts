import { Test, TestingModule } from '@nestjs/testing';
import { ResourceController } from './resource.controller';
import { ResourceService } from '../services/resource.service';
import { CreateDealershipDto } from '../dto/create-dealership.dto';
import { CreateServiceBayDto } from '../dto/create-service-bay.dto';
import { CreateServiceTypeDto } from '../dto/create-service-type.dto';
import { CreateTechnicianDto } from '../dto/create-technician.dto';

const mockResourceService = {
  createDealership: jest.fn(),
  findDealerships: jest.fn(),
  deleteDealership: jest.fn(),
  createServiceBay: jest.fn(),
  findServiceBays: jest.fn(),
  deleteServiceBay: jest.fn(),
  createServiceType: jest.fn(),
  findServiceTypes: jest.fn(),
  createTechnician: jest.fn(),
  findTechnicians: jest.fn(),
  deleteTechnician: jest.fn(),
};

describe('ResourceController', () => {
  let controller: ResourceController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ResourceController],
      providers: [{ provide: ResourceService, useValue: mockResourceService }],
    }).compile();

    controller = module.get<ResourceController>(ResourceController);
  });

  describe('createDealership', () => {
    it('delegates to ResourceService.createDealership', async () => {
      const dto: CreateDealershipDto = { name: 'Acme', timezone: 'UTC' } as CreateDealershipDto;
      const saved = { id: 'uuid-1', ...dto, tenantId: 't-1', isActive: true };
      mockResourceService.createDealership.mockResolvedValue(saved);

      const result = await controller.createDealership(dto, 't-1');

      expect(mockResourceService.createDealership).toHaveBeenCalledWith(dto, 't-1');
      expect(result).toEqual(saved);
    });
  });

  describe('listDealerships', () => {
    it('delegates to ResourceService.findDealerships', async () => {
      const rows = [{ id: 'uuid-1', tenantId: 't-1' }];
      mockResourceService.findDealerships.mockResolvedValue(rows);

      const result = await controller.listDealerships('t-1');

      expect(mockResourceService.findDealerships).toHaveBeenCalledWith('t-1');
      expect(result).toEqual(rows);
    });
  });

  describe('deleteDealership', () => {
    it('delegates to ResourceService.deleteDealership', async () => {
      mockResourceService.deleteDealership.mockResolvedValue(undefined);

      await controller.deleteDealership('uuid-1', 't-1');

      expect(mockResourceService.deleteDealership).toHaveBeenCalledWith('uuid-1', 't-1');
    });
  });

  describe('createServiceBay', () => {
    it('delegates to ResourceService.createServiceBay', async () => {
      const dto: CreateServiceBayDto = { dealershipId: 'd-1', name: 'Bay A' };
      const saved = { id: 'b-1', ...dto, isActive: true };
      mockResourceService.createServiceBay.mockResolvedValue(saved);

      const result = await controller.createServiceBay(dto);

      expect(mockResourceService.createServiceBay).toHaveBeenCalledWith(dto);
      expect(result).toEqual(saved);
    });
  });

  describe('listServiceBays', () => {
    it('delegates to ResourceService.findServiceBays', async () => {
      const rows = [{ id: 'b-1', dealershipId: 'd-1' }];
      mockResourceService.findServiceBays.mockResolvedValue(rows);

      const result = await controller.listServiceBays('d-1');

      expect(mockResourceService.findServiceBays).toHaveBeenCalledWith('d-1');
      expect(result).toEqual(rows);
    });
  });

  describe('deleteServiceBay', () => {
    it('delegates to ResourceService.deleteServiceBay', async () => {
      mockResourceService.deleteServiceBay.mockResolvedValue(undefined);

      await controller.deleteServiceBay('b-1');

      expect(mockResourceService.deleteServiceBay).toHaveBeenCalledWith('b-1');
    });
  });

  describe('createServiceType', () => {
    it('delegates to ResourceService.createServiceType', async () => {
      const dto: CreateServiceTypeDto = { name: 'Oil Change', durationMin: 60, requiredSkills: ['OIL'] };
      const saved = { id: 'st-1', ...dto, tenantId: 't-1' };
      mockResourceService.createServiceType.mockResolvedValue(saved);

      const result = await controller.createServiceType(dto, 't-1');

      expect(mockResourceService.createServiceType).toHaveBeenCalledWith(dto, 't-1');
      expect(result).toEqual(saved);
    });
  });

  describe('listServiceTypes', () => {
    it('delegates to ResourceService.findServiceTypes', async () => {
      const rows = [{ id: 'st-1', tenantId: 't-1', name: 'Oil Change' }];
      mockResourceService.findServiceTypes.mockResolvedValue(rows);

      const result = await controller.listServiceTypes('t-1');

      expect(mockResourceService.findServiceTypes).toHaveBeenCalledWith('t-1');
      expect(result).toEqual(rows);
    });
  });

  describe('createTechnician', () => {
    it('delegates to ResourceService.createTechnician', async () => {
      const dto: CreateTechnicianDto = { dealershipId: 'd-1', name: 'Alice', skills: ['OIL'] };
      const saved = { id: 't-1', ...dto, isActive: true };
      mockResourceService.createTechnician.mockResolvedValue(saved);

      const result = await controller.createTechnician(dto);

      expect(mockResourceService.createTechnician).toHaveBeenCalledWith(dto);
      expect(result).toEqual(saved);
    });
  });

  describe('listTechnicians', () => {
    it('delegates to ResourceService.findTechnicians', async () => {
      const rows = [{ id: 't-1', dealershipId: 'd-1', shifts: [] }];
      mockResourceService.findTechnicians.mockResolvedValue(rows);

      const result = await controller.listTechnicians('d-1');

      expect(mockResourceService.findTechnicians).toHaveBeenCalledWith('d-1');
      expect(result).toEqual(rows);
    });
  });

  describe('deleteTechnician', () => {
    it('delegates to ResourceService.deleteTechnician', async () => {
      mockResourceService.deleteTechnician.mockResolvedValue(undefined);

      await controller.deleteTechnician('t-1');

      expect(mockResourceService.deleteTechnician).toHaveBeenCalledWith('t-1');
    });
  });
});
