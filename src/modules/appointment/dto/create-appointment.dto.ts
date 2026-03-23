import { IsUUID, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Request body for POST /appointments.
 * The service automatically finds and books the first available slot on the given date.
 */
export class CreateAppointmentDto {
  @ApiProperty({ example: 'a1b2c3d4-...', description: 'UUID of the dealership' })
  @IsUUID()
  dealershipId: string;

  @ApiProperty({ example: 'v9w0x1y2-...', description: 'UUID of the customer vehicle (cross-service reference)' })
  @IsUUID()
  vehicleId: string;

  @ApiProperty({ example: 'e5f6g7h8-...', description: 'UUID of the service type' })
  @IsUUID()
  serviceTypeId: string;

  @ApiProperty({ example: '2026-04-07', description: 'Date in YYYY-MM-DD format; first available slot on this date will be booked' })
  @IsDateString()
  date: string;
}
