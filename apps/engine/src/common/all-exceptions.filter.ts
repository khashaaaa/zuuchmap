import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import type { Response } from 'express';
import type { ErrorCode } from '@zuuchmap/core';

const SCREAMING_SNAKE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;

export interface ErrorBody {
  statusCode: number;
  code: ErrorCode | (string & Record<never, never>);
  message: string;
  /** Per-field issues (`INVALID_ATTRIBUTES`): `{ key, code, message }`, so a form can mark its fields. */
  errors?: Array<Record<string, unknown>>;
}

const STATUS_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'TOO_MANY_REQUESTS',
  503: 'SERVICE_UNAVAILABLE',
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function normalise(exception: unknown): ErrorBody {
  if (!(exception instanceof HttpException)) {
    return { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' };
  }
  const body = describeHttp(exception);
  if (body.statusCode < 500) return body;
  // A 5xx message is never shown; only a code the thrower chose is kept.
  const chosen = explicitCode(exception) || body.code === body.message;
  return {
    statusCode: body.statusCode,
    code: chosen ? body.code : 'INTERNAL_ERROR',
    message: 'Internal server error',
  };
}

function explicitCode(e: HttpException): boolean {
  const res = e.getResponse();
  return isRecord(res) && typeof res.code === 'string' && SCREAMING_SNAKE.test(res.code);
}

function describeHttp(exception: HttpException): ErrorBody {
  const statusCode = exception.getStatus();
  const res = exception.getResponse();
  let message = exception.message;
  let explicit: string | undefined;
  if (isRecord(res)) {
    if (typeof res.code === 'string' && SCREAMING_SNAKE.test(res.code)) explicit = res.code;
    if (Array.isArray(res.message)) message = res.message.map(String).join('; ');
    else if (typeof res.message === 'string') message = res.message;
  } else if (typeof res === 'string') {
    message = res;
  }
  const errors = isRecord(res) && Array.isArray(res.errors) ? res.errors.filter(isRecord) : undefined;
  const withIssues = (b: ErrorBody): ErrorBody => (errors?.length ? { ...b, errors } : b);
  if (explicit) return withIssues({ statusCode, code: explicit, message });
  if (SCREAMING_SNAKE.test(message)) return withIssues({ statusCode, code: message, message });
  if (Array.isArray(isRecord(res) ? res.message : undefined)) {
    return { statusCode, code: 'VALIDATION_FAILED', message };
  }
  return { statusCode, code: STATUS_CODES[statusCode] ?? `HTTP_${String(statusCode)}`, message };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const body = normalise(exception);
    if (body.statusCode >= 500) {
      this.log.error(exception instanceof Error ? exception.stack : String(exception));
      if (Sentry.getClient()) Sentry.captureException(exception);
    }
    const res = host.switchToHttp().getResponse<Response>();
    // Keep structured 5xx bodies such as the readiness probe's { ok, db, redis }.
    const status = body.statusCode >= 400 ? body.statusCode : HttpStatus.INTERNAL_SERVER_ERROR;
    res.status(status).json(body);
  }
}
