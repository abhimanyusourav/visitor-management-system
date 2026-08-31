import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config/env.js';
import { apiRateLimiter } from './common/middleware/rateLimiter.js';
import { errorHandler } from './common/middleware/errorHandler.js';

// Import domain routers
import { authRouter } from './modules/auth/auth.controller.js';
import { organizationRouter } from './modules/organizations/organization.controller.js';
import { siteRouter } from './modules/sites/site.controller.js';
import { userRouter } from './modules/users/user.controller.js';
import { departmentRouter } from './modules/departments/department.controller.js';
import { employeeRouter } from './modules/employees/employee.controller.js';
import { visitorRouter } from './modules/visitors/visitor.controller.js';
import { visitRouter } from './modules/visits/visit.controller.js';
import { passRouter } from './modules/passes/pass.controller.js';
import { reportRouter } from './modules/reports/report.controller.js';
import { auditRouter } from './modules/audit/audit.controller.js';
import { storageRouter } from './modules/storage/storage.service.js';
import { notificationRouter } from './modules/notifications/notification.service.js';
import { settingsRouter } from './modules/settings/settings.controller.js';

export function createApp(): Express {
  const app = express();

  // Security headers with relaxed cross-origin resource policy for camera uploads & badges
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  // CORS configuration
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      // In development or local network, allow localhost, 127.0.0.1, or private LAN IPs
      if (
        config.env === 'development' ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        /^http:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(origin) ||
        origin === config.frontendUrl
      ) {
        return callback(null, true);
      }
      return callback(null, true); // Permissive for multi-device factory kiosk & mobile verification
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Site-Id'],
  }));

  // Parsers (allowing base64 camera image payloads up to 10MB)
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // General API Rate Limiting
  app.use('/api', apiRateLimiter);

  // Root welcome endpoint
  app.get('/', (req: Request, res: Response) => {
    res.json({
      success: true,
      name: 'Multi-Site Factory Visitor Management System (VMS) API',
      version: '1.0.0',
      status: 'online',
      frontendUrl: 'http://localhost:5173',
      healthCheck: 'http://localhost:5000/api/health',
      documentation: 'See README.md and docs/api.md',
    });
  });

  // Health check endpoint
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      system: 'Multi-Site Factory VMS',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // 1. Mount Public Media Storage Router (MUST be mounted before authenticated routers)
  app.use('/api/storage', storageRouter);

  // 2. Mount Authenticated API Domain Routes
  app.use('/api/auth', authRouter);
  app.use('/api/organizations', organizationRouter);
  app.use('/api/sites', siteRouter);
  app.use('/api/users', userRouter);
  app.use('/api/departments', departmentRouter);
  app.use('/api/employees', employeeRouter);
  app.use('/api/visitors', visitorRouter);
  app.use('/api/visits', visitRouter);
  app.use('/api/passes', passRouter);
  app.use('/api/reports', reportRouter);
  app.use('/api', reportRouter); // for /api/dashboard/stats & /api/dashboard/charts
  app.use('/api/audit-logs', auditRouter);
  app.use('/api/notifications', notificationRouter);
  app.use('/api/settings', settingsRouter);

  // 404 Handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `Endpoint ${req.method} ${req.originalUrl} does not exist on this server.`,
      }
    });
  });

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}
