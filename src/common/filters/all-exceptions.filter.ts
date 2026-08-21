import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  classifyDatabaseError,
  formatDatabaseDiagnostic,
  isDatabaseInfrastructureError,
} from '../database/postgres-url';
import { classifyRedisError } from '../database/redis-errors';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let exceptionResponse: string | object =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    if (!(exception instanceof HttpException)) {
      if (isDatabaseInfrastructureError(exception)) {
        const diagnostic = classifyDatabaseError(exception);
        status = HttpStatus.SERVICE_UNAVAILABLE;
        exceptionResponse =
          'Database temporarily unavailable. Please try again shortly.';
        this.logger.error(
          formatDatabaseDiagnostic(
            diagnostic,
            {},
            process.env.NODE_ENV ?? 'unknown',
          ),
        );
      } else {
        const redisDiagnostic = classifyRedisError(exception);
        if (redisDiagnostic.category === 'REDIS_RATE_LIMITED') {
          status = HttpStatus.SERVICE_UNAVAILABLE;
          exceptionResponse =
            'Cache service temporarily unavailable. Please try again shortly.';
          this.logger.error(
            `${redisDiagnostic.category} reason=${redisDiagnostic.reason}`,
          );
        }
      }
    }

    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : ((exceptionResponse as Record<string, unknown>).message ??
          'Internal server error');

    const messageText = Array.isArray(message)
      ? message.join(', ')
      : String(message);

    const errorBody = {
      success: false,
      message: messageText,
      error: messageText,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json(errorBody);
  }
}
