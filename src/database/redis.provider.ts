import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** Injection token for the ioredis client instance. */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * NestJS provider that creates a lazily-connected ioredis client.
 * Connection parameters are sourced from REDIS_HOST, REDIS_PORT, and REDIS_PASSWORD env variables.
 * Connection errors are logged but do not crash the process — absence of Redis
 * is handled gracefully in AppointmentService (L2 lock failure falls through to L3).
 */
export const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Redis => {
    const client = new Redis({
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: config.get<number>('REDIS_PORT', 6379),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      lazyConnect: true,
    });
    client.on('error', (err: Error) => console.error('[Redis] connection error:', err.message));
    return client;
  },
};
