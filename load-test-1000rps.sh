#!/bin/bash

# High-Performance Load Test Script
# Sends 1000 requests per second to test the platform

set -e

echo "=========================================="
echo "🚀 CareForAll Load Test - 1000 RPS"
echo "=========================================="
echo ""

# Configuration
TARGET_URL="http://localhost:4004/api/payments/sslcommerz/init"
REQUESTS_PER_SECOND=1000
DURATION_SECONDS=60
TOTAL_REQUESTS=$((REQUESTS_PER_SECOND * DURATION_SECONDS))
CONCURRENT_WORKERS=50

# Check if payment service is running
if ! curl -s http://localhost:4004/health > /dev/null 2>&1; then
    echo "❌ Payment service is not running on port 4004"
    echo "Starting payment service..."
    
    # Clean up any existing containers on port 4004
    docker ps -a | grep 4004 | awk '{print $1}' | xargs -r docker stop 2>/dev/null
    docker ps -a | grep 4004 | awk '{print $1}' | xargs -r docker rm 2>/dev/null
    
    # Start payment service
    docker run -d \
      -p 4004:4004 \
      --network careforall-network \
      --network-alias payment-service \
      -e DB_HOST=careforall-mysql \
      -e LOGSTASH_HOST=logstash \
      -e LOGSTASH_PORT=5000 \
      payment-service:latest
    
    echo "⏳ Waiting for service to start..."
    sleep 10
fi

echo "✅ Payment service is running"
echo ""

# Check if required tools are installed
if ! command -v hey &> /dev/null && ! command -v ab &> /dev/null && ! command -v wrk &> /dev/null; then
    echo "📦 Installing load testing tool (hey)..."
    
    # Install hey (HTTP load generator)
    if command -v go &> /dev/null; then
        go install github.com/rakyll/hey@latest
        export PATH=$PATH:$(go env GOPATH)/bin
    else
        echo "Installing hey using wget..."
        wget -q https://hey-release.s3.us-east-2.amazonaws.com/hey_linux_amd64 -O /tmp/hey
        chmod +x /tmp/hey
        sudo mv /tmp/hey /usr/local/bin/hey 2>/dev/null || mv /tmp/hey ~/hey
        export PATH=$PATH:~
    fi
fi

# Create test data file
TEST_DATA=$(cat <<EOF
{
  "amount": 500,
  "currency": "BDT",
  "pledgeId": "load-test-\$RANDOM",
  "campaignId": "campaign-\$RANDOM",
  "customerName": "Load Test User",
  "customerEmail": "loadtest@example.com",
  "customerPhone": "01777888999",
  "customerAddress": "Dhaka"
}
EOF
)

echo "$TEST_DATA" > /tmp/test_payload.json

echo "=========================================="
echo "📊 Load Test Configuration"
echo "=========================================="
echo "Target: $TARGET_URL"
echo "Requests Per Second: $REQUESTS_PER_SECOND RPS"
echo "Duration: $DURATION_SECONDS seconds"
echo "Total Requests: $TOTAL_REQUESTS"
echo "Concurrent Workers: $CONCURRENT_WORKERS"
echo ""
echo "=========================================="
echo "🔥 Starting Load Test..."
echo "=========================================="
echo ""

# Record start time
START_TIME=$(date +%s)

# Run load test using available tool
if command -v hey &> /dev/null; then
    echo "Using 'hey' for load testing..."
    hey -z ${DURATION_SECONDS}s \
        -q $((REQUESTS_PER_SECOND / CONCURRENT_WORKERS)) \
        -c $CONCURRENT_WORKERS \
        -m POST \
        -H "Content-Type: application/json" \
        -D /tmp/test_payload.json \
        $TARGET_URL
        
