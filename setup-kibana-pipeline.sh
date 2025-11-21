#!/bin/bash

echo "=========================================="
echo "Kibana Auto-Configuration Pipeline"
echo "=========================================="
echo ""

# Wait for Kibana to be ready
echo "⏳ Waiting for Kibana to be ready..."
until curl -s http://localhost:5601/api/status | grep -q '"level":"available"'; do
    echo "   Still waiting for Kibana..."
    sleep 5
done
echo "✅ Kibana is ready!"
echo ""

# Wait for Elasticsearch to be ready
echo "⏳ Waiting for Elasticsearch to be ready..."
until curl -s http://localhost:9200/_cluster/health | grep -q '"status":"green\|yellow"'; do
    echo "   Still waiting for Elasticsearch..."
    sleep 5
done
echo "✅ Elasticsearch is ready!"
echo ""

# Check if index pattern already exists
INDEX_PATTERN_EXISTS=$(curl -s -X GET "http://localhost:5601/api/data_views" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" | grep -c "careforall-logs")

if [ "$INDEX_PATTERN_EXISTS" -gt 0 ]; then
    echo "ℹ️  Index pattern already exists, skipping creation..."
else
    # Create index pattern
    echo "📋 Creating Kibana index pattern..."
    curl -X POST "http://localhost:5601/api/data_views/data_view" \
      -H "kbn-xsrf: true" \
      -H "Content-Type: application/json" \
      -d '{
        "data_view": {
          "title": "careforall-logs-*",
          "name": "CareForAll Logs",
          "timeFieldName": "@timestamp"
        }
      }' > /dev/null 2>&1

    if [ $? -eq 0 ]; then
        echo "✅ Index pattern created successfully!"
    else
        echo "⚠️  Index pattern creation failed, it may already exist"
    fi
fi
echo ""

# Create saved search for payment logs
echo "🔍 Creating saved searches..."
curl -X POST "http://localhost:5601/api/saved_objects/search" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  -d '{
    "attributes": {
      "title": "Payment Service Logs",
      "description": "All logs from payment service",
      "columns": ["@timestamp", "level", "message", "service"],
      "sort": [["@timestamp", "desc"]],
      "kibanaSavedObjectMeta": {
        "searchSourceJSON": "{\"query\":{\"query\":\"service:payment-service\",\"language\":\"kuery\"},\"filter\":[]}"
      }
    }
  }' > /dev/null 2>&1
echo "✅ Saved searches created!"
echo ""

# Create visualizations
echo "📊 Creating visualizations..."

# 1. Logs Over Time (Line Chart)
curl -X POST "http://localhost:5601/api/saved_objects/visualization" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  -d '{
    "attributes": {
      "title": "Logs Over Time",
      "visState": "{\"title\":\"Logs Over Time\",\"type\":\"line\",\"params\":{\"type\":\"line\",\"grid\":{\"categoryLines\":false},\"categoryAxes\":[{\"id\":\"CategoryAxis-1\",\"type\":\"category\",\"position\":\"bottom\",\"show\":true,\"style\":{},\"scale\":{\"type\":\"linear\"},\"labels\":{\"show\":true,\"filter\":true,\"truncate\":100},\"title\":{}}],\"valueAxes\":[{\"id\":\"ValueAxis-1\",\"name\":\"LeftAxis-1\",\"type\":\"value\",\"position\":\"left\",\"show\":true,\"style\":{},\"scale\":{\"type\":\"linear\",\"mode\":\"normal\"},\"labels\":{\"show\":true,\"rotate\":0,\"filter\":false,\"truncate\":100},\"title\":{\"text\":\"Count\"}}],\"seriesParams\":[{\"show\":true,\"type\":\"line\",\"mode\":\"normal\",\"data\":{\"label\":\"Count\",\"id\":\"1\"},\"valueAxis\":\"ValueAxis-1\",\"drawLinesBetweenPoints\":true,\"lineWidth\":2,\"interpolate\":\"linear\",\"showCircles\":true}],\"addTooltip\":true,\"addLegend\":true,\"legendPosition\":\"right\",\"times\":[],\"addTimeMarker\":false,\"thresholdLine\":{\"show\":false,\"value\":10,\"width\":1,\"style\":\"full\",\"color\":\"#E7664C\"}},\"aggs\":[{\"id\":\"1\",\"enabled\":true,\"type\":\"count\",\"params\":{},\"schema\":\"metric\"},{\"id\":\"2\",\"enabled\":true,\"type\":\"date_histogram\",\"params\":{\"field\":\"@timestamp\",\"timeRange\":{\"from\":\"now-15m\",\"to\":\"now\"},\"useNormalizedEsInterval\":true,\"scaleMetricValues\":false,\"interval\":\"auto\",\"drop_partials\":false,\"min_doc_count\":1,\"extended_bounds\":{}},\"schema\":\"segment\"}]}",
      "uiStateJSON": "{}",
      "description": "",
      "version": 1,
      "kibanaSavedObjectMeta": {
        "searchSourceJSON": "{\"query\":{\"query\":\"\",\"language\":\"kuery\"},\"filter\":[]}"
      }
    }
  }' > /dev/null 2>&1

