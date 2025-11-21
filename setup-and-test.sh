#!/bin/bash

# Script to install dependencies and run tests for all services
set -e

echo "=========================================="
echo "🚀 Installing Dependencies for All Services"
echo "=========================================="

SERVICES=(
  "services/auth-service"
  "services/campaign-service"
  "services/pledge-service"
  "services/payment-service"
  "services/totals-service"
  "services/notification-service"
  "services/admin-service"
  "services/api-gateway"
  "services/chat-service"
  "frontend"
)

for service in "${SERVICES[@]}"; do
  if [ -d "$service" ] && [ -f "$service/package.json" ]; then
    echo ""
    echo "📦 Installing dependencies for $service..."
    (cd "$service" && npm install --silent)
    echo "✅ Done: $service"
  fi
done

echo ""
echo "=========================================="
echo "🧪 Running Unit Tests"
echo "=========================================="

PASSED=0
FAILED=0

for service in "${SERVICES[@]}"; do
  if [ -d "$service/__tests__" ] || grep -q '"test"' "$service/package.json" 2>/dev/null; then
    echo ""
    echo "🧪 Testing $service..."
    if (cd "$service" && npm test 2>&1); then
      echo "✅ PASSED: $service"
      ((PASSED++))
    else
      echo "❌ FAILED: $service"
      ((FAILED++))
    fi
  fi
done

echo ""
echo "=========================================="
echo "📊 Test Summary"
echo "=========================================="
echo "✅ Passed: $PASSED"
echo "❌ Failed: $FAILED"
echo "Total: $((PASSED + FAILED))"

if [ $FAILED -eq 0 ]; then
  echo ""
  echo "🎉 All tests passed!"
  exit 0
else
  echo ""
  echo "⚠️  Some tests failed. Check logs above."
  exit 1
fi
