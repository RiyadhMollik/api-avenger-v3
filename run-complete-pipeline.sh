#!/bin/bash

#############################################
# CareForAll Platform - Complete Pipeline
# Automated setup with ELK + Grafana + Load Testing
#############################################

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_banner() {
    echo "=============================================="
    echo "  CareForAll Platform - Complete Pipeline"
    echo "  ELK Stack + Grafana + Load Testing"
    echo "=============================================="
    echo ""
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    command -v docker >/dev/null 2>&1 || { log_error "Docker is required but not installed."; exit 1; }
    command -v curl >/dev/null 2>&1 || { log_error "curl is required but not installed."; exit 1; }
    command -v jq >/dev/null 2>&1 || { log_error "jq is required but not installed."; exit 1; }
    
    log_success "Prerequisites check passed!"
}

# Start infrastructure
start_infrastructure() {
    log_info "Starting infrastructure (ELK + Grafana)..."
    
    # Create network
    docker network create careforall-network 2>/dev/null || true
    
    # Start ELK stack
    cd "$PROJECT_ROOT"
    docker compose -f docker-compose-elk.yml up -d
    
    log_success "Infrastructure started!"
}

# Wait for services
wait_for_service() {
    local name=$1
    local url=$2
    local max_attempts=30
    local attempt=0
    
    log_info "Waiting for $name to be ready..."
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -s "$url" >/dev/null 2>&1; then
            log_success "$name is ready!"
            return 0
        fi
        attempt=$((attempt + 1))
        echo -n "."
        sleep 2
    done
    
    log_error "$name failed to start!"
    return 1
}

# Configure Kibana
configure_kibana() {
    log_info "Auto-configuring Kibana..."
    
    "$PROJECT_ROOT/setup-kibana-pipeline.sh"
    
    log_success "Kibana configured with visualizations!"
}

