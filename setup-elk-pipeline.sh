#!/bin/bash

# CareForAll Platform - Complete ELK Observability Pipeline Setup Script
# This script sets up Elasticsearch, Logstash, Kibana, and Grafana for centralized logging

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    print_success "Docker is installed"
}

check_docker_compose() {
    if ! command -v docker &> /dev/null || ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not available. Please install Docker Compose."
        exit 1
    fi
    print_success "Docker Compose is available"
}

# Main script
print_header "CareForAll ELK Stack Pipeline Setup"

print_info "Starting observability pipeline setup..."
echo ""

# Step 1: Check prerequisites
print_header "Step 1: Checking Prerequisites"
check_docker
check_docker_compose

# Step 2: Create Docker network
print_header "Step 2: Creating Docker Network"
if docker network inspect careforall-network >/dev/null 2>&1; then
    print_success "Network 'careforall-network' already exists"
else
    docker network create careforall-network
    print_success "Created network 'careforall-network'"
fi

# Step 3: Start ELK Stack
print_header "Step 3: Starting ELK Stack (Elasticsearch, Logstash, Kibana, Grafana)"
print_info "This may take a few minutes..."
cd "$(dirname "$0")"
docker compose -f docker-compose-elk.yml up -d

# Step 4: Wait for Elasticsearch
print_header "Step 4: Waiting for Elasticsearch to be Ready"
MAX_WAIT=60
WAIT_TIME=0
until curl -s http://localhost:9200/_cluster/health | grep -q '"status":"green\|yellow"'; do
    if [ $WAIT_TIME -ge $MAX_WAIT ]; then
        print_error "Elasticsearch failed to start within ${MAX_WAIT} seconds"
        exit 1
    fi
    echo -n "."
    sleep 5
    WAIT_TIME=$((WAIT_TIME + 5))
done
echo ""
print_success "Elasticsearch is ready!"

# Step 5: Wait for Logstash
print_header "Step 5: Waiting for Logstash to be Ready"
WAIT_TIME=0
until curl -s http://localhost:9600 > /dev/null 2>&1; do
    if [ $WAIT_TIME -ge $MAX_WAIT ]; then
        print_error "Logstash failed to start within ${MAX_WAIT} seconds"
        exit 1
    fi
    echo -n "."
    sleep 5
    WAIT_TIME=$((WAIT_TIME + 5))
done
echo ""
print_success "Logstash is ready!"

# Step 6: Wait for Kibana
print_header "Step 6: Waiting for Kibana to be Ready"
WAIT_TIME=0
until curl -s http://localhost:5601/api/status | grep -q '"level":"available"'; do
    if [ $WAIT_TIME -ge $MAX_WAIT ]; then
        print_error "Kibana failed to start within ${MAX_WAIT} seconds"
        exit 1
    fi
    echo -n "."
    sleep 5
    WAIT_TIME=$((WAIT_TIME + 5))
done
echo ""
print_success "Kibana is ready!"

# Step 7: Wait for Grafana
print_header "Step 7: Waiting for Grafana to be Ready"
WAIT_TIME=0
until curl -s http://localhost:3001/api/health > /dev/null 2>&1; do
    if [ $WAIT_TIME -ge $MAX_WAIT ]; then
        print_error "Grafana failed to start within ${MAX_WAIT} seconds"
        exit 1
    fi
    echo -n "."
    sleep 5
    WAIT_TIME=$((WAIT_TIME + 5))
done
echo ""
print_success "Grafana is ready!"

# Step 8: Verify Elasticsearch indices
print_header "Step 8: Checking Elasticsearch Indices"
INDICES=$(curl -s "http://localhost:9200/_cat/indices?v" | grep careforall-logs || echo "No indices yet")
if [[ "$INDICES" == "No indices yet" ]]; then
    print_warning "No log indices found yet (this is normal on first run)"
else
    print_success "Found existing log indices:"
    echo "$INDICES"
fi

# Step 9: Rebuild and restart payment service with Logstash
print_header "Step 9: Configuring Payment Service with Logstash"

# Copy shared utilities
if [ ! -d "services/payment-service/shared" ]; then
    print_info "Copying shared utilities to payment service..."
    cp -r shared services/payment-service/
    print_success "Shared utilities copied"
fi

# Rebuild payment service
print_info "Rebuilding payment service with Logstash support..."
docker build -t payment-service:latest -f services/payment-service/Dockerfile services/payment-service > /dev/null 2>&1
print_success "Payment service image built"

# Stop old payment service
OLD_PAYMENT=$(docker ps -q --filter name=payment-service 2>/dev/null || docker ps -aq --filter name=payment 2>/dev/null | head -1)
if [ ! -z "$OLD_PAYMENT" ]; then
    print_info "Stopping old payment service..."
    docker stop $OLD_PAYMENT > /dev/null 2>&1 || true
    docker rm $OLD_PAYMENT > /dev/null 2>&1 || true
    print_success "Old payment service stopped"
fi

# Start new payment service with Logstash
print_info "Starting payment service with Logstash connection..."
docker run -d \
    -p 4004:4004 \
    --name payment-service \
    --network careforall-network \
    --network-alias payment-service \
    -e DB_HOST=careforall-mysql \
    -e LOGSTASH_HOST=logstash \
    -e LOGSTASH_PORT=5000 \
    payment-service:latest > /dev/null

sleep 3
print_success "Payment service started and connected to Logstash"

# Step 10: Generate test data
print_header "Step 10: Generating Test Logs"
print_info "Creating test payment transactions..."

