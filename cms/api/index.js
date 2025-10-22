// Vercel serverless handler for PayloadCMS
const path = require('path');

let app;
let isInitialized = false;

module.exports = async (req, res) => {
  try {
    // Initialize on first request
    if (!isInitialized) {
      console.log('Initializing PayloadCMS...');
      console.log('Current directory:', __dirname);
      console.log('Looking for server at:', path.join(__dirname, '../dist/server.js'));

      const serverModule = require(path.join(__dirname, '../dist/server.js'));
      console.log('Server module loaded:', Object.keys(serverModule));

      // Get the app and start function
      app = serverModule.app || serverModule.default;
      const start = serverModule.start;

      if (!app) {
        throw new Error('Express app not found in server module. Available exports: ' + Object.keys(serverModule).join(', '));
      }

      // Initialize Payload if start function exists and not already initialized
      if (start && typeof start === 'function') {
        console.log('Calling start function to initialize Payload...');
        await start();
      }

      isInitialized = true;
      console.log('PayloadCMS initialized successfully');
    }

    // Forward the request to Express
    return app(req, res);
  } catch (error) {
    console.error('Error in Vercel handler:', error);
    console.error('Stack:', error.stack);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
      stack: error.stack,
    });
  }
};
