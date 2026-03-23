import { Controller, Get, Post, Delete, Param, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiSecurity } from '@nestjs/swagger';
import { AppointmentService } from './appointment.service';
import { CheckAvailabilityDto } from './dto/check-availability.dto';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { AvailableSlotDto } from './dto/available-slot.dto';
import { Appointment } from './entities/appointment.entity';
import { CurrentCustomerId, CurrentTenantId } from '../../common/decorators/current-user.decorator';

/**
 * HTTP controller for the appointment lifecycle.
 * Exposes endpoints under /v1/appointments for:
 *   - checking slot availability
 *   - creating a HOLD
 *   - confirming or cancelling an appointment
 *
 * Auth is stubbed via x-customer-id / x-tenant-id headers; in production
 * these values are extracted from the Cognito JWT by API Gateway.
 */
@ApiTags('Appointments')
@ApiSecurity('customerId')
@ApiSecurity('tenantId')
@Controller('appointments')
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Get('availability')
  @ApiOperation({
    summary: 'Check available slots',
    description: 'Returns available 30-minute slots for the given dealership, service type, and date. ' + 'Each slot has at least one free service bay and one qualified technician.',
  })
  @ApiResponse({ status: 200, description: 'List of available slots', type: [AvailableSlotDto] })
  @ApiResponse({ status: 404, description: 'Dealership or service type not found' })
  getAvailableSlots(@Query() dto: CheckAvailabilityDto, @CurrentTenantId() tenantId: string) {
    return this.appointmentService.getAvailableSlots(dto, tenantId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create appointment (hold)',
    description:
      'Automatically books the first available slot on the requested date using three-layer defense (ADR-003):\n' +
      '- **L1** Pre-lock availability revalidation across all candidate slots (mainly diffirent technicant & bay)\n' +
      '- **L2** Redis distributed lock — tried per slot; moves to next slot on failure\n' +
      '- **L3** PostgreSQL exclusion constraint — moves to next slot on conflict\n\n' +
      'Returns the appointment with `status=HOLD` and `holdExpiresAt`. ' +
      'The hold expires after `HOLD_TTL_MINUTES` (default 5) if not confirmed.',
  })
  @ApiResponse({ status: 201, description: 'Appointment created in HOLD state', type: Appointment })
  @ApiResponse({ status: 409, description: 'No availability — slot already taken' })
  @ApiResponse({ status: 404, description: 'Service type not found' })
  createAppointment(@Body() dto: CreateAppointmentDto, @CurrentCustomerId() customerId: string, @CurrentTenantId() tenantId: string) {
    return this.appointmentService.createAppointment(dto, customerId, tenantId);
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm appointment',
    description: 'Transitions the appointment from `HOLD` to `CONFIRMED`. Returns `410 Gone` if the hold TTL has expired.',
  })
  @ApiParam({ name: 'id', description: 'Appointment UUID returned by POST /appointments' })
  @ApiResponse({ status: 200, description: 'Appointment confirmed', type: Appointment })
  @ApiResponse({ status: 400, description: 'Appointment is not in HOLD state' })
  @ApiResponse({ status: 404, description: 'Appointment not found' })
  @ApiResponse({ status: 410, description: 'Hold has expired — select a new slot' })
  confirmAppointment(@Param('id') id: string, @CurrentCustomerId() customerId: string) {
    return this.appointmentService.confirmAppointment(id, customerId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cancel appointment',
    description: 'Cancels a `HOLD` or `CONFIRMED` appointment. Idempotent on already-cancelled records returns 400.',
  })
  @ApiParam({ name: 'id', description: 'Appointment UUID' })
  @ApiResponse({ status: 204, description: 'Appointment cancelled' })
  @ApiResponse({ status: 400, description: 'Appointment is already cancelled' })
  @ApiResponse({ status: 404, description: 'Appointment not found' })
  cancelAppointment(@Param('id') id: string, @CurrentCustomerId() customerId: string) {
    return this.appointmentService.cancelAppointment(id, customerId);
  }
}
