import { BadGatewayException, BadRequestException, InternalServerErrorException, ConflictException, HttpException, NotFoundException } from '@nestjs/common';
import { normalise } from './all-exceptions.filter';

describe('exception normalisation', () => {
  it('promotes a SCREAMING_SNAKE message to code', () => {
    expect(normalise(new ConflictException('ROLE_ALREADY_SET'))).toEqual({
      statusCode: 409,
      code: 'ROLE_ALREADY_SET',
      message: 'ROLE_ALREADY_SET',
    });
  });

  it('promotes an explicit code from the response object', () => {
    const e = new HttpException({ code: 'POST_NOT_AVAILABLE', message: 'gone' }, 410);
    expect(normalise(e)).toEqual({ statusCode: 410, code: 'POST_NOT_AVAILABLE', message: 'gone' });
  });

  it('derives a code from the status for plain messages', () => {
    expect(normalise(new NotFoundException('No such thing')).code).toBe('NOT_FOUND');
  });

  it('flags validation failures', () => {
    const r = normalise(new BadRequestException(['a must be a string', 'b is required']));
    expect(r.code).toBe('VALIDATION_FAILED');
    expect(r.message).toBe('a must be a string; b is required');
  });

  it('never leaks the message of a non-HTTP error', () => {
    const r = normalise(new Error('secret at /srv/app.ts:12'));
    expect(r).toEqual({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
  });

  it('never returns the message of a 5xx HttpException', () => {
    const r = normalise(new InternalServerErrorException('connection to 10.0.0.5 refused'));
    expect(r).toEqual({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
    expect(normalise(new BadGatewayException('upstream said: secret')).message).toBe('Internal server error');
  });

  it('keeps a chosen SCREAMING_SNAKE code on a 5xx but not its message text', () => {
    const r = normalise(new HttpException({ code: 'PAYMENT_PROVIDER_ERROR', message: 'qpay 500: token abc' }, 502));
    expect(r).toEqual({ statusCode: 502, code: 'PAYMENT_PROVIDER_ERROR', message: 'Internal server error' });
    expect(normalise(new InternalServerErrorException('PAYMENT_PROVIDER_TIMEOUT')).code).toBe('PAYMENT_PROVIDER_TIMEOUT');
  });
});
