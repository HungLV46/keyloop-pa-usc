import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Global exception filter that normalises all thrown exceptions into a
 * consistent JSON error envelope: { statusCode, timestamp, path, message }.
 * Unrecognised errors fall back to 500 Internal Server Error.
 * 5xx responses are additionally logged with their stack trace.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  /** Intercepts the exception, resolves an HTTP status code, and writes the error envelope to the response. */
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = exception instanceof HttpException ? exception.getResponse() : 'Internal server error';

    if (status >= 500) {
      this.logger.error(`${request.method} ${request.url} → ${status}`, exception instanceof Error ? exception.stack : String(exception));
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    });
  }
}
