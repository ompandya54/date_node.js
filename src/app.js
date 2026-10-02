import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import apiRoutes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/error.middleware.js';

const app = express();

// Middleware: Enable CORS for Flutter applications (Web, Emulator, Physical Devices)
app.use(
  cors({
    origin: '*', // Allow all origins for Flutter dev mode
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Middleware: Request Logger
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Middleware: Body Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded static files (avatars, media)
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Main API Routes
app.use('/api', apiRoutes);

// Root route welcome message
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to Date App Node.js Backend API!',
    healthCheck: '/api/health',
    docs: 'See README.md for endpoint details and Flutter integration samples.',
  });
});

// Error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
