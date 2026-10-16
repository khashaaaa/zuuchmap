// Must stay the first import in main.ts: anything evaluated at module scope reads process.env.
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '..', '..', '.env'), quiet: true });
