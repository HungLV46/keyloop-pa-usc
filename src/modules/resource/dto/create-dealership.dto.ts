import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';
import type { OperatingHours } from '../entities/dealership.entity';

export class CreateDealershipDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  timezone: string;

  @IsOptional()
  @IsObject()
  operatingHours?: OperatingHours;
}
