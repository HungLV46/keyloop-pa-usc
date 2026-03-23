import { IsString, IsNotEmpty, IsInt, IsPositive, IsArray, ArrayNotEmpty } from 'class-validator';

export class CreateServiceTypeDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsInt()
  @IsPositive()
  durationMin: number;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  requiredSkills: string[];
}
