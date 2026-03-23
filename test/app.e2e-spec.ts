import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { ConflictException, NotFoundException, BadRequestException, GoneException } from '@nestjs/common';
import { AppointmentController } from '../src/modules/appointment/appointment.controller';
import { AppointmentService } from '../src/modules/appointment/appointment.service';
import { ResourceController } from '../src/modules/resource/controllers/resource.controller';
import { ResourceService } from '../src/modules/resource/services/resource.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { AppointmentStatus } from '../src/modules/appointment/appointment-status.enum';

// Proper UUID v4 values required for class-validator @IsUUID() checks
const DEALERSHIP_ID = 'a1b2c3d4-e5f6-4abc-89de-123456789012';
const SERVICE_TYPE_ID = 'b2c3d4e5-f6a7-4bcd-af01-234567890123';
const VEHICLE_ID = 'c3d4e5f6-a7b8-4cde-b012-345678901234';
const CUSTOMER_ID = 'cust-1';
const TENANT_ID = 'tenant-1';

const mockAppointmentService = {
  getAvailableSlots: jest.fn(),
  createAppointment: jest.fn(),
  confirmAppointment: jest.fn(),
  cancelAppointment: jest.fn(),
};

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

async function buildApp(): Promise<INestApplication<App>> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [AppointmentController, ResourceController],
    providers: [
      { provide: AppointmentService, useValue: mockAppointmentService },
      { provide: ResourceService, useValue: mockResourceService },
    ],
  }).compile();

  const app = module.createNestApplication<INestApplication<App>>();
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();
  return app;
}

// ── Appointment endpoints ────────────────────────────────────────────────────

