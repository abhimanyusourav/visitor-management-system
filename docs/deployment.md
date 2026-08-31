# Multi-Site Factory VMS — Production Deployment Guide

## 1. Cloud & Multi-Site Ready Architecture
Although developed and validated in a zero-dependency local development environment, the VMS architecture is designed to transition seamlessly to public cloud infrastructure (AWS, Azure, GCP, DigitalOcean) or on-premises industrial server racks.

---

## 2. Production Topology

```mermaid
graph TD
    User["Security Gate / Reception / Mobile Tablets"] --> Cloudflare["Cloudflare / WAF & SSL Termination"]
    Cloudflare --> Nginx["Nginx Reverse Proxy & Static PWA Server"]
    Nginx -->|/api/*| Express["Node.js Express API Cluster (PM2 / Docker)"]
    Nginx -->|/*| SPA["Vite React PWA Static Bundle"]
    Express --> Postgres[("Managed PostgreSQL 16+ (AWS RDS / GCP Cloud SQL)")]
    Express --> S3["Object Storage (S3 / GCS / Local NFS Bucket)"]
```

---

## 3. Environment Variables Configuration

### Backend (`backend/.env`)
```env
# Application
NODE_ENV=production
PORT=5000
API_BASE_URL=https://vms.yourcompany.com

# PostgreSQL Connection
DATABASE_URL=postgresql://vms_admin:StrongPassword@postgres-cluster.internal:5432/vms_db?sslmode=require
DB_SSL=true

# Security & Tokens
JWT_SECRET=prod_super_secure_random_key_min_64_characters_generated_via_crypto
JWT_EXPIRES_IN=8h
BCRYPT_SALT_ROUNDS=12

# Storage
UPLOAD_DIR=/var/vms/storage
MAX_FILE_SIZE_MB=5

# CORS & Frontend Origins
CORS_ORIGIN=https://vms.yourcompany.com
QR_VERIFY_BASE_URL=https://vms.yourcompany.com/v
```

### Frontend (`frontend/.env.production`)
```env
VITE_API_BASE_URL=https://vms.yourcompany.com
```

---

## 4. Production Build & Execution

### 4.1 Building Backend & Frontend
```bash
# Build Backend
cd backend
npm run build

# Build Frontend Static Assets
cd ../frontend
npm run build
```

The frontend artifacts are compiled into `frontend/dist/`, including precached service worker assets (`sw.js`).

---

## 5. Docker & Containerization (Example)

### 5.1 Backend `Dockerfile`
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
EXPOSE 5000
CMD ["node", "dist/server.js"]
```

### 5.2 Nginx Configuration
```nginx
server {
    listen 80;
    server_name vms.yourcompany.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name vms.yourcompany.com;

    ssl_certificate /etc/letsencrypt/live/vms.yourcompany.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vms.yourcompany.com/privkey.pem;

    # Frontend PWA Static Files
    location / {
        root /var/www/vms-frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # API Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 6. High Availability & Data Backup
- **Automated Database Backups**: Enable daily automated snapshots in PostgreSQL RDS with 30-day point-in-time recovery (PITR).
- **Multi-Site Latency**: Use read replicas or Cloudflare edge caching for static assets.
- **Failover**: Multi-AZ deployment ensures zero downtime during hardware maintenance.
