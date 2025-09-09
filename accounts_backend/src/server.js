'use strict';

const app = require('./app');
const { initPool } = require('./config/db');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

let server;

/**
 * Start the HTTP server after ensuring DB connectivity.
 */
async function start() {
  try {
    await initPool();
    server = app.listen(PORT, HOST, () => {
      console.log(`Server running at http://${HOST}:${PORT}`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM signal received: closing HTTP server');
      if (server) {
        server.close(() => {
          console.log('HTTP server closed');
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

start();

module.exports = server;