describe('Appointment endpoints (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // GET /v1/appointments/availability

  describe('GET /v1/appointments/availability', () => {
    it('returns 200 with a list of slots', async () => {
      const slots = [{ slotStart: '2026-04-07T08:00:00.000Z', slotEnd: '2026-04-07T09:00:00.000Z', available: true }];
      mockAppointmentService.getAvailableSlots.mockResolvedValue(slots);

      const { status, body } = await request(app.getHttpServer())
        .get('/v1/appointments/availability')
        .query({ dealershipId: DEALERSHIP_ID, serviceTypeId: SERVICE_TYPE_ID, date: '2026-04-07' })
        .set('x-tenant-id', TENANT_ID);

      expect(status).toBe(200);
      expect(body).toEqual(slots);
    });

    it('returns 400 when required query params are missing', async () => {
      const { status } = await request(app.getHttpServer())
        .get('/v1/appointments/availability')
        .query({ dealershipId: DEALERSHIP_ID }) // missing serviceTypeId and date
        .set('x-tenant-id', TENANT_ID);

      expect(status).toBe(400);
    });

    it('returns 400 when dealershipId is not a UUID', async () => {
      const { status, body } = await request(app.getHttpServer())
        .get('/v1/appointments/availability')
        .query({ dealershipId: 'not-a-uuid', serviceTypeId: SERVICE_TYPE_ID, date: '2026-04-07' })
        .set('x-tenant-id', TENANT_ID);

      expect(status).toBe(400);
      expect(body).toHaveProperty('message');
    });

    it('returns 404 when service type is not found', async () => {
      mockAppointmentService.getAvailableSlots.mockRejectedValue(new NotFoundException('Service type not found'));

      const { status, body } = await request(app.getHttpServer())
        .get('/v1/appointments/availability')
        .query({ dealershipId: DEALERSHIP_ID, serviceTypeId: SERVICE_TYPE_ID, date: '2026-04-07' })
        .set('x-tenant-id', TENANT_ID);

      expect(status).toBe(404);
      expect(JSON.stringify(body)).toContain('Service type not found');
    });
  });

  // POST /v1/appointments

  describe('POST /v1/appointments', () => {
    const validBody = {
      dealershipId: DEALERSHIP_ID,
      vehicleId: VEHICLE_ID,
      serviceTypeId: SERVICE_TYPE_ID,
      date: '2026-04-07',
    };

    it('returns 201 with the created HOLD appointment', async () => {
      const appt = { id: 'appt-1', status: AppointmentStatus.HOLD, customerId: CUSTOMER_ID };
      mockAppointmentService.createAppointment.mockResolvedValue(appt);

      const { status, body } = await request(app.getHttpServer()).post('/v1/appointments').send(validBody).set('x-customer-id', CUSTOMER_ID).set('x-tenant-id', TENANT_ID);

      expect(status).toBe(201);
      expect(body).toMatchObject({ id: 'appt-1', status: AppointmentStatus.HOLD });
    });

    it('returns 400 when date is not in YYYY-MM-DD format', async () => {
      const { status } = await request(app.getHttpServer())
        .post('/v1/appointments')
        .send({ ...validBody, date: 'not-a-date' })
        .set('x-customer-id', CUSTOMER_ID)
        .set('x-tenant-id', TENANT_ID);

      expect(status).toBe(400);
    });

    it('returns 400 when required body fields are missing', async () => {
      const { status } = await request(app.getHttpServer())
        .post('/v1/appointments')
        .send({ dealershipId: DEALERSHIP_ID }) // vehicleId, serviceTypeId, date missing
        .set('x-customer-id', CUSTOMER_ID)
        .set('x-tenant-id', TENANT_ID);

      expect(status).toBe(400);
    });

    it('returns 409 when slot is already taken (L1 availability check)', async () => {
      mockAppointmentService.createAppointment.mockRejectedValue(new ConflictException('No availability for the requested slot'));

      const { status, body } = await request(app.getHttpServer()).post('/v1/appointments').send(validBody).set('x-customer-id', CUSTOMER_ID).set('x-tenant-id', TENANT_ID);

      expect(status).toBe(409);
      expect(JSON.stringify(body)).toContain('No availability');
    });

    it('returns 409 when Redis lock is temporarily occupied (L2 contention)', async () => {
      mockAppointmentService.createAppointment.mockRejectedValue(new ConflictException('Slot is temporarily locked — please retry in a moment'));

      const { status, body } = await request(app.getHttpServer()).post('/v1/appointments').send(validBody).set('x-customer-id', CUSTOMER_ID).set('x-tenant-id', TENANT_ID);

      expect(status).toBe(409);
      expect(JSON.stringify(body)).toContain('temporarily locked');
    });

    it('returns 409 when a concurrent request committed first (L3 PG exclusion)', async () => {
      mockAppointmentService.createAppointment.mockRejectedValue(new ConflictException('Slot was just taken — please choose another time'));

      const { status, body } = await request(app.getHttpServer()).post('/v1/appointments').send(validBody).set('x-customer-id', CUSTOMER_ID).set('x-tenant-id', TENANT_ID);

      expect(status).toBe(409);
      expect(JSON.stringify(body)).toContain('just taken');
    });

    it('returns 404 when the service type does not exist', async () => {
      mockAppointmentService.createAppointment.mockRejectedValue(new NotFoundException('Service type not found'));

      const { status, body } = await request(app.getHttpServer()).post('/v1/appointments').send(validBody).set('x-customer-id', CUSTOMER_ID).set('x-tenant-id', TENANT_ID);

      expect(status).toBe(404);
      expect(JSON.stringify(body)).toContain('Service type not found');
    });

    it('returns 400 when dealershipId is not a valid UUID', async () => {
      const { status } = await request(app.getHttpServer())
        .post('/v1/appointments')
        .send({ ...validBody, dealershipId: 'not-a-uuid' })
        .set('x-customer-id', CUSTOMER_ID)
        .set('x-tenant-id', TENANT_ID);

      expect(status).toBe(400);
    });

    it('returns 400 when vehicleId is not a valid UUID', async () => {
      const { status } = await request(app.getHttpServer())
        .post('/v1/appointments')
        .send({ ...validBody, vehicleId: 'not-a-uuid' })
        .set('x-customer-id', CUSTOMER_ID)
        .set('x-tenant-id', TENANT_ID);

      expect(status).toBe(400);
    });

    it('returns 400 when serviceTypeId is not a valid UUID', async () => {
      const { status } = await request(app.getHttpServer())
        .post('/v1/appointments')
        .send({ ...validBody, serviceTypeId: 'not-a-uuid' })
        .set('x-customer-id', CUSTOMER_ID)
        .set('x-tenant-id', TENANT_ID);

      expect(status).toBe(400);
    });

    it('forwards x-customer-id and x-tenant-id headers to the service', async () => {
      const appt = { id: 'appt-1', status: AppointmentStatus.HOLD, customerId: CUSTOMER_ID };
      mockAppointmentService.createAppointment.mockResolvedValue(appt);

      await request(app.getHttpServer()).post('/v1/appointments').send(validBody).set('x-customer-id', CUSTOMER_ID).set('x-tenant-id', TENANT_ID);

      expect(mockAppointmentService.createAppointment).toHaveBeenCalledWith(expect.objectContaining(validBody), CUSTOMER_ID, TENANT_ID);
    });

    it('returns 201 with holdExpiresAt in the response body', async () => {
      const holdExpiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
      const appt = { id: 'appt-1', status: AppointmentStatus.HOLD, holdExpiresAt };
      mockAppointmentService.createAppointment.mockResolvedValue(appt);

      const { status, body } = await request(app.getHttpServer()).post('/v1/appointments').send(validBody).set('x-customer-id', CUSTOMER_ID).set('x-tenant-id', TENANT_ID);

      expect(status).toBe(201);
      expect(body).toHaveProperty('holdExpiresAt');
      expect(body.status).toBe(AppointmentStatus.HOLD);
    });
  });

  // POST /v1/appointments/:id/confirm

  describe('POST /v1/appointments/:id/confirm', () => {
    it('returns 200 with the confirmed appointment', async () => {
      const confirmed = { id: 'appt-1', status: AppointmentStatus.CONFIRMED };
      mockAppointmentService.confirmAppointment.mockResolvedValue(confirmed);

      const { status, body } = await request(app.getHttpServer()).post('/v1/appointments/appt-1/confirm').set('x-customer-id', CUSTOMER_ID);

      expect(status).toBe(200);
      expect(body).toMatchObject({ status: AppointmentStatus.CONFIRMED });
    });

    it('returns 410 when hold has expired', async () => {
      mockAppointmentService.confirmAppointment.mockRejectedValue(new GoneException('Hold has expired — please select a new slot'));

      const { status } = await request(app.getHttpServer()).post('/v1/appointments/appt-1/confirm').set('x-customer-id', CUSTOMER_ID);

      expect(status).toBe(410);
    });

    it('returns 400 when appointment is not in HOLD state', async () => {
      mockAppointmentService.confirmAppointment.mockRejectedValue(new BadRequestException('Cannot confirm an appointment in CONFIRMED state'));

      const { status } = await request(app.getHttpServer()).post('/v1/appointments/appt-1/confirm').set('x-customer-id', CUSTOMER_ID);

      expect(status).toBe(400);
    });
  });

  // DELETE /v1/appointments/:id

  describe('DELETE /v1/appointments/:id', () => {
    it('returns 204 on successful cancellation', async () => {
      mockAppointmentService.cancelAppointment.mockResolvedValue(undefined);

      const { status } = await request(app.getHttpServer()).delete('/v1/appointments/appt-1').set('x-customer-id', CUSTOMER_ID);

      expect(status).toBe(204);
    });

    it('returns 404 when appointment is not found', async () => {
      mockAppointmentService.cancelAppointment.mockRejectedValue(new NotFoundException('Appointment not found'));

      const { status } = await request(app.getHttpServer()).delete('/v1/appointments/appt-1').set('x-customer-id', CUSTOMER_ID);

      expect(status).toBe(404);
    });

    it('returns 400 when appointment is already cancelled', async () => {
      mockAppointmentService.cancelAppointment.mockRejectedValue(new BadRequestException('Appointment is already cancelled'));

      const { status } = await request(app.getHttpServer()).delete('/v1/appointments/appt-1').set('x-customer-id', CUSTOMER_ID);

      expect(status).toBe(400);
    });
  });
});

