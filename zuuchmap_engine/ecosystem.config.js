// DB and other secrets are NOT set here — the app reads them from
// config/variables/production.env (the single source of truth). Keeping a
// second copy in pm2's env risks a stale value silently shadowing the file
// (which is what happened after the 2026-08-18 password rotation).
//
// Multi-instance: raise PM2_INSTANCES only with REDIS_URL set in
// production.env — the throttler, cache invalidation and Socket.io broadcasts
// are Redis-coordinated, but without Redis each worker is isolated (split rate
// limits, split cache, lost cross-worker socket events). See CLAUDE.md.
module.exports = {
    apps: [
        {
            name: 'zuuchmap_engine',
            script: 'dist/src/main.js',
            instances: process.env.PM2_INSTANCES ? Number(process.env.PM2_INSTANCES) : 1,
            exec_mode: process.env.PM2_INSTANCES ? 'cluster' : 'fork',
            autorestart: true,
            watch: false,
            max_memory_restart: '1G',
            // A process that dies inside 10s never counted as "started", so a
            // fatal boot error stops after 10 tries instead of looping forever.
            min_uptime: '10s',
            max_restarts: 10,
            env: {
                NODE_ENV: 'production',
            },
        },
    ],
};
