// Vercel serverless handler for PayloadCMS
const path = require('path');

let app;
let isInitialized = false;

module.exports = async (req, res) => {
  try {
    // Initialize on first request
    if (!isInitialized) {
      console.log('Initializing PayloadCMS...');
      const serverModule = require(path.join(__dirname, '../dist/server.js'));

      // Get the app and start function
      app = serverModule.app || serverModule.default;
      const start = serverModule.start;

      // Initialize Payload if start function exists
      if (start && typeof start === 'function') {
        await start();
      }

      isInitialized = true;
      console.log('PayloadCMS initialized successfully');
    }

    // Forward the request to Express
    if (!app) {
      throw new Error('Express app not initialized');
    }

    return app(req, res);
  } catch (error) {
    console.error('Error in Vercel handler:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
};
