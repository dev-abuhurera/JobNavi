module.exports = {
  apps: [
    {
      name: 'jobnavi-web',
      script: 'npm',
      args: 'start',
      cwd: './',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'jobnavi-worker',
      script: 'npx',
      args: 'tsx scripts/worker.ts',
      cwd: './',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1.5G',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
}
