import { IsString, IsNotEmpty, IsUUID, IsArray } from 'class-validator';

export class CreateTechnicianDto {
  @IsUUID()
  dealershipId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @IsString({ each: true })
  skills: string[];
}
