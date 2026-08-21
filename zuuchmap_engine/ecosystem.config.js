module.exports = {
    apps: [
        {
            name: 'zuuchmap_engine',
            script: 'dist/src/main.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '1G',
            // A process that dies inside 10s never counted as "started", so a
            // fatal boot error stops after 10 tries instead of looping forever.
            min_uptime: '10s',
            max_restarts: 10,
            env: {
                NODE_ENV: 'production',
                PG_HOST: '158.69.212.75',
                PG_PORT: 5432,
                PG_USER: 'postgres',
                PG_PWD: 'ahchui',
                PG_NAME: 'zuuchmap'
            }
        }
    ]
};
