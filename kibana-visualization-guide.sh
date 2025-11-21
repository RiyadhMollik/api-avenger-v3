#!/bin/bash

# Kibana Visualization Walkthrough Script
# This script helps you create your first Kibana visualizations

echo "=========================================="
echo "Kibana Visualization Setup Guide"
echo "=========================================="
echo ""

# Check if Kibana is running
if ! curl -s http://localhost:5601/api/status > /dev/null 2>&1; then
    echo "❌ Kibana is not running on http://localhost:5601"
    echo "Start it with: docker compose -f docker-compose-elk.yml up -d"
    exit 1
fi

echo "✅ Kibana is running at http://localhost:5601"
echo ""

# Generate some test logs
echo "📝 Generating test logs for visualization..."
for i in {1..10}; do
    curl -s -X POST http://localhost:4004/api/payments/sslcommerz/init \
      -H "Content-Type: application/json" \
      -d "{
        \"amount\": $((RANDOM % 1000 + 100)),
        \"currency\": \"BDT\",
        \"pledgeId\": \"demo-pledge-$i\",
        \"campaignId\": \"demo-campaign-$i\",
        \"customerName\": \"Demo User $i\",
        \"customerEmail\": \"demo$i@test.com\",
        \"customerPhone\": \"01777888$((1000 + i))\",
        \"customerAddress\": \"Dhaka\"
      }" > /dev/null 2>&1
    echo "  Created test payment $i/10"
    sleep 1
done

echo ""
echo "✅ Test logs generated!"
echo ""

# Check logs in Elasticsearch
TOTAL_LOGS=$(curl -s "http://localhost:9200/careforall-logs-*/_count" | jq '.count')
echo "📊 Total logs in Elasticsearch: $TOTAL_LOGS"
echo ""

echo "=========================================="
echo "Next Steps: Create Visualizations in Kibana"
echo "=========================================="
echo ""
echo "1. Open Kibana:"
echo "   http://localhost:5601"
echo ""
echo "2. Create Index Pattern (if not done):"
echo "   • Click Menu (☰) → Stack Management → Index Patterns"
echo "   • Click 'Create index pattern'"
echo "   • Enter: careforall-logs-*"
echo "   • Select time field: @timestamp"
echo "   • Click 'Create index pattern'"
echo ""
echo "3. View Logs in Discover:"
echo "   • Click Menu (☰) → Discover"
echo "   • You should see $TOTAL_LOGS logs"
echo "   • Try searching: service:\"payment-service\""
echo ""
echo "4. Create Your First Visualization:"
echo "   • Click Menu (☰) → Visualize Library"
echo "   • Click 'Create visualization'"
echo "   • Select 'Lens' (easiest option)"
echo "   • Drag '@timestamp' to X-axis"
echo "   • You'll see a line chart of logs over time!"
echo "   • Click 'Save' and name it 'Logs Over Time'"
echo ""
echo "5. Create More Visualizations:"
echo ""
echo "   A. Logs by Service (Pie Chart):"
echo "      • Visualize Library → Create → Lens"
echo "      • Drag 'service' field to center"
echo "      • Change to Pie chart (top toolbar)"
echo "      • Save as 'Logs by Service'"
echo ""
echo "   B. Error Count (Metric):"
echo "      • Visualize Library → Create → Lens"
echo "      • Add filter: level = ERROR"
echo "      • Change to Metric type"
echo "      • Save as 'Error Count'"
echo ""
echo "   C. Payment Events (Table):"
echo "      • Visualize Library → Create → Lens"
echo "      • Drag 'message' to workspace"
echo "      • Change to Table"
echo "      • Add columns: service, level, @timestamp"
echo "      • Filter: service = payment-service"
echo "      • Save as 'Payment Events'"
echo ""
echo "6. Create Dashboard:"
echo "   • Click Menu (☰) → Dashboard"
echo "   • Click 'Create dashboard'"
echo "   • Click 'Add' → Select your visualizations"
echo "   • Arrange them by dragging"
echo "   • Save as 'CareForAll Monitoring'"
echo ""
echo "=========================================="
echo "Useful Kibana Search Queries"
echo "=========================================="
echo ""
echo "In Discover, try these searches:"
echo ""
echo "  service:\"payment-service\""
echo "  level:\"ERROR\""
echo "  message:\"Payment captured\""
echo "  service:\"payment-service\" AND level:\"INFO\""
echo "  amount > 500"
echo "  @timestamp > now-1h"
echo ""
echo "=========================================="
echo "Quick Actions"
echo "=========================================="
echo ""
echo "View logs in terminal:"
echo "  curl -s 'http://localhost:9200/careforall-logs-*/_search?size=5&sort=@timestamp:desc' | jq"
echo ""
echo "Search for errors:"
echo "  curl -s 'http://localhost:9200/careforall-logs-*/_search' -H 'Content-Type: application/json' -d '{\"query\":{\"match\":{\"level\":\"ERROR\"}}}' | jq"
echo ""
echo "Generate more test data:"
echo "  bash $0"
echo ""
echo "Open Kibana:"
echo "  xdg-open http://localhost:5601"
echo ""
echo "=========================================="
echo "📚 Full documentation: ELK-SETUP.md"
echo "=========================================="