# Configure Grafana
configure_grafana() {
    log_info "Auto-configuring Grafana..."
    
    local GRAFANA_URL="http://localhost:3001"
    local GRAFANA_USER="admin"
    local GRAFANA_PASS="admin"
    
    # Wait for Grafana
    wait_for_service "Grafana" "$GRAFANA_URL/api/health"
    
    # Create Elasticsearch datasource
    log_info "Creating Elasticsearch datasource in Grafana..."
    curl -s -X POST "$GRAFANA_URL/api/datasources" \
        -u "$GRAFANA_USER:$GRAFANA_PASS" \
        -H "Content-Type: application/json" \
        -d '{
            "name": "Elasticsearch-Logs",
            "type": "elasticsearch",
            "url": "http://elasticsearch:9200",
            "access": "proxy",
            "database": "[careforall-logs-]YYYY.MM.DD",
            "jsonData": {
                "esVersion": "8.0.0",
                "timeField": "@timestamp",
                "interval": "Daily",
                "logMessageField": "message",
                "logLevelField": "level"
            }
        }' >/dev/null 2>&1 || log_warning "Datasource may already exist"
    
    # Import dashboards
    log_info "Importing Grafana dashboards..."
    
    # Service Health Dashboard
    cat > /tmp/grafana-dashboard-1.json << 'EOF'
{
  "dashboard": {
    "title": "CareForAll - Service Health",
    "tags": ["careforall", "health", "monitoring"],
    "timezone": "browser",
    "refresh": "5s",
    "time": {
      "from": "now-1h",
      "to": "now"
    },
    "panels": [
      {
        "id": 1,
        "title": "Total Logs",
        "type": "stat",
        "gridPos": {"h": 6, "w": 6, "x": 0, "y": 0},
        "targets": [{
          "datasource": "Elasticsearch-Logs",
          "refId": "A",
          "metrics": [{"type": "count", "id": "1"}],
          "query": "*"
        }],
        "options": {
          "graphMode": "area",
          "colorMode": "background"
        }
      },
      {
        "id": 2,
        "title": "Error Rate",
        "type": "stat",
        "gridPos": {"h": 6, "w": 6, "x": 6, "y": 0},
        "targets": [{
          "datasource": "Elasticsearch-Logs",
          "refId": "A",
          "metrics": [{"type": "count", "id": "1"}],
          "query": "level:ERROR"
        }],
        "options": {
          "graphMode": "area",
          "colorMode": "background"
        },
        "fieldConfig": {
          "defaults": {
            "thresholds": {
              "steps": [
                {"value": 0, "color": "green"},
                {"value": 10, "color": "yellow"},
                {"value": 50, "color": "red"}
              ]
            }
          }
        }
      },
      {
        "id": 3,
        "title": "Active Services",
        "type": "stat",
        "gridPos": {"h": 6, "w": 6, "x": 12, "y": 0},
        "targets": [{
          "datasource": "Elasticsearch-Logs",
          "refId": "A",
          "metrics": [{"type": "cardinality", "field": "service.keyword", "id": "1"}],
          "query": "*"
        }]
      },
      {
        "id": 4,
        "title": "Requests Per Second",
        "type": "stat",
        "gridPos": {"h": 6, "w": 6, "x": 18, "y": 0},
        "targets": [{
          "datasource": "Elasticsearch-Logs",
          "refId": "A",
          "metrics": [{"type": "count", "id": "1"}],
          "query": "message:*HTTP Request*"
        }]
      },
      {
        "id": 5,
        "title": "Log Volume Over Time",
        "type": "timeseries",
        "gridPos": {"h": 8, "w": 24, "x": 0, "y": 6},
        "targets": [{
          "datasource": "Elasticsearch-Logs",
          "refId": "A",
          "metrics": [{"type": "count", "id": "1"}],
          "bucketAggs": [{"type": "date_histogram", "field": "@timestamp", "id": "2"}],
          "query": "*"
        }]
      },
      {
        "id": 6,
        "title": "Logs by Service",
        "type": "piechart",
        "gridPos": {"h": 8, "w": 12, "x": 0, "y": 14},
        "targets": [{
          "datasource": "Elasticsearch-Logs",
          "refId": "A",
          "metrics": [{"type": "count", "id": "1"}],
          "bucketAggs": [{"type": "terms", "field": "service.keyword", "id": "2"}],
          "query": "*"
        }]
      },
      {
        "id": 7,
        "title": "Logs by Level",
        "type": "piechart",
        "gridPos": {"h": 8, "w": 12, "x": 12, "y": 14},
        "targets": [{
          "datasource": "Elasticsearch-Logs",
          "refId": "A",
          "metrics": [{"type": "count", "id": "1"}],
          "bucketAggs": [{"type": "terms", "field": "level.keyword", "id": "2"}],
          "query": "*"
        }]
      }
    ]
  },
  "overwrite": true
}
EOF
    
    curl -s -X POST "$GRAFANA_URL/api/dashboards/db" \
        -u "$GRAFANA_USER:$GRAFANA_PASS" \
        -H "Content-Type: application/json" \
        -d @/tmp/grafana-dashboard-1.json >/dev/null 2>&1
    
    rm /tmp/grafana-dashboard-1.json
    
    log_success "Grafana configured with dashboards!"
}

# Build services
build_services() {
    log_info "Building payment service..."
    
    cd "$PROJECT_ROOT"
    docker build -t payment-service:latest -f services/payment-service/Dockerfile services/payment-service
    
    log_success "Services built successfully!"
}

# Start services
start_services() {
    log_info "Starting payment service..."
    
    # Stop old containers
    docker ps -a | grep payment-service | awk '{print $1}' | xargs -r docker stop >/dev/null 2>&1 || true
    docker ps -a | grep payment-service | awk '{print $1}' | xargs -r docker rm >/dev/null 2>&1 || true
    
    # Start payment service with logging
    docker run -d \
        -p 4004:4004 \
        --network careforall-network \
        --network-alias payment-service \
        -e DB_HOST=careforall-mysql \
        -e LOGSTASH_HOST=logstash \
        -e LOGSTASH_PORT=5000 \
        payment-service:latest
    
    sleep 5
    log_success "Services started!"
}

