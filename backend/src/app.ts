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
import { gateRouter } from './modules/gates/gate.controller.js';

export function createApp(): Express {
  const app = express();

  // Security headers with content security policy and frame protection
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'same-site' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
      },
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));

  // CORS configuration: strict allowlisting without permissive wildcards
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (config.corsAllowedOrigins.includes(origin) || origin === config.frontendUrl) {
        return callback(null, true);
      }

      if (config.env === 'development') {
        if (
          /^https?:\/\/(localhost|127\.0\.0\.1)(:[0-9]+)?$/.test(origin) ||
          /^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|169\.254\.\d+\.\d+)(:[0-9]+)?$/.test(origin)
        ) {
          return callback(null, true);
        }
      }

      return callback(new Error(`CORS origin "${origin}" not allowed by security policy.`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Site-Id'],
  }));

  // Parsers: strict 100kb limit by default, up to 5MB specifically for image/camera payload endpoints
  app.use((req, res, next) => {
    if (
      req.path.startsWith('/api/visits') ||
      req.path.startsWith('/api/visitors') ||
      req.path.startsWith('/api/storage')
    ) {
      express.json({ limit: '5mb' })(req, res, next);
    } else {
      express.json({ limit: '100kb' })(req, res, next);
    }
  });
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));
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
  app.use('/api/gates', gateRouter);
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
