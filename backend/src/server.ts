import 'dotenv/config';
import morgan from 'morgan';

import { buildApp } from './app.js';
import { channelManagerService } from './integrations/channel-manager/index.js';

const port = Number(process.env.PORT) || 3000;
const app = buildApp();

// Configure morgan logging based on environment.
const environment = process.env.NODE_ENV || 'development';
app.use(environment === 'development' ? morgan('dev') : morgan('tiny'));

// Initialize services and start the server
async function startServer() {
  try {
    // Initialize Channel Manager Service
    await channelManagerService.initialize();
    console.log('[Server] Channel Manager Service initialized');
  } catch (error) {
    console.error('[Server] Failed to initialize Channel Manager Service:', error);
    // Continue starting server even if channel manager init fails
  }

  // Start the server and capture the returned Server instance.
  const server = app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
  });

  // Listen for the SIGTERM signal to gracefully shut down the server.
  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
      console.log('HTTP server closed');
    });
  });
}

startServer();