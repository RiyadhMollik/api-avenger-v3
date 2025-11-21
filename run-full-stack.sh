#!/bin/bash

# Full Stack Runner - Start entire CareForAll platform with Docker
# This script orchestrates all services including ELK stack, observability, and microservices

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
MAX_RETRIES=60
RETRY_INTERVAL=2
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Print banner
print_banner() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                                                              ║"
    echo "║        CareForAll Platform - Full Stack Launcher            ║"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Print step header
print_step() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}▶ $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Wait for service to be ready
wait_for_service() {
    local service_name=$1
    local url=$2
    local max_retries=${3:-$MAX_RETRIES}
    
    echo -e "${CYAN}Waiting for ${service_name} to be ready...${NC}"
    
    for i in $(seq 1 $max_retries); do
        if curl -sf "$url" > /dev/null 2>&1; then
            echo -e "${GREEN}✓ ${service_name} is ready!${NC}"
            return 0
        fi
        echo -ne "${YELLOW}Attempt $i/$max_retries...${NC}\r"
        sleep $RETRY_INTERVAL
    done
    
    echo -e "${RED}✗ ${service_name} failed to start after $max_retries attempts${NC}"
    return 1
}

# Check Docker availability
check_docker() {
    print_step "Checking Docker"
    
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}✗ Docker is not installed${NC}"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        echo -e "${RED}✗ Docker daemon is not running${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ Docker is available${NC}"
    docker --version
}

# Clean up old containers
cleanup() {
    print_step "Cleaning Up Old Containers"
    
    echo "Stopping running containers..."
    docker compose -f docker-compose-full.yml down 2>/dev/null || true
    docker compose -f docker-compose-elk.yml down 2>/dev/null || true
    
    echo "Removing orphaned containers..."
    docker container prune -f
    
    echo "Removing unused networks..."
    docker network prune -f
    
    echo -e "${GREEN}✓ Cleanup complete${NC}"
}

# Start infrastructure services
start_infrastructure() {
    print_step "Starting Infrastructure Services"
    
    echo "Starting MySQL database..."
    docker compose -f docker-compose-full.yml up -d db
    wait_for_service "MySQL" "http://localhost:3306" 30 || echo "Note: MySQL check may fail but service might be running"
    
    echo -e "${GREEN}✓ Infrastructure services started${NC}"
}

# Start ELK stack
start_elk_stack() {
    print_step "Starting ELK Stack (Elasticsearch, Logstash, Kibana, Grafana)"
    
    echo "Building and starting ELK services..."
    docker compose -f docker-compose-elk.yml up -d --build
    
    # Wait for Elasticsearch
    wait_for_service "Elasticsearch" "http://localhost:9200/_cluster/health" 60
    
    # Wait for Logstash
    echo "Waiting for Logstash (this may take a moment)..."
    sleep 10
    
    # Wait for Kibana
    wait_for_service "Kibana" "http://localhost:5601/api/status" 60
    
    # Wait for Grafana
    wait_for_service "Grafana" "http://localhost:3001/api/health" 30
    
    echo -e "${GREEN}✓ ELK Stack is ready${NC}"
}

# Start microservices
start_microservices() {
    print_step "Starting Microservices"
    
    echo "Building and starting all microservices..."
    docker compose -f docker-compose-full.yml up -d --build \
        auth-service \
        campaign-service \
        pledge-service \
        payment-service \
        totals-service \
        chat-service \
        notification-service \
        admin-service \
        api-gateway
    
    echo "Waiting for services to initialize..."
    sleep 5
    
    # Check critical services
    wait_for_service "Auth Service" "http://localhost:4001/health" 30
    wait_for_service "API Gateway" "http://localhost:4000/health" 30
    wait_for_service "Payment Service" "http://localhost:4004/health" 30
    wait_for_service "Admin Service" "http://localhost:4007/health" 30
    
    echo -e "${GREEN}✓ All microservices are running${NC}"
}

# Start frontend
start_frontend() {
    print_step "Starting Frontend Server"
    
    cd "$PROJECT_ROOT/frontend"
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo "Installing frontend dependencies..."
        npm install
    fi
    
    # Kill existing frontend server
    pkill -f "node server.js" 2>/dev/null || true
    
    # Start frontend server
    nohup node server.js > /tmp/frontend-server.log 2>&1 &
    FRONTEND_PID=$!
    
    cd "$PROJECT_ROOT"
    
    sleep 3
    
    if curl -sf http://localhost:3002 > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Frontend server is running (PID: $FRONTEND_PID)${NC}"
    else
        echo -e "${RED}✗ Frontend server failed to start${NC}"
        echo "Check logs: cat /tmp/frontend-server.log"
    fi
}

