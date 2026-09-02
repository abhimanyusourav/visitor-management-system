import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction): void {
  console.error('Unhandled Application Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    user: req.user?.userId,
  });

  const statusCode = err.statusCode || err.status || 500;
  const errorCode = err.code || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR');
  
  // Never leak raw database/system error strings to the client
  let clientMessage = err.message || 'An unexpected error occurred.';
  if (statusCode === 500) {
    clientMessage = 'An internal server error occurred. Please contact the plant administrator.';
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message: clientMessage,
    },
    timestamp: new Date().toISOString(),
  });
}
