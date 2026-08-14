# VigilOS Deployment Guide

## Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- Node.js 20+ (for local development)
- PostgreSQL 15+ (for production)
- Redis 7+ (for caching)
- InfluxDB 2.7+ (for time series data)

## Quick Start

### 1. Clone Repository
```bash
git clone https://github.com/yourorg/vigilos.git
cd vigilos
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Start with Docker Compose
```bash
# Production deployment
docker-compose -f docker-compose.prod.yml up -d

# Development mode
docker-compose up -d
```

### 4. Initialize Database
```bash
# Run migrations
docker-compose exec server npx prisma migrate deploy

# Seed initial data
docker-compose exec server npx prisma db seed
```

### 5. Access Services

| Service | URL | Credentials |
|---------|-----|-------------|
| Frontend | https://localhost | - |
| API | https://localhost/api/v1 | - |
| GraphQL | https://localhost/graphql | - |
| Grafana | http://localhost:3001 | admin/admin |
| Prometheus | http://localhost:9090 | - |

---

## Production Deployment

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/vigilos

# Redis
REDIS_URL=redis://localhost:6379

# InfluxDB
INFLUX_URL=http://localhost:8086
INFLUX_TOKEN=your_token_here

# JWT
JWT_SECRET=your_32_byte_secret_here
JWT_EXPIRY=24h

# Encryption
ENCRYPTION_KEY=your_32_byte_encryption_key

# MQTT
MQTT_BROKER=mqtt://localhost:1883

# Server
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# CORS
CORS_ORIGIN=https://yourdomain.com
```

### SSL/TLS Configuration

1. Generate certificates:
```bash
# Self-signed (development)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/key.pem -out ssl/cert.pem

# Production (Let's Encrypt)
certbot certonly --webroot -w /var/www/html -d yourdomain.com
```

2. Update nginx.conf with certificate paths.

### Database Backup

```bash
# Backup
docker-compose exec postgres pg_dump -U vigil_admin vigil_prod > backup.sql

# Restore
docker-compose exec postgres psql -U vigil_admin vigil_prod < backup.sql
```

### Monitoring Setup

1. Access Grafana: http://localhost:3001
2. Add Prometheus data source: http://prometheus:9090
3. Import dashboards:
   - Node.js Application: Dashboard ID 11211
   - PostgreSQL: Dashboard ID 9628
   - Redis: Dashboard ID 763

---

## Scaling

### Horizontal Scaling

```bash
# Scale server instances
docker-compose -f docker-compose.prod.yml up -d --scale server=3
```

### Load Balancing

Add to nginx.conf:
```nginx
upstream vigil_server {
    least_conn;
    server vigil-server-1:3000;
    server vigil-server-2:3000;
    server vigil-server-3:3000;
}
```

### Database Optimization

1. Add indexes for frequently queried columns
2. Configure connection pooling:
```bash
# In postgresql.conf
max_connections = 100
shared_buffers = 256MB
effective_cache_size = 768MB
```

---

## Troubleshooting

### Common Issues

**1. Connection Refused**
```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs -f server
```

**2. Database Connection Errors**
```bash
# Verify PostgreSQL is running
docker-compose exec postgres psql -U vigil_admin -d vigil_prod

# Check connection string
echo $DATABASE_URL
```

**3. Memory Issues**
```bash
# Monitor resource usage
docker stats

# Increase limits in docker-compose.yml
deploy:
  resources:
    limits:
      memory: 2G
```

**4. WebSocket Connection Issues**
```bash
# Check MQTT broker
docker-compose logs mosquitto

# Verify WebSocket endpoint
wscat -c ws://localhost/ws
```

### Health Checks

```bash
# Server health
curl http://localhost:3000/health

# Database health
docker-compose exec postgres pg_isready

# Redis health
docker-compose exec redis redis-cli ping
```

---

## Security Checklist

- [ ] Change default passwords
- [ ] Enable HTTPS only
- [ ] Configure firewall rules
- [ ] Set up rate limiting
- [ ] Enable audit logging
- [ ] Configure CORS properly
- [ ] Set secure JWT secrets
- [ ] Enable input validation
- [ ] Set up monitoring alerts
- [ ] Regular security updates

---

## Support

- **Documentation**: https://docs.vigilos.com
- **GitHub Issues**: https://github.com/yourorg/vigilos/issues
- **Contact**: support@vigilos.com
