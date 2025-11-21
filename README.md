# 🚀 CareForAll Platform - Full Stack Runner

## Quick Start

```bash
# Make script executable (first time only)
chmod +x run-full-stack.sh

# Run the entire platform
./run-full-stack.sh
```

## What This Script Does

The `run-full-stack.sh` script automatically:

1. ✅ Checks Docker availability
2. 🧹 Cleans up old containers and networks
3. 🗄️ Starts MySQL database
4. 📊 Starts ELK Stack (Elasticsearch, Logstash, Kibana, Grafana)
5. 🔧 Starts all microservices (Auth, Campaign, Payment, Admin, etc.)
6. 🌐 Starts the frontend server
7. 📈 Configures observability dashboards
8. 🎉 Opens the application in your browser

## Usage Options

### Standard Launch (Recommended)
```bash
./run-full-stack.sh
```
Starts everything with full setup and configuration.

### Quick Start (Skip Observability Setup)
```bash
./run-full-stack.sh --quick
```
Faster startup, skips Kibana/Grafana dashboard configuration.

### Skip ELK Stack
```bash
./run-full-stack.sh --skip-elk
```
Start only microservices without logging infrastructure.

### Skip Cleanup
```bash
./run-full-stack.sh --skip-cleanup
```
Don't remove existing containers (useful for restarts).

### Combine Options
```bash
./run-full-stack.sh --quick --skip-cleanup
```

## Services Started

### Frontend (Port 3002)
- Main Application: http://localhost:3002
- Admin Dashboard: http://localhost:3002/admin

### API Gateway & Microservices
- API Gateway: http://localhost:4000
- Auth Service: http://localhost:4001
- Campaign Service: http://localhost:4002
- Pledge Service: http://localhost:4003
- Payment Service: http://localhost:4004
- Totals Service: http://localhost:4005
- Chat Service: http://localhost:4008
- Admin Service: http://localhost:4007

### Observability Stack
- Kibana: http://localhost:5601
- Grafana: http://localhost:3001 (admin/admin)
- Elasticsearch: http://localhost:9200
- Prometheus: http://localhost:9090

### Development Tools
- Jenkins: http://localhost:8081

## Management Commands

### View Logs
```bash
# All services
docker compose -f docker-compose-full.yml logs -f

# Specific service
docker compose -f docker-compose-full.yml logs -f payment-service

# ELK stack
docker compose -f docker-compose-elk.yml logs -f

# Frontend
cat /tmp/frontend-server.log
```

### Restart Services
```bash
# Restart specific service
docker compose -f docker-compose-full.yml restart payment-service

# Restart all microservices
docker compose -f docker-compose-full.yml restart

# Restart ELK stack
docker compose -f docker-compose-elk.yml restart
```

### Stop Services
```bash
# Stop all microservices
docker compose -f docker-compose-full.yml down

# Stop ELK stack
docker compose -f docker-compose-elk.yml down

# Stop frontend
pkill -f "node server.js"

# Stop everything
docker compose -f docker-compose-full.yml down
docker compose -f docker-compose-elk.yml down
pkill -f "node server.js"
```

### Check Service Status
```bash
# List running containers
docker ps

# Check health
curl http://localhost:4000/health  # API Gateway
curl http://localhost:4007/health  # Admin Service
curl http://localhost:9200/_cluster/health  # Elasticsearch
```

## Troubleshooting

### Port Already in Use
```bash
# Find process using port
sudo lsof -i :4007

# Kill process
sudo lsof -ti :4007 | xargs -r sudo kill -9
```

### Docker Issues
```bash
# Restart Docker daemon
sudo systemctl restart docker

# Clean up Docker
docker system prune -a -f
docker volume prune -f
```

### Service Not Starting
```bash
# Check logs
docker compose -f docker-compose-full.yml logs [service-name]

# Rebuild service
docker compose -f docker-compose-full.yml build [service-name]
docker compose -f docker-compose-full.yml up -d [service-name]
```

