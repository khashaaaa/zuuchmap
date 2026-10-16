// Cluster mode needs shared state, so REDIS_URL is mandatory (crons use claimCron).
if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL is required to run the engine in cluster mode');
}

module.exports = {
  apps: [
    {
      name: 'zuuchmap-engine',
      cwd: '/var/www/zuuchmap/apps/engine',
      script: 'dist/main.js',
      exec_mode: 'cluster',
      instances: 2,
      max_memory_restart: '512M',
      kill_timeout: 10000,
      env: { NODE_ENV: 'production', PORT: 8383 },
    },
  ],
};
