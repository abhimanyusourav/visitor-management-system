import dotenv from 'dotenv';
import path from 'path';

// Load environment configuration from .env
dotenv.config();

export function validateProductionSecrets(env: string, jwtSecret?: string, refreshSecret?: string): void {
  if (env.toLowerCase() === 'production') {
    if (!jwtSecret || jwtSecret.trim().length < 32) {
      throw new Error('FATAL SECURITY CONFIGURATION: JWT_SECRET environment variable is mandatory and must be at least 32 characters in production.');
    }
    if (!refreshSecret || refreshSecret.trim().length < 32) {
      throw new Error('FATAL SECURITY CONFIGURATION: REFRESH_TOKEN_SECRET environment variable is mandatory and must be at least 32 characters in production.');
    }
  }
}

const currentEnv = process.env.NODE_ENV || 'development';
validateProductionSecrets(currentEnv, process.env.JWT_SECRET, process.env.REFRESH_TOKEN_SECRET);

export const config = {
  env: currentEnv,
  port: parseInt(process.env.PORT || '5000', 10),
  host: process.env.HOST || '0.0.0.0',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  apiUrl: process.env.API_URL || 'http://localhost:5000',
  corsAllowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:5173')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean),

  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/vms_factory_db',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    name: process.env.DB_NAME || 'vms_factory_db',
    ssl: process.env.DB_SSL === 'true',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'super_secret_jwt_key_change_in_production_vms_2026',
    expiresIn: process.env.JWT_EXPIRES_IN || '2h',
    refreshSecret: process.env.REFRESH_TOKEN_SECRET || 'super_secret_refresh_key_vms_2026',
    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
    bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10),
  },

  storage: {
    uploadDir: path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads'),
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '5', 10),
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX || '500', 10),
    authMax: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '20', 10),
  },

  qr: {
    verifyBaseUrl: process.env.QR_VERIFY_BASE_URL || 'http://localhost:5173/v',
  }
};