# Configure observability
configure_observability() {
    print_step "Configuring Observability Tools"
    
    # Setup Kibana dashboards
    if [ -f "$PROJECT_ROOT/setup-kibana-pipeline.sh" ]; then
        echo "Setting up Kibana dashboards..."
        chmod +x "$PROJECT_ROOT/setup-kibana-pipeline.sh"
        bash "$PROJECT_ROOT/setup-kibana-pipeline.sh" || echo "Kibana setup completed with warnings"
    fi
    
    # Setup Grafana dashboards
    if [ -f "$PROJECT_ROOT/configure-grafana-auto.sh" ]; then
        echo "Setting up Grafana dashboards..."
        chmod +x "$PROJECT_ROOT/configure-grafana-auto.sh"
        bash "$PROJECT_ROOT/configure-grafana-auto.sh" || echo "Grafana setup completed with warnings"
    fi
    
    echo -e "${GREEN}✓ Observability configured${NC}"
}

# Display service information
display_info() {
    print_step "Service Information"
    
    echo -e "\n${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                    🌐 Access URLs                            ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}\n"
    
    echo -e "${GREEN}Frontend Services:${NC}"
    echo "  • Main Application:    http://localhost:3002"
    echo "  • Admin Dashboard:     http://localhost:3002/admin"
    echo ""
    
    echo -e "${GREEN}API Services:${NC}"
    echo "  • API Gateway:         http://localhost:4000"
    echo "  • Auth Service:        http://localhost:4001"
    echo "  • Campaign Service:    http://localhost:4002"
    echo "  • Pledge Service:      http://localhost:4003"
    echo "  • Payment Service:     http://localhost:4004"
    echo "  • Totals Service:      http://localhost:4005"
    echo "  • Chat Service:        http://localhost:4008"
    echo "  • Admin Service:       http://localhost:4007"
    echo ""
    
    echo -e "${GREEN}Observability & Monitoring:${NC}"
    echo "  • Kibana:              http://localhost:5601"
    echo "  • Grafana:             http://localhost:3001 (admin/admin)"
    echo "  • Elasticsearch:       http://localhost:9200"
    echo "  • Prometheus:          http://localhost:9090"
    echo ""
    
    echo -e "${GREEN}Development Tools:${NC}"
    echo "  • Jenkins:             http://localhost:8081"
    echo ""
    
    echo -e "\n${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                    📊 Health Checks                          ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}\n"
    
    # Check service health
    services=(
        "API Gateway:http://localhost:4000/health"
        "Auth:http://localhost:4001/health"
        "Campaign:http://localhost:4002/health"
        "Payment:http://localhost:4004/health"
        "Admin:http://localhost:4007/health"
    )
    
    for service in "${services[@]}"; do
        name="${service%%:*}"
        url="${service#*:}"
        if curl -sf "$url" > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓${NC} $name"
        else
            echo -e "  ${RED}✗${NC} $name"
        fi
    done
    
    echo -e "\n${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                    🛠️  Management Commands                    ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}\n"
    
    echo -e "${YELLOW}View Logs:${NC}"
    echo "  docker compose -f docker-compose-full.yml logs -f [service-name]"
    echo "  docker compose -f docker-compose-elk.yml logs -f"
    echo ""
    
    echo -e "${YELLOW}Restart Services:${NC}"
    echo "  docker compose -f docker-compose-full.yml restart [service-name]"
    echo ""
    
    echo -e "${YELLOW}Stop All Services:${NC}"
    echo "  docker compose -f docker-compose-full.yml down"
    echo "  docker compose -f docker-compose-elk.yml down"
    echo "  pkill -f 'node server.js'"
    echo ""
    
    echo -e "${YELLOW}Quick Tests:${NC}"
    echo "  curl http://localhost:4007/api/admin/stats"
    echo "  curl http://localhost:4000/health"
    echo "  curl http://localhost:9200/_cluster/health"
    echo ""
    
    echo -e "${YELLOW}Load Testing:${NC}"
    echo "  ./load-test-1000rps.sh"
    echo ""
}

# Main execution
main() {
    print_banner
    
    cd "$PROJECT_ROOT"
    
    # Parse arguments
    SKIP_CLEANUP=false
    SKIP_ELK=false
    QUICK_START=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-cleanup)
                SKIP_CLEANUP=true
                shift
                ;;
            --skip-elk)
                SKIP_ELK=true
                shift
                ;;
            --quick)
                QUICK_START=true
                shift
                ;;
            *)
                echo "Unknown option: $1"
                echo "Usage: $0 [--skip-cleanup] [--skip-elk] [--quick]"
                exit 1
                ;;
        esac
    done
    
    # Check prerequisites
    check_docker
    
    # Cleanup (unless skipped)
    if [ "$SKIP_CLEANUP" = false ]; then
        cleanup
    fi
    
    # Start services
    start_infrastructure
    
    if [ "$SKIP_ELK" = false ]; then
        start_elk_stack
    fi
    
    start_microservices
    start_frontend
    
    # Configure observability (skip in quick mode)
    if [ "$QUICK_START" = false ] && [ "$SKIP_ELK" = false ]; then
        configure_observability
    fi
    
    # Display information
    display_info
    
    echo -e "\n${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║          🎉 Full Stack Successfully Started! 🎉              ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}\n"
    
    # Open browser
    if command -v xdg-open &> /dev/null; then
        echo "Opening application in browser..."
        xdg-open http://localhost:3002 &
    fi
}

# Run main function
main "$@"
