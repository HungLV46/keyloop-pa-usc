import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class CreateServiceBayDto {
  @IsUUID()
  dealershipId: string;

  @IsString()
  @IsNotEmpty()
  name: string;
}