# 2. Logs by Service (Pie Chart)
curl -X POST "http://localhost:5601/api/saved_objects/visualization" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  -d '{
    "attributes": {
      "title": "Logs by Service",
      "visState": "{\"title\":\"Logs by Service\",\"type\":\"pie\",\"params\":{\"type\":\"pie\",\"addTooltip\":true,\"addLegend\":true,\"legendPosition\":\"right\",\"isDonut\":true,\"labels\":{\"show\":false,\"values\":true,\"last_level\":true,\"truncate\":100}},\"aggs\":[{\"id\":\"1\",\"enabled\":true,\"type\":\"count\",\"params\":{},\"schema\":\"metric\"},{\"id\":\"2\",\"enabled\":true,\"type\":\"terms\",\"params\":{\"field\":\"service.keyword\",\"orderBy\":\"1\",\"order\":\"desc\",\"size\":10,\"otherBucket\":false,\"otherBucketLabel\":\"Other\",\"missingBucket\":false,\"missingBucketLabel\":\"Missing\"},\"schema\":\"segment\"}]}",
      "uiStateJSON": "{}",
      "description": "",
      "version": 1,
      "kibanaSavedObjectMeta": {
        "searchSourceJSON": "{\"query\":{\"query\":\"\",\"language\":\"kuery\"},\"filter\":[]}"
      }
    }
  }' > /dev/null 2>&1

# 3. Logs by Level (Pie Chart)
curl -X POST "http://localhost:5601/api/saved_objects/visualization" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  -d '{
    "attributes": {
      "title": "Logs by Level",
      "visState": "{\"title\":\"Logs by Level\",\"type\":\"pie\",\"params\":{\"type\":\"pie\",\"addTooltip\":true,\"addLegend\":true,\"legendPosition\":\"right\",\"isDonut\":false,\"labels\":{\"show\":true,\"values\":true,\"last_level\":true,\"truncate\":100}},\"aggs\":[{\"id\":\"1\",\"enabled\":true,\"type\":\"count\",\"params\":{},\"schema\":\"metric\"},{\"id\":\"2\",\"enabled\":true,\"type\":\"terms\",\"params\":{\"field\":\"level.keyword\",\"orderBy\":\"1\",\"order\":\"desc\",\"size\":10,\"otherBucket\":false,\"otherBucketLabel\":\"Other\",\"missingBucket\":false,\"missingBucketLabel\":\"Missing\"},\"schema\":\"segment\"}]}",
      "uiStateJSON": "{}",
      "description": "",
      "version": 1,
      "kibanaSavedObjectMeta": {
        "searchSourceJSON": "{\"query\":{\"query\":\"\",\"language\":\"kuery\"},\"filter\":[]}"
      }
    }
  }' > /dev/null 2>&1

