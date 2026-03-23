import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentController } from './appointment.controller';
import { AppointmentService } from './appointment.service';
import { CheckAvailabilityDto } from './dto/check-availability.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { AppointmentStatus } from './appointment-status.enum';

const DEALERSHIP_ID = 'a1b2c3d4-0000-0000-0000-000000000001';
const SERVICE_TYPE_ID = 'e5f6f7f8-0000-0000-0000-000000000002';
const CUSTOMER_ID = 'cust-1';
const TENANT_ID = 'tenant-1';
const VEHICLE_ID = 'v9w0x1y2-0000-0000-0000-000000000003';

const mockAppointmentService = {
  getAvailableSlots: jest.fn(),
  createAppointment: jest.fn(),
  confirmAppointment: jest.fn(),
  cancelAppointment: jest.fn(),
};

describe('AppointmentController', () => {
  let controller: AppointmentController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppointmentController],
      providers: [{ provide: AppointmentService, useValue: mockAppointmentService }],
    }).compile();

    controller = module.get<AppointmentController>(AppointmentController);
  });

  describe('getAvailableSlots', () => {
    it('delegates to AppointmentService.getAvailableSlots and returns slots', async () => {
      const dto: CheckAvailabilityDto = { dealershipId: DEALERSHIP_ID, serviceTypeId: SERVICE_TYPE_ID, date: '2026-04-07' };
      const slots = [{ slotStart: new Date(), slotEnd: new Date(), available: true as const }];
      mockAppointmentService.getAvailableSlots.mockResolvedValue(slots);

      const result = await controller.getAvailableSlots(dto, TENANT_ID);

      expect(mockAppointmentService.getAvailableSlots).toHaveBeenCalledWith(dto, TENANT_ID);
      expect(result).toEqual(slots);
    });
  });

  describe('createAppointment', () => {
    const dto: CreateAppointmentDto = {
      dealershipId: DEALERSHIP_ID,
      vehicleId: VEHICLE_ID,
      serviceTypeId: SERVICE_TYPE_ID,
      slotStartTime: '2026-04-07T08:00:00Z',
    };

    it('delegates to AppointmentService.createAppointment and returns the HOLD appointment', async () => {
      const saved = { id: 'appt-1', status: AppointmentStatus.HOLD };
      mockAppointmentService.createAppointment.mockResolvedValue(saved);

      const result = await controller.createAppointment(dto, CUSTOMER_ID, TENANT_ID);

      expect(mockAppointmentService.createAppointment).toHaveBeenCalledWith(dto, CUSTOMER_ID, TENANT_ID);
      expect(result).toEqual(saved);
    });

    it('propagates NotFoundException when service type is not found', async () => {
      mockAppointmentService.createAppointment.mockRejectedValue(new (require('@nestjs/common').NotFoundException)('Service type not found'));

      await expect(controller.createAppointment(dto, CUSTOMER_ID, TENANT_ID)).rejects.toThrow('Service type not found');
    });

    it('propagates ConflictException when no availability (L1)', async () => {
      mockAppointmentService.createAppointment.mockRejectedValue(new (require('@nestjs/common').ConflictException)('No availability for the requested slot'));

      await expect(controller.createAppointment(dto, CUSTOMER_ID, TENANT_ID)).rejects.toThrow('No availability for the requested slot');
    });

    it('propagates ConflictException when Redis lock is occupied (L2)', async () => {
      mockAppointmentService.createAppointment.mockRejectedValue(new (require('@nestjs/common').ConflictException)('Slot is temporarily locked — please retry in a moment'));

      await expect(controller.createAppointment(dto, CUSTOMER_ID, TENANT_ID)).rejects.toThrow('temporarily locked');
    });

    it('propagates ConflictException on PG exclusion violation (L3)', async () => {
      mockAppointmentService.createAppointment.mockRejectedValue(new (require('@nestjs/common').ConflictException)('Slot was just taken — please choose another time'));

      await expect(controller.createAppointment(dto, CUSTOMER_ID, TENANT_ID)).rejects.toThrow('just taken');
    });

    it('passes customerId and tenantId from decorators to the service', async () => {
      const saved = { id: 'appt-1', status: AppointmentStatus.HOLD };
      mockAppointmentService.createAppointment.mockResolvedValue(saved);

      await controller.createAppointment(dto, CUSTOMER_ID, TENANT_ID);

      expect(mockAppointmentService.createAppointment).toHaveBeenCalledWith(dto, CUSTOMER_ID, TENANT_ID);
    });
  });

  describe('confirmAppointment', () => {
    it('delegates to AppointmentService.confirmAppointment and returns the appointment', async () => {
      const confirmed = { id: 'appt-1', status: AppointmentStatus.CONFIRMED };
      mockAppointmentService.confirmAppointment.mockResolvedValue(confirmed);

      const result = await controller.confirmAppointment('appt-1', CUSTOMER_ID);

      expect(mockAppointmentService.confirmAppointment).toHaveBeenCalledWith('appt-1', CUSTOMER_ID);
      expect(result).toEqual(confirmed);
    });
  });

  describe('cancelAppointment', () => {
    it('delegates to AppointmentService.cancelAppointment', async () => {
      mockAppointmentService.cancelAppointment.mockResolvedValue(undefined);

      await controller.cancelAppointment('appt-1', CUSTOMER_ID);

      expect(mockAppointmentService.cancelAppointment).toHaveBeenCalledWith('appt-1', CUSTOMER_ID);
    });
  });
});
