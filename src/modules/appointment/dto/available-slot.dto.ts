import { ApiProperty } from '@nestjs/swagger';

/** Response shape for a single bookable time slot returned by GET /availability. */
export class AvailableSlotDto {
  @ApiProperty({ example: '2026-04-07T09:00:00.000Z' })
  slotStart: Date;

  @ApiProperty({ example: '2026-04-07T10:00:00.000Z' })
  slotEnd: Date;

  @ApiProperty({ example: true })
  available: true;
}
