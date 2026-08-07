// src/config/cors.js

const corsOptions = {
  origin: '*', // Allow ALL origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-API-KEY',
  ],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

module.exports = { corsOptions };
