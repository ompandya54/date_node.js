import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import apiRoutes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/error.middleware.js';

const app = express();

// Middleware: Secure HTTP headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Middleware: Enable CORS for Flutter applications (Web, Emulator, Physical Devices)
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Middleware: Request Logger
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Middleware: Body Parsers with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware: NoSQL Injection Sanitizer (strips operator keys like $gt)
const sanitizeNoSQL = (obj) => {
  if (obj && typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      if (key.startsWith('$')) {
        delete obj[key];
      } else if (typeof obj[key] === 'object') {
        sanitizeNoSQL(obj[key]);
      }
    }
  }
};

app.use((req, res, next) => {
  if (req.body) sanitizeNoSQL(req.body);
  if (req.query) sanitizeNoSQL(req.query);
  if (req.params) sanitizeNoSQL(req.params);
  next();
});

// Serve uploaded static files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Main API Routes
app.use('/api', apiRoutes);

// Root route welcome message
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to Gandhinagar Dating App Backend API!',
    healthCheck: '/api/health',
    readyCheck: '/api/health/ready',
    config: '/api/meta/config',
    interests: '/api/meta/interests',
  });
});

// Error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
