import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    if (process.env.NODE_ENV === 'production') {
      return next();
    }

    const { method, originalUrl } = req;

    res.on('finish', () => {
      this.logger.log(`${method} ${originalUrl} ${res.statusCode}`);
    });

    next();
  }
}