for i in {1..5}; do
    AMOUNT=$((RANDOM % 1000 + 100))
    curl -s -X POST http://localhost:4004/api/payments/sslcommerz/init \
        -H "Content-Type: application/json" \
        -d "{
            \"amount\": $AMOUNT,
            \"currency\": \"BDT\",
            \"pledgeId\": \"pipeline-test-$i\",
            \"campaignId\": \"pipeline-campaign-$i\",
            \"customerName\": \"Pipeline Test User $i\",
            \"customerEmail\": \"pipeline$i@test.com\",
            \"customerPhone\": \"01777888$(printf '%03d' $i)\",
            \"customerAddress\": \"Dhaka\"
        }" > /dev/null 2>&1
    echo -n "."
    sleep 1
done
echo ""
print_success "Generated 5 test payment transactions"

# Step 11: Wait for logs to appear in Elasticsearch
print_header "Step 11: Verifying Log Pipeline"
print_info "Waiting for logs to flow through pipeline..."
sleep 5

LOG_COUNT=$(curl -s "http://localhost:9200/careforall-logs-*/_count" | jq -r '.count' 2>/dev/null || echo "0")
if [ "$LOG_COUNT" -gt "0" ]; then
    print_success "Found $LOG_COUNT logs in Elasticsearch!"
else
    print_warning "No logs found yet. They should appear within a few seconds."
fi

# Step 12: Display pipeline status
print_header "Step 12: Pipeline Status"

echo ""
echo "Service Status:"
echo "┌────────────────────┬──────────┬─────────────────────────────────┐"
echo "│ Service            │ Status   │ URL                             │"
echo "├────────────────────┼──────────┼─────────────────────────────────┤"

# Check Elasticsearch
if curl -s http://localhost:9200 > /dev/null 2>&1; then
    echo "│ Elasticsearch      │ ✅ UP    │ http://localhost:9200           │"
else
    echo "│ Elasticsearch      │ ❌ DOWN  │ http://localhost:9200           │"
fi

# Check Logstash
if curl -s http://localhost:9600 > /dev/null 2>&1; then
    echo "│ Logstash           │ ✅ UP    │ tcp://localhost:5000            │"
else
    echo "│ Logstash           │ ❌ DOWN  │ tcp://localhost:5000            │"
fi

# Check Kibana
if curl -s http://localhost:5601 > /dev/null 2>&1; then
    echo "│ Kibana             │ ✅ UP    │ http://localhost:5601           │"
else
    echo "│ Kibana             │ ❌ DOWN  │ http://localhost:5601           │"
fi

# Check Grafana
if curl -s http://localhost:3001 > /dev/null 2>&1; then
    echo "│ Grafana            │ ✅ UP    │ http://localhost:3001           │"
else
    echo "│ Grafana            │ ❌ DOWN  │ http://localhost:3001           │"
fi

# Check Payment Service
if curl -s http://localhost:4004/health > /dev/null 2>&1; then
    echo "│ Payment Service    │ ✅ UP    │ http://localhost:4004           │"
else
    echo "│ Payment Service    │ ❌ DOWN  │ http://localhost:4004           │"
fi

echo "└────────────────────┴──────────┴─────────────────────────────────┘"

# Step 13: Display data flow diagram
print_header "Data Flow Diagram"

cat << 'EOF'
┌─────────────────┐
│  Payment        │
│  Service        │ Generates logs
│  :4004          │
└────────┬────────┘
         │
         │ TCP :5000 (JSON logs)
         ▼
┌─────────────────┐
│   Logstash      │
│   :5000         │ Processes & enriches logs
└────────┬────────┘
         │
         │ HTTP :9200
         ▼
┌─────────────────┐
│ Elasticsearch   │
│ :9200           │ Stores & indexes logs
└────────┬────────┘
         │
         ├─────────────┐
         │             │
         ▼             ▼
┌─────────────┐  ┌─────────────┐
│   Kibana    │  │  Grafana    │
│   :5601     │  │  :3001      │
└─────────────┘  └─────────────┘
  Log Search      Dashboards
  & Analysis      & Alerts
EOF

# Final summary
print_header "🎉 Pipeline Setup Complete!"

echo ""
echo "📊 Access Your Observability Tools:"
echo ""
echo "  🔍 Kibana (Log Search & Analysis)"
echo "     URL: http://localhost:5601"
echo "     • Go to Discover to search logs"
echo "     • Create index pattern: careforall-logs-*"
echo "     • Time field: @timestamp"
echo ""
echo "  📈 Grafana (Dashboards & Monitoring)"
echo "     URL: http://localhost:3001"
echo "     Username: admin"
echo "     Password: admin"
echo "     • Pre-configured dashboards available"
echo "     • Elasticsearch datasource configured"
echo ""
echo "  🔧 Elasticsearch (Direct API)"
echo "     URL: http://localhost:9200"
echo ""
echo "  📝 Logstash (Log Ingestion)"
echo "     TCP: localhost:5000"
echo ""
echo "💡 Quick Commands:"
echo ""
echo "  View logs in terminal:"
echo "    curl -s 'http://localhost:9200/careforall-logs-*/_search?size=10&sort=@timestamp:desc' | jq"
echo ""
echo "  Generate more test data:"
echo "    ./kibana-visualization-guide.sh"
echo ""
echo "  View service logs:"
echo "    docker logs payment-service"
echo "    docker logs logstash"
echo "    docker logs elasticsearch"
echo ""
echo "  Stop all services:"
echo "    docker compose -f docker-compose-elk.yml down"
echo ""
echo "  Restart services:"
echo "    docker compose -f docker-compose-elk.yml restart"
echo ""
echo "📚 Documentation:"
echo "  • Full setup guide: ELK-SETUP.md"
echo "  • Kibana reference: KIBANA-QUICK-REFERENCE.md"
echo ""
print_success "Your observability pipeline is now running!"
echo ""
