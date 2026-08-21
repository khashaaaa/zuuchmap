import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    // Global filters also receive websocket and scheduler contexts, where there
    // is no response to write to. Log and stop — the last line of defence must
    // never be the thing that throws.
    if (host.getType() !== 'http') {
      this.logger.error(
        `Unhandled ${host.getType()} exception`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      return;
    }

    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Pull message + optional machine `code` out of the exception. Rule errors
    // throw `new XException({ message, code })`; the object lives in getResponse(),
    // and `exception.message` there is just the generic "Bad Request Exception".
    let message =
      exception instanceof HttpException
        ? exception.message
        : 'Internal server error';
    let code: string | undefined;
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        if (typeof b.message === 'string') message = b.message;
        else if (Array.isArray(b.message) && typeof b.message[0] === 'string') message = b.message[0];
        if (typeof b.code === 'string') code = b.code;
      }
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    if (!response.headersSent) {
      response.status(status).json({ statusCode: status, message, ...(code ? { code } : {}) });
    }
  }
}