# Run load test
run_load_test() {
    log_info "Starting load test..."
    
    local PAYMENT_URL="http://localhost:4004/api/payments/sslcommerz/init"
    local REQUESTS=50
    local CONCURRENT=5
    
    log_info "Sending $REQUESTS requests with $CONCURRENT concurrent connections..."
    
    for i in $(seq 1 $REQUESTS); do
        (
            curl -s -X POST "$PAYMENT_URL" \
                -H "Content-Type: application/json" \
                -d "{
                    \"amount\": $((RANDOM % 1000 + 100)),
                    \"currency\": \"BDT\",
                    \"pledgeId\": \"load-test-$i\",
                    \"campaignId\": \"campaign-$((i % 10))\",
                    \"customerName\": \"Load Test User $i\",
                    \"customerEmail\": \"loadtest$i@test.com\",
                    \"customerPhone\": \"01777${i}00\",
                    \"customerAddress\": \"Dhaka\"
                }" > /dev/null
        ) &
        
        if [ $((i % CONCURRENT)) -eq 0 ]; then
            wait
            echo -n "."
        fi
    done
    wait
    echo ""
    
    log_success "Load test completed! ($REQUESTS requests sent)"
}

# Generate test logs
generate_test_logs() {
    log_info "Generating additional test data..."
    
    # Create some errors
    for i in {1..5}; do
        docker exec $(docker ps -q -f name=payment-service) \
            node -e "console.log(JSON.stringify({level:'ERROR',message:'Test error $i',service:'payment-service'}))" \
            >/dev/null 2>&1 || true
    done
    
    sleep 2
    log_success "Test logs generated!"
}

# Display results
display_results() {
    echo ""
    echo "=============================================="
    echo "  🎉 Pipeline Completed Successfully!"
    echo "=============================================="
    echo ""
    
    # Count logs
    local total_logs=$(curl -s "http://localhost:9200/careforall-logs-*/_count" | jq -r '.count // 0')
    
    echo "📊 Statistics:"
    echo "  Total Logs: $total_logs"
    echo ""
    
    echo "🌐 Access URLs:"
    echo "  Kibana:        http://localhost:5601"
    echo "  Grafana:       http://localhost:3001 (admin/admin)"
    echo "  Elasticsearch: http://localhost:9200"
    echo "  Payment API:   http://localhost:4004"
    echo ""
    
    echo "📈 Grafana Dashboards:"
    echo "  Service Health: http://localhost:3001/d/service-health"
    echo ""
    
    echo "📊 Kibana Dashboards:"
    echo "  Platform Overview: http://localhost:5601/app/dashboards"
    echo ""
    
    echo "🔍 Quick Checks:"
    echo "  View logs:     curl -s 'http://localhost:9200/careforall-logs-*/_search?size=5' | jq"
    echo "  Health check:  curl http://localhost:4004/health"
    echo ""
    
    echo "⚡ Load Testing:"
    echo "  Run again:     $0 --load-test-only"
    echo ""
    
    echo "=============================================="
}

# Main execution
main() {
    local start_time=$(date +%s)
    
    print_banner
    
    # Parse arguments
    if [[ "$1" == "--load-test-only" ]]; then
        log_info "Running load test only..."
        run_load_test
        display_results
        exit 0
    fi
    
    if [[ "$1" == "--quick" ]]; then
        log_info "Quick mode: Skipping load tests..."
        SKIP_LOAD_TEST=true
    fi
    
    # Execute pipeline
    check_prerequisites
    start_infrastructure
    
    # Wait for services
    wait_for_service "Elasticsearch" "http://localhost:9200/_cluster/health"
    wait_for_service "Kibana" "http://localhost:5601/api/status"
    wait_for_service "Logstash" "http://localhost:9600"
    
    configure_kibana
    configure_grafana
    build_services
    start_services
    
    # Wait for service to be healthy
    wait_for_service "Payment Service" "http://localhost:4004/health" || log_warning "Payment service may not be healthy"
    
    if [[ "$SKIP_LOAD_TEST" != "true" ]]; then
        run_load_test
    fi
    
    generate_test_logs
    
    # Calculate duration
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    display_results
    
    log_success "Pipeline completed in ${duration}s"
    
    # Open browsers
    if command -v xdg-open >/dev/null 2>&1; then
        log_info "Opening Grafana and Kibana in browser..."
        xdg-open "http://localhost:3001/d/service-health" 2>/dev/null &
        sleep 2
        xdg-open "http://localhost:5601/app/dashboards" 2>/dev/null &
    fi
}

# Run main
main "$@"
