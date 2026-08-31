import { createApp } from './app.js';
import { config } from './config/env.js';
import { initDatabase } from './database/db.js';
import { runSeed } from './database/seed.js';

async function bootstrap() {
  console.log('🏭 Starting Multi-Site Factory Visitor Management System (VMS)...');

  // Initialize Database Connection & Seed Data
  await initDatabase();
  await runSeed();

  const app = createApp();

  const server = app.listen(config.port, config.host, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 VMS Backend Server running on http://${config.host}:${config.port}`);
    console.log(`🌐 Allowed Frontend URL : ${config.frontendUrl}`);
    console.log(`🛡️ Rate Limiting Active : ${config.rateLimit.max} req / 15 min`);
    console.log(`======================================================\n`);
  });

  const handleShutdown = (signal: string) => {
    console.log(`\n🛑 Received ${signal}. Gracefully shutting down VMS server...`);
    server.close(() => {
      console.log('✅ HTTP server closed. Process terminating.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('❌ Fatal server bootstrap error:', err);
  process.exit(1);
});
