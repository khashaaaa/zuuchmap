import * as dotenv from 'dotenv';
import * as path from 'path';

/**
 * Loads `config/variables/<NODE_ENV>.env` into `process.env`.
 *
 * Imported first in `main.ts`, for its side effect. `ConfigModule.forRoot()`
 * reads the same file, but only when AppModule's decorator is evaluated — after
 * every module it imports has already been loaded. Anything read at module
 * scope or in a decorator argument (the socket gateway's CORS origin, the
 * verification TTL and rate limit, the analytics retention) therefore saw an
 * empty environment and silently ran on its default, whatever the file said.
 */
dotenv.config({
  path: path.resolve(
    process.cwd(),
    'config/variables',
    `${process.env.NODE_ENV ?? 'development'}.env`,
  ),
});
