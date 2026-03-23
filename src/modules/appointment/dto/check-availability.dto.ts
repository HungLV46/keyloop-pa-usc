import { IsUUID, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Query parameters for the GET /appointments/availability endpoint. */
export class CheckAvailabilityDto {
  @ApiProperty({ example: 'a1b2c3d4-...', description: 'UUID of the dealership' })
  @IsUUID()
  dealershipId: string;

  @ApiProperty({ example: 'e5f6g7h8-...', description: 'UUID of the service type (e.g. Oil Change)' })
  @IsUUID()
  serviceTypeId: string;

  @ApiProperty({ example: '2026-04-07', description: 'Date in YYYY-MM-DD format' })
  @IsDateString()
  date: string;
}
