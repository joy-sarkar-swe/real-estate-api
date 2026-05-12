import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, code } = this.extractErrorInfo(exception);

    const errorResponse = {
      statusCode: status,
      error: code,
      message,
      path: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
    };

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} → ${status}: ${message}`);
    }

    response.status(status).json(errorResponse);
  }

  private extractErrorInfo(exception: unknown): {
    status: number;
    message: string | string[];
    code: string;
  } {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      const message =
        typeof res === 'object' && res !== null && 'message' in res
          ? (res as any).message
          : exception.message;
      return {
        status: exception.getStatus(),
        message,
        code: this.getErrorCode(exception.getStatus()),
      };
    }

    // Handle Prisma errors by duck-typing (avoids import dependency before generate)
    if (exception && typeof exception === 'object' && 'code' in exception) {
      const err = exception as any;
      return this.handlePrismaError(err);
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred',
      code: 'INTERNAL_SERVER_ERROR',
    };
  }

  private handlePrismaError(error: any): {
    status: number;
    message: string;
    code: string;
  } {
    switch (error.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          message: `A record with this ${(error.meta?.target as string[])?.join(', ')} already exists`,
          code: 'DUPLICATE_ENTRY',
        };
      case 'P2025':
        return { status: HttpStatus.NOT_FOUND, message: 'Record not found', code: 'NOT_FOUND' };
      case 'P2003':
        return { status: HttpStatus.BAD_REQUEST, message: 'Related record not found', code: 'FOREIGN_KEY_VIOLATION' };
      default:
        return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Database error', code: 'DATABASE_ERROR' };
    }
  }

  private getErrorCode(status: number): string {
    const codes: Record<number, string> = {
      400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN',
      404: 'NOT_FOUND', 409: 'CONFLICT', 422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS', 500: 'INTERNAL_SERVER_ERROR',
    };
    return codes[status] || 'UNKNOWN_ERROR';
  }
}
