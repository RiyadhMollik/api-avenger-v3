#!/bin/bash

echo "========================================="
echo "Starting ELK Stack (Elasticsearch, Logstash, Kibana)"
echo "========================================="

# Create network if it doesn't exist
docker network create careforall-network 2>/dev/null || true

# Start ELK stack
echo ""
echo "Starting Elasticsearch, Logstash, and Kibana..."
docker-compose -f docker-compose-elk.yml up -d

# Wait for Elasticsearch to be ready
echo ""
echo "Waiting for Elasticsearch to be ready..."
until curl -s http://localhost:9200/_cluster/health | grep -q '"status":"green\|yellow"'; do
  echo "Waiting for Elasticsearch..."
  sleep 5
done
echo "✅ Elasticsearch is ready!"

# Wait for Logstash to be ready
echo ""
echo "Waiting for Logstash to be ready..."
until curl -s http://localhost:9600 > /dev/null 2>&1; do
  echo "Waiting for Logstash..."
  sleep 5
done
echo "✅ Logstash is ready!"

# Wait for Kibana to be ready
echo ""
echo "Waiting for Kibana to be ready..."
until curl -s http://localhost:5601/api/status | grep -q '"level":"available"'; do
  echo "Waiting for Kibana..."
  sleep 5
done
echo "✅ Kibana is ready!"

echo ""
echo "========================================="
echo "ELK Stack is ready!"
echo "========================================="
echo ""
echo "Services:"
echo "  - Elasticsearch: http://localhost:9200"
echo "  - Kibana:        http://localhost:5601"
echo "  - Logstash:      tcp://localhost:5000"
echo ""
echo "Kibana Dashboard: http://localhost:5601"
echo ""
echo "To view logs in Kibana:"
echo "  1. Open http://localhost:5601"
echo "  2. Go to 'Discover' in the menu"
echo "  3. Create index pattern: careforall-logs-*"
echo "  4. Select @timestamp as time field"
echo "  5. View your logs!"
echo ""
echo "To rebuild services with Logstash support:"
echo "  docker build -t payment-service:latest -f services/payment-service/Dockerfile services/payment-service"
echo "  docker run -d -p 4004:4004 --network careforall-network -e DB_HOST=careforall-mysql -e LOGSTASH_HOST=logstash -e LOGSTASH_PORT=5000 payment-service:latest"
echo ""
