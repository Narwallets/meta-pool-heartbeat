module.exports = {
  apps : [{
    name: 'v1-meta-pool-heartbeat',
    cwd: 'dist-v1',
    script: 'main.js',
    restart_delay: 1000,
    watch: 'main.js',
    out_file: 'main.log',
    error_file: 'main.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss:SSS',
  }]
};

