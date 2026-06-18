import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

/**
 * Global exception filter that formats all errors according to the
 * platform standard (45_error_handling.md):
 *
 * {
 *   "error": "ERROR_CODE",
 *   "message": "Description",
 *   "details": {},
 *   "request_id": "req_abc123"
 * }
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const requestId =
      (request.headers['x-request-id'] as string) ||
      `req_${randomUUID().slice(0, 12)}`;

    let status: number;
    let errorCode: string;
    let message: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let details: Record<string, any> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const responseBody = exception.getResponse();

      if (typeof responseBody === 'object' && responseBody !== null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body = responseBody as Record<string, any>;
        errorCode = body.error || this.mapStatusToErrorCode(status);
        message = body.message || exception.message;
        details = body.details;
      } else {
        errorCode = this.mapStatusToErrorCode(status);
        message = responseBody as string;
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      errorCode = 'SERVER_INTERNAL_ERROR';
      message = 'An unexpected error occurred';
    }

    response.status(status).json({
      error: errorCode,
      message,
      ...(details && { details }),
      request_id: requestId,
    });
  }

  private mapStatusToErrorCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'VALIDATION_ERROR';
      case HttpStatus.UNAUTHORIZED:
        return 'AUTH_TOKEN_INVALID';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN_ROLE';
      case HttpStatus.NOT_FOUND:
        return 'RESOURCE_NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'RESOURCE_ALREADY_EXISTS';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'INVALID_TRANSITION';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'RATE_LIMIT_EXCEEDED';
      default:
        return 'SERVER_INTERNAL_ERROR';
    }
  }
}