### Database Connection Issues
```bash
# Check database is running
docker ps | grep mysql

# Check database logs
docker compose -f docker-compose-full.yml logs db

# Restart database
docker compose -f docker-compose-full.yml restart db
```

### Frontend Not Loading
```bash
# Check if server is running
ps aux | grep "node server.js"

# Restart frontend
pkill -f "node server.js"
cd frontend && node server.js &
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Port 3002)                      │
│              Main App + Admin Dashboard                      │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                API Gateway (Port 4000)                       │
└─────┬──────┬──────┬──────┬──────┬──────┬──────┬────────────┘
      │      │      │      │      │      │      │
      ▼      ▼      ▼      ▼      ▼      ▼      ▼
   ┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐
   │Auth││Camp││Pldg││Pay ││Chat││Notf││Admn│
   │4001││4002││4003││4004││4008││4006││4007│
   └────┘└────┘└────┘└────┘└────┘└────┘└────┘
      │                                     │
      ▼                                     ▼
┌─────────────────────────────────────────────────────────────┐
│                     MySQL Database                           │
└─────────────────────────────────────────────────────────────┘

         Observability & Monitoring Layer
┌─────────────────────────────────────────────────────────────┐
│  Elasticsearch ← Logstash → Kibana                          │
│  Prometheus → Grafana                                        │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

- Docker & Docker Compose installed
- At least 8GB RAM available
- Ports 3000-5601, 8081, 9090, 9200 available
- Node.js 18+ (for frontend server)

## Time Estimates

- **Full Start**: 3-5 minutes
- **Quick Start**: 2-3 minutes
- **Skip ELK**: 1-2 minutes

## Health Check Endpoints

After starting, verify services are healthy:

```bash
# Quick health check script
for service in 4000 4001 4002 4003 4004 4007; do
  echo -n "Port $service: "
  curl -sf http://localhost:$service/health && echo "✓ OK" || echo "✗ FAIL"
done
```

## Environment Variables

Create `.env` files in service directories if needed:

```bash
# services/payment-service/.env
SSLCOMMERZ_STORE_ID=your_store_id
SSLCOMMERZ_STORE_PASSWORD=your_password
SSLCOMMERZ_IS_LIVE=false

# services/auth-service/.env
JWT_SECRET=your_jwt_secret
```

## Next Steps

After starting the platform:

1. **Create Admin User**
   ```bash
   curl -X POST http://localhost:4001/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@careforall.com","password":"admin123","role":"admin"}'
   ```

2. **Test Payment Integration**
   - Visit http://localhost:3002
   - Create a campaign
   - Make a test donation

3. **View Logs in Kibana**
   - Visit http://localhost:5601
   - Go to Discover
   - Select `careforall-logs-*` index pattern

4. **Monitor Services in Grafana**
   - Visit http://localhost:3001 (admin/admin)
   - View pre-configured dashboards

5. **Run Load Tests**
   ```bash
   ./load-test-1000rps.sh
   ```

## Support

For issues:
- Check logs: `docker compose logs -f [service-name]`
- Verify Docker: `docker info`
- Check ports: `sudo netstat -tlnp | grep [port]`
- Review documentation: [ADMIN-DASHBOARD.md](./ADMIN-DASHBOARD.md)

## Scripts Overview

- `run-full-stack.sh` - Start entire platform (this script)
- `start-admin-dashboard.sh` - Start admin service only
- `setup-kibana-pipeline.sh` - Configure Kibana dashboards
- `configure-grafana-auto.sh` - Configure Grafana dashboards
- `load-test-1000rps.sh` - Performance load testing
- `run-complete-pipeline.sh` - Full CI/CD pipeline

## Contributing

When adding new services:
1. Add to `docker-compose-full.yml`
2. Update this README
3. Add health check endpoint
4. Update the run script if needed
