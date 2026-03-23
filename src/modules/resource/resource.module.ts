import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dealership } from './entities/dealership.entity';
import { ServiceBay } from './entities/service-bay.entity';
import { ServiceType } from './entities/service-type.entity';
import { Technician } from './entities/technician.entity';
import { TechnicianShift } from './entities/technician-shift.entity';
import { ResourceService } from './services/resource.service';
import { ResourceController } from './controllers/resource.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Dealership, ServiceBay, ServiceType, Technician, TechnicianShift])],
  controllers: [ResourceController],
  providers: [ResourceService],
  exports: [ResourceService, TypeOrmModule],
})
export class ResourceModule {}
