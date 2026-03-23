import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Dealership } from '../modules/resource/entities/dealership.entity';
import { ServiceBay } from '../modules/resource/entities/service-bay.entity';
import { ServiceType } from '../modules/resource/entities/service-type.entity';
import { Technician } from '../modules/resource/entities/technician.entity';
import { TechnicianShift } from '../modules/resource/entities/technician-shift.entity';
import { Appointment } from '../modules/appointment/entities/appointment.entity';

/**
 * Registers the TypeORM PostgreSQL connection for the application.
 * Connection parameters are sourced from environment variables (DB_HOST, DB_PORT,
 * DB_USERNAME, DB_PASSWORD, DB_NAME, DB_SSL).
 *
 * Note: `synchronize` is intentionally disabled in production — run
 * migrations/001_initial_schema.sql to create tables including the
 * GiST exclusion constraints that TypeORM cannot generate.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USERNAME', 'postgres'),
        password: config.get<string>('DB_PASSWORD', 'postgres'),
        database: config.get<string>('DB_NAME', 'keyloop_appointments'),
        entities: [Dealership, ServiceBay, ServiceType, Technician, TechnicianShift, Appointment],
        // synchronize only for development; run SQL migrations/001_initial_schema.sql in production
        // to create the exclusion constraints TypeORM cannot generate
        synchronize: config.get<string>('NODE_ENV') !== 'production',
        logging: config.get<string>('NODE_ENV') === 'development',
        ssl: config.get<string>('DB_SSL') === 'true' ? { rejectUnauthorized: false } : false,
      }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