// ── Resource endpoints ───────────────────────────────────────────────────────

describe('Resource endpoints (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // POST /v1/dealerships

  describe('POST /v1/dealerships', () => {
    it('returns 201 with the created dealership', async () => {
      const saved = { id: 'uuid-1', name: 'Acme Auto', timezone: 'UTC', tenantId: TENANT_ID };
      mockResourceService.createDealership.mockResolvedValue(saved);

      const { status, body } = await request(app.getHttpServer()).post('/v1/dealerships').send({ name: 'Acme Auto', timezone: 'UTC' }).set('x-tenant-id', TENANT_ID);

      expect(status).toBe(201);
      expect(body).toMatchObject({ name: 'Acme Auto' });
    });

    it('returns 400 when name is missing', async () => {
      const { status } = await request(app.getHttpServer()).post('/v1/dealerships').send({ timezone: 'UTC' }).set('x-tenant-id', TENANT_ID);

      expect(status).toBe(400);
    });
  });

  // GET /v1/dealerships

  describe('GET /v1/dealerships', () => {
    it('returns 200 with a list of dealerships', async () => {
      const rows = [{ id: 'uuid-1', name: 'Acme Auto', tenantId: TENANT_ID }];
      mockResourceService.findDealerships.mockResolvedValue(rows);

      const { status, body } = await request(app.getHttpServer()).get('/v1/dealerships').set('x-tenant-id', TENANT_ID);

      expect(status).toBe(200);
      expect(body).toEqual(rows);
    });
  });

  // DELETE /v1/dealerships/:id

  describe('DELETE /v1/dealerships/:id', () => {
    it('returns 204 on successful deletion', async () => {
      mockResourceService.deleteDealership.mockResolvedValue(undefined);

      const { status } = await request(app.getHttpServer()).delete('/v1/dealerships/uuid-1').set('x-tenant-id', TENANT_ID);

      expect(status).toBe(204);
    });

    it('returns 404 when dealership is not found', async () => {
      mockResourceService.deleteDealership.mockRejectedValue(new NotFoundException('Dealership not found'));

      const { status } = await request(app.getHttpServer()).delete('/v1/dealerships/uuid-1').set('x-tenant-id', TENANT_ID);

      expect(status).toBe(404);
    });
  });

  // POST /v1/service-types

  describe('POST /v1/service-types', () => {
    it('returns 201 with the created service type', async () => {
      const saved = { id: 'st-1', name: 'Oil Change', durationMin: 60, requiredSkills: ['OIL'], tenantId: TENANT_ID };
      mockResourceService.createServiceType.mockResolvedValue(saved);

      const { status, body } = await request(app.getHttpServer())
        .post('/v1/service-types')
        .send({ name: 'Oil Change', durationMin: 60, requiredSkills: ['OIL'] })
        .set('x-tenant-id', TENANT_ID);

      expect(status).toBe(201);
      expect(body).toMatchObject({ name: 'Oil Change' });
    });

    it('returns 400 when requiredSkills is empty', async () => {
      const { status } = await request(app.getHttpServer()).post('/v1/service-types').send({ name: 'Oil Change', durationMin: 60, requiredSkills: [] }).set('x-tenant-id', TENANT_ID);

      expect(status).toBe(400);
    });
  });

  // POST /v1/technicians

  describe('POST /v1/technicians', () => {
    it('returns 201 with the created technician', async () => {
      const saved = { id: 't-1', name: 'Alice', dealershipId: DEALERSHIP_ID, skills: ['OIL'] };
      mockResourceService.createTechnician.mockResolvedValue(saved);

      const { status, body } = await request(app.getHttpServer())
        .post('/v1/technicians')
        .send({ dealershipId: DEALERSHIP_ID, name: 'Alice', skills: ['OIL'] });

      expect(status).toBe(201);
      expect(body).toMatchObject({ name: 'Alice' });
    });

    it('returns 400 when dealershipId is not a UUID', async () => {
      const { status } = await request(app.getHttpServer())
        .post('/v1/technicians')
        .send({ dealershipId: 'not-a-uuid', name: 'Alice', skills: ['OIL'] });

      expect(status).toBe(400);
    });
  });
});
