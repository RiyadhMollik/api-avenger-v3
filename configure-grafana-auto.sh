#!/bin/bash

# Grafana Auto-Configuration Script
# Configures Grafana dashboards to show Elasticsearch data automatically

echo "=========================================="
echo "🎨 Grafana Auto-Configuration"
echo "=========================================="
echo ""

GRAFANA_URL="http://localhost:3001"
GRAFANA_USER="admin"
GRAFANA_PASS="admin"
ES_URL="http://localhost:9200"

# Wait for Grafana
echo "⏳ Waiting for Grafana..."
until curl -s ${GRAFANA_URL}/api/health > /dev/null 2>&1; do
    sleep 2
done
echo "✅ Grafana is ready!"

# Wait for Elasticsearch
echo "⏳ Waiting for Elasticsearch..."
until curl -s ${ES_URL}/_cluster/health > /dev/null 2>&1; do
    sleep 2
done
echo "✅ Elasticsearch is ready!"

# Get Elasticsearch datasource ID
echo ""
echo "📊 Getting Elasticsearch datasource..."
ES_DS_ID=$(curl -s -u ${GRAFANA_USER}:${GRAFANA_PASS} \
    ${GRAFANA_URL}/api/datasources | \
    jq -r '.[] | select(.type=="elasticsearch" and .name=="Elasticsearch") | .uid')

if [ -z "$ES_DS_ID" ]; then
    echo "❌ Elasticsearch datasource not found"
    exit 1
fi
echo "✅ Found Elasticsearch datasource: $ES_DS_ID"

# Create dashboard with Elasticsearch data
echo ""
echo "📊 Creating CareForAll Dashboard..."