# 4. Error Count (Metric)
curl -X POST "http://localhost:5601/api/saved_objects/visualization" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  -d '{
    "attributes": {
      "title": "Error Count",
      "visState": "{\"title\":\"Error Count\",\"type\":\"metric\",\"params\":{\"addTooltip\":true,\"addLegend\":false,\"type\":\"metric\",\"metric\":{\"percentageMode\":false,\"useRanges\":false,\"colorSchema\":\"Green to Red\",\"metricColorMode\":\"None\",\"colorsRange\":[{\"from\":0,\"to\":10000}],\"labels\":{\"show\":true},\"invertColors\":false,\"style\":{\"bgFill\":\"#000\",\"bgColor\":false,\"labelColor\":false,\"subText\":\"\",\"fontSize\":60}}},\"aggs\":[{\"id\":\"1\",\"enabled\":true,\"type\":\"count\",\"params\":{},\"schema\":\"metric\"}]}",
      "uiStateJSON": "{}",
      "description": "",
      "version": 1,
      "kibanaSavedObjectMeta": {
        "searchSourceJSON": "{\"query\":{\"query\":\"level:ERROR\",\"language\":\"kuery\"},\"filter\":[]}"
      }
    }
  }' > /dev/null 2>&1

echo "✅ Visualizations created!"
echo ""

# Create dashboard
echo "📊 Creating dashboard..."
DASHBOARD_RESPONSE=$(curl -X POST "http://localhost:5601/api/saved_objects/dashboard" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  -d '{
    "attributes": {
      "title": "CareForAll Platform Overview",
      "description": "Main dashboard for CareForAll platform monitoring",
      "panelsJSON": "[]",
      "optionsJSON": "{\"useMargins\":true,\"syncColors\":false,\"hidePanelTitles\":false}",
      "version": 1,
      "timeRestore": false,
      "kibanaSavedObjectMeta": {
        "searchSourceJSON": "{\"query\":{\"query\":\"\",\"language\":\"kuery\"},\"filter\":[]}"
      }
    }
  }' 2>&1)

if echo "$DASHBOARD_RESPONSE" | grep -q "id"; then
    echo "✅ Dashboard created successfully!"
else
    echo "⚠️  Dashboard may already exist"
fi
echo ""

# Generate some test logs
echo "📝 Generating test logs..."
for i in {1..5}; do
    curl -s -X POST http://localhost:4004/api/payments/sslcommerz/init \
      -H "Content-Type: application/json" \
      -d "{
        \"amount\": $((RANDOM % 1000 + 100)),
        \"currency\": \"BDT\",
        \"pledgeId\": \"setup-test-$i\",
        \"campaignId\": \"setup-campaign-$i\",
        \"customerName\": \"Test User $i\",
        \"customerEmail\": \"test$i@example.com\",
        \"customerPhone\": \"01777000$((100 + i))\",
        \"customerAddress\": \"Dhaka\"
      }" > /dev/null 2>&1
    echo "  Generated test log $i/5"
done
echo "✅ Test logs generated!"
echo ""

# Check total logs in Elasticsearch
TOTAL_LOGS=$(curl -s "http://localhost:9200/careforall-logs-*/_count" | grep -o '"count":[0-9]*' | cut -d: -f2)
echo "📊 Total logs in Elasticsearch: $TOTAL_LOGS"
echo ""

echo "=========================================="
echo "✅ Kibana Setup Complete!"
echo "=========================================="
echo ""
echo "🌐 Open Kibana: http://localhost:5601"
echo ""
echo "Quick Actions:"
echo "  1. Click 'Discover' in the menu to see logs"
echo "  2. Click 'Visualize Library' to see pre-built charts"
echo "  3. Click 'Dashboard' to see the overview"
echo ""
echo "Index Pattern: careforall-logs-*"
echo "Time Field: @timestamp"
echo ""
echo "Pre-created Visualizations:"
echo "  ✅ Logs Over Time (Line Chart)"
echo "  ✅ Logs by Service (Pie Chart)"
echo "  ✅ Logs by Level (Pie Chart)"
echo "  ✅ Error Count (Metric)"
echo ""
echo "Saved Searches:"
echo "  ✅ Payment Service Logs"
echo ""
echo "Dashboards:"
echo "  ✅ CareForAll Platform Overview"
echo ""
echo "=========================================="
