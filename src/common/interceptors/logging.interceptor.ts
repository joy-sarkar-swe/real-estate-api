import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const { method, url, ip } = request;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - start;
          const response = ctx.getResponse();
          this.logger.log(
            `${method} ${url} ${response.statusCode} ${duration}ms - ${ip}`,
          );
        },
        error: () => {
          const duration = Date.now() - start;
          this.logger.error(`${method} ${url} FAILED ${duration}ms - ${ip}`);
        },
      }),
    );
  }
}