elif command -v wrk &> /dev/null; then
    echo "Using 'wrk' for load testing..."
    wrk -t$CONCURRENT_WORKERS \
        -c$CONCURRENT_WORKERS \
        -d${DURATION_SECONDS}s \
        -s <(cat <<'HEREDOC'
wrk.method = "POST"
wrk.headers["Content-Type"] = "application/json"
wrk.body = '{"amount":500,"currency":"BDT","pledgeId":"load-test-'..math.random(1000,9999)..'","campaignId":"campaign-001","customerName":"Load Test","customerEmail":"test@test.com","customerPhone":"01777888999","customerAddress":"Dhaka"}'
HEREDOC
) $TARGET_URL

elif command -v ab &> /dev/null; then
    echo "Using 'ab' (Apache Bench) for load testing..."
    ab -n $TOTAL_REQUESTS \
       -c $CONCURRENT_WORKERS \
       -p /tmp/test_payload.json \
       -T "application/json" \
       $TARGET_URL

else
    echo "No load testing tool available. Using custom bash script..."
    
    # Fallback: Custom bash script with parallel requests
    generate_load() {
        local requests_per_worker=$1
        for i in $(seq 1 $requests_per_worker); do
            RANDOM_ID=$((RANDOM % 10000))
            curl -s -X POST $TARGET_URL \
                -H "Content-Type: application/json" \
                -d "{
                    \"amount\": $((RANDOM % 1000 + 100)),
                    \"currency\": \"BDT\",
                    \"pledgeId\": \"load-test-$RANDOM_ID\",
                    \"campaignId\": \"campaign-$RANDOM_ID\",
                    \"customerName\": \"Load Test User $RANDOM_ID\",
                    \"customerEmail\": \"loadtest$RANDOM_ID@example.com\",
                    \"customerPhone\": \"01777888$RANDOM_ID\",
                    \"customerAddress\": \"Dhaka\"
                }" > /dev/null 2>&1
            
            # Throttle to achieve target RPS
            sleep 0.001
        done
    }
    
    export -f generate_load
    export TARGET_URL
    
    REQUESTS_PER_WORKER=$((TOTAL_REQUESTS / CONCURRENT_WORKERS))
    
    echo "Starting $CONCURRENT_WORKERS workers..."
    for i in $(seq 1 $CONCURRENT_WORKERS); do
        generate_load $REQUESTS_PER_WORKER &
    done
    
    # Wait for all background jobs
    wait
fi

# Record end time
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo "=========================================="
echo "✅ Load Test Complete!"
echo "=========================================="
echo "Duration: ${ELAPSED}s"
echo ""

# Get statistics from Elasticsearch
echo "📊 Collecting Results..."
sleep 5

TOTAL_LOGS=$(curl -s "http://localhost:9200/careforall-logs-*/_count" | jq '.count')
ERROR_LOGS=$(curl -s "http://localhost:9200/careforall-logs-*/_count?q=level:ERROR" | jq '.count')
PAYMENT_CREATED=$(curl -s "http://localhost:9200/careforall-logs-*/_count?q=message:*Payment%20created*" | jq '.count')

echo ""
echo "=========================================="
echo "📈 Test Results"
echo "=========================================="
echo "Total Logs Generated: $TOTAL_LOGS"
echo "Payments Created: $PAYMENT_CREATED"
echo "Errors: $ERROR_LOGS"
echo "Actual RPS: $((PAYMENT_CREATED / ELAPSED))"
echo ""
echo "=========================================="
echo "🎯 View Results in Grafana"
echo "=========================================="
echo ""
echo "Grafana Dashboard:"
echo "  http://localhost:3001/d/careforall-elasticsearch"
echo ""
echo "Kibana Dashboard:"
echo "  http://localhost:5601/app/dashboards"
echo ""
echo "The dashboards will show:"
echo "  ✓ Request rate spike"
echo "  ✓ Log volume increase"
echo "  ✓ Service performance"
echo "  ✓ Error rate (if any)"
echo ""
echo "🔄 Dashboards auto-refresh every 5 seconds"
echo "=========================================="

# Open Grafana dashboard
if command -v xdg-open &> /dev/null; then
    xdg-open "http://localhost:3001/d/careforall-elasticsearch" 2>/dev/null &
fi

# Clean up
rm -f /tmp/test_payload.json

echo ""
echo "✅ Load test completed successfully!"
