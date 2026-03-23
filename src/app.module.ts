import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { AppointmentModule } from './modules/appointment/appointment.module';
// import { ResourceModule } from './modules/resource/resource.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), ScheduleModule.forRoot(), DatabaseModule /** ResourceModule  **/, AppointmentModule],
})
export class AppModule {}
