import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from './entities/appointment.entity';
import { Dealership } from '../resource/entities/dealership.entity';
import { ServiceType } from '../resource/entities/service-type.entity';
import { ServiceBay } from '../resource/entities/service-bay.entity';
import { Technician } from '../resource/entities/technician.entity';
import { TechnicianShift } from '../resource/entities/technician-shift.entity';
import { redisProvider } from '../../database/redis.provider';
import { AppointmentRepository } from './appointment.repository';
import { ResourceRepository } from './resource.repository';
import { AppointmentService } from './appointment.service';
import { AppointmentController } from './appointment.controller';

/**
 * Feature module that wires together all appointment-domain providers:
 * Redis (for distributed locking), AppointmentRepository, ResourceRepository,
 * AppointmentService, and AppointmentController.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Appointment, Dealership, ServiceType, ServiceBay, Technician, TechnicianShift])],
  controllers: [AppointmentController],
  providers: [redisProvider, AppointmentRepository, ResourceRepository, AppointmentService],
})
export class AppointmentModule {}
