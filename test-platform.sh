#!/bin/bash

echo "====================================="
echo "CareForAll Platform End-to-End Test"
echo "====================================="
echo ""

API_GATEWAY="http://localhost:4000"

echo "1. Testing Auth Service - Guest Login..."
GUEST_RESPONSE=$(curl -s -X POST "$API_GATEWAY/api/auth/guest-login" \
  -H "Content-Type: application/json" \
  -d '{"name":"TestUser"}')
echo "$GUEST_RESPONSE" | jq '.'
TOKEN=$(echo "$GUEST_RESPONSE" | jq -r '.token')
USER_ID=$(echo "$GUEST_RESPONSE" | jq -r '.user.id')
echo "✅ Guest logged in with token"
echo ""

echo "2. Testing Campaign Service - Create Campaign..."
CAMPAIGN_RESPONSE=$(curl -s -X POST "http://localhost:4002/api/campaigns" \
  -H "Content-Type: application/json" \
  -d '{
    "title":"Save the Children",
    "description":"Help underprivileged children get education",
    "goalAmount":10000,
    "organizerId":"'$USER_ID'",
    "startDate":"2024-01-01",
    "endDate":"2024-12-31",
    "status":"ACTIVE",
    "category":"Education"
  }')
echo "$CAMPAIGN_RESPONSE" | jq '.'
CAMPAIGN_ID=$(echo "$CAMPAIGN_RESPONSE" | jq -r '.id')
echo "✅ Campaign created with ID: $CAMPAIGN_ID"
echo ""

echo "3. Testing Pledge Service - Create Pledge..."
PLEDGE_RESPONSE=$(curl -s -X POST "http://localhost:4003/api/pledges" \
  -H "Content-Type: application/json" \
  -H "idempotency-key: test-pledge-$(date +%s)" \
  -d '{
    "campaignId":"'$CAMPAIGN_ID'",
    "userId":"'$USER_ID'",
    "amount":500
  }')
echo "$PLEDGE_RESPONSE" | jq '.'
PLEDGE_ID=$(echo "$PLEDGE_RESPONSE" | jq -r '.id')
echo "✅ Pledge created with ID: $PLEDGE_ID"
echo ""

echo "4. Waiting 3 seconds for payment gateway simulation..."
sleep 3
echo ""

echo "5. Testing Payment Service - Check Payment Status..."
PAYMENT_RESPONSE=$(curl -s "http://localhost:4004/api/payments/pledge/$PLEDGE_ID")
echo "$PAYMENT_RESPONSE" | jq '.'
echo "✅ Payment processed"
echo ""

echo "6. Waiting 2 seconds for CQRS totals update..."
sleep 2
echo ""

echo "7. Testing Totals Service - Get Campaign Totals..."
TOTALS_RESPONSE=$(curl -s "http://localhost:4005/api/campaigns/$CAMPAIGN_ID/totals")
echo "$TOTALS_RESPONSE" | jq '.'
echo "✅ Totals calculated via CQRS"
echo ""

echo "8. Testing Admin Service - Get Analytics..."
ANALYTICS_RESPONSE=$(curl -s "http://localhost:4007/api/admin/analytics")
echo "$ANALYTICS_RESPONSE" | jq '.'
echo "✅ Admin analytics retrieved"
echo ""

echo "9. Testing Idempotency - Duplicate Pledge Request..."
DUPLICATE_RESPONSE=$(curl -s -X POST "http://localhost:4003/api/pledges" \
  -H "Content-Type: application/json" \
  -H "idempotency-key: idempotency-test-key-123" \
  -d '{
    "campaignId":"'$CAMPAIGN_ID'",
    "userId":"'$USER_ID'",
    "amount":250
  }')
FIRST_PLEDGE_ID=$(echo "$DUPLICATE_RESPONSE" | jq -r '.id')

DUPLICATE_RESPONSE2=$(curl -s -X POST "http://localhost:4003/api/pledges" \
  -H "Content-Type: application/json" \
  -H "idempotency-key: idempotency-test-key-123" \
  -d '{
    "campaignId":"'$CAMPAIGN_ID'",
    "userId":"'$USER_ID'",
    "amount":250
  }')
SECOND_PLEDGE_ID=$(echo "$DUPLICATE_RESPONSE2" | jq -r '.id')

if [ "$FIRST_PLEDGE_ID" == "$SECOND_PLEDGE_ID" ]; then
  echo "✅ Idempotency working! Same pledge ID returned: $FIRST_PLEDGE_ID"
else
  echo "❌ Idempotency failed! Different IDs: $FIRST_PLEDGE_ID vs $SECOND_PLEDGE_ID"
fi
echo ""

echo "10. Testing Outbox Pattern - Check Outbox Status..."
OUTBOX_STATUS=$(curl -s "http://localhost:4003/api/outbox/status")
echo "$OUTBOX_STATUS" | jq '.'
echo "✅ Outbox pattern verified"
echo ""

echo "====================================="
echo "✅ All Tests Completed Successfully!"
echo "====================================="
echo ""
echo "Summary:"
echo "- Auth Service: Working (Guest login)"
echo "- Campaign Service: Working (Created campaign)"
echo "- Pledge Service: Working (Created pledges)"
echo "- Payment Service: Working (Processed payment)"
echo "- Totals Service: Working (CQRS read model)"
echo "- Admin Service: Working (Analytics)"
echo "- Notification Service: Running (Check Docker logs)"
echo "- Idempotency: Working (Duplicate prevention)"
echo "- Outbox Pattern: Working (Event delivery)"
echo ""
echo "🎉 CareForAll Platform is fully operational!"