DASHBOARD_JSON=$(cat <<EOF
{
  "dashboard": {
    "id": null,
    "uid": "careforall-elasticsearch",
    "title": "CareForAll - Service Health (Elasticsearch)",
    "tags": ["careforall", "elasticsearch", "logs"],
    "timezone": "browser",
    "schemaVersion": 39,
    "version": 0,
    "refresh": "5s",
    "panels": [
      {
        "id": 1,
        "title": "Total Logs",
        "type": "stat",
        "gridPos": {"h": 4, "w": 6, "x": 0, "y": 0},
        "datasource": {"type": "elasticsearch", "uid": "${ES_DS_ID}"},
        "targets": [{
          "refId": "A",
          "query": "*",
          "metrics": [{"id": "1", "type": "count"}],
          "bucketAggs": [],
          "timeField": "@timestamp"
        }],
        "options": {
          "graphMode": "area",
          "colorMode": "background",
          "justifyMode": "center",
          "textMode": "value_and_name"
        },
        "fieldConfig": {
          "defaults": {
            "color": {"mode": "thresholds"},
            "thresholds": {
              "mode": "absolute",
              "steps": [
                {"color": "green", "value": null}
              ]
            }
          }
        }
      },
      {
        "id": 2,
        "title": "Error Rate",
        "type": "stat",
        "gridPos": {"h": 4, "w": 6, "x": 6, "y": 0},
        "datasource": {"type": "elasticsearch", "uid": "${ES_DS_ID}"},
        "targets": [{
          "refId": "A",
          "query": "level:ERROR",
          "metrics": [{"id": "1", "type": "count"}],
          "bucketAggs": [],
          "timeField": "@timestamp"
        }],
        "options": {
          "graphMode": "area",
          "colorMode": "background"
        },
        "fieldConfig": {
          "defaults": {
            "color": {"mode": "thresholds"},
            "thresholds": {
              "mode": "absolute",
              "steps": [
                {"color": "green", "value": null},
                {"color": "yellow", "value": 10},
                {"color": "red", "value": 50}
              ]
            }
          }
        }
      },
      {
        "id": 3,
        "title": "Active Services",
        "type": "stat",
        "gridPos": {"h": 4, "w": 6, "x": 12, "y": 0},
        "datasource": {"type": "elasticsearch", "uid": "${ES_DS_ID}"},
        "targets": [{
          "refId": "A",
          "query": "*",
          "metrics": [{"id": "1", "type": "cardinality", "field": "service.keyword"}],
          "bucketAggs": [],
          "timeField": "@timestamp"
        }],
        "fieldConfig": {
          "defaults": {
            "color": {"mode": "thresholds"},
            "thresholds": {
              "mode": "absolute",
              "steps": [{"color": "blue", "value": null}]
            }
          }
        }
      },
      {
        "id": 4,
        "title": "Requests Per Second",
        "type": "stat",
        "gridPos": {"h": 4, "w": 6, "x": 18, "y": 0},
        "datasource": {"type": "elasticsearch", "uid": "${ES_DS_ID}"},
        "targets": [{
          "refId": "A",
          "query": "message:*Request*",
          "metrics": [{"id": "1", "type": "count"}],
          "bucketAggs": [
            {"id": "2", "type": "date_histogram", "field": "@timestamp", "settings": {"interval": "1s"}}
          ],
          "timeField": "@timestamp"
        }],
        "options": {
          "graphMode": "area",
          "colorMode": "background"
        },
        "fieldConfig": {
          "defaults": {
            "color": {"mode": "palette-classic"}
          }
        }
      },
      {
        "id": 5,
        "title": "Log Volume Over Time",
        "type": "timeseries",
        "gridPos": {"h": 8, "w": 24, "x": 0, "y": 4},
        "datasource": {"type": "elasticsearch", "uid": "${ES_DS_ID}"},
        "targets": [{
          "refId": "A",
          "query": "*",
          "metrics": [{"id": "1", "type": "count"}],
          "bucketAggs": [
            {"id": "2", "type": "date_histogram", "field": "@timestamp", "settings": {"interval": "auto", "min_doc_count": 0}}
          ],
          "timeField": "@timestamp"
        }],
        "options": {
          "legend": {"displayMode": "list", "placement": "bottom"}
        },
        "fieldConfig": {
          "defaults": {
            "custom": {
              "drawStyle": "line",
              "fillOpacity": 10,
              "lineWidth": 2
            },
            "color": {"mode": "palette-classic"}
          }
        }
      },
      {
        "id": 6,
        "title": "Logs by Service",
        "type": "piechart",
        "gridPos": {"h": 8, "w": 12, "x": 0, "y": 12},
        "datasource": {"type": "elasticsearch", "uid": "${ES_DS_ID}"},
        "targets": [{
          "refId": "A",
          "query": "*",
          "metrics": [{"id": "1", "type": "count"}],
          "bucketAggs": [
            {"id": "2", "type": "terms", "field": "service.keyword", "settings": {"size": 10, "order": "desc", "orderBy": "_count"}}
          ],
          "timeField": "@timestamp"
        }],
        "options": {
          "legend": {"displayMode": "table", "placement": "right", "values": ["value", "percent"]}
        }
      },
      {
        "id": 7,
        "title": "Logs by Level",
        "type": "piechart",
        "gridPos": {"h": 8, "w": 12, "x": 12, "y": 12},
        "datasource": {"type": "elasticsearch", "uid": "${ES_DS_ID}"},
        "targets": [{
          "refId": "A",
          "query": "*",
          "metrics": [{"id": "1", "type": "count"}],
          "bucketAggs": [
            {"id": "2", "type": "terms", "field": "level.keyword", "settings": {"size": 10, "order": "desc", "orderBy": "_count"}}
          ],
          "timeField": "@timestamp"
        }],
        "options": {
          "legend": {"displayMode": "table", "placement": "right", "values": ["value", "percent"]}
        }
      }
    ]
  },
  "overwrite": true
}
EOF
)

# Create the dashboard
RESPONSE=$(curl -s -X POST -u ${GRAFANA_USER}:${GRAFANA_PASS} \
    -H "Content-Type: application/json" \
    -d "${DASHBOARD_JSON}" \
    ${GRAFANA_URL}/api/dashboards/db)

DASHBOARD_UID=$(echo $RESPONSE | jq -r '.uid // empty')

if [ -n "$DASHBOARD_UID" ]; then
    echo "✅ Dashboard created successfully!"
    echo ""
    echo "=========================================="
    echo "✅ Grafana Configuration Complete!"
    echo "=========================================="
    echo ""
    echo "🌐 Dashboard URL:"
    echo "   http://localhost:3001/d/${DASHBOARD_UID}"
    echo ""
    echo "📊 The dashboard shows:"
    echo "   ✓ Total Logs"
    echo "   ✓ Error Rate"
    echo "   ✓ Active Services"
    echo "   ✓ Requests Per Second"
    echo "   ✓ Log Volume Over Time"
    echo "   ✓ Logs by Service (Pie Chart)"
    echo "   ✓ Logs by Level (Pie Chart)"
    echo ""
    echo "🔄 Auto-refresh: Every 5 seconds"
    echo ""
    echo "=========================================="
    
    # Open in browser
    xdg-open "http://localhost:3001/d/${DASHBOARD_UID}" 2>/dev/null || true
else
    echo "❌ Failed to create dashboard"
    echo "Response: $RESPONSE"
    exit 1
fi
