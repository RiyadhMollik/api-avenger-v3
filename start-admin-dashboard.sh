#!/bin/bash

echo "======================================"
echo "Starting Admin Dashboard"
echo "======================================"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Install dependencies for admin-service
echo -e "\n${YELLOW}[1/5]${NC} Installing admin-service dependencies..."
cd services/admin-service
npm install socket.io cors --save
cd ../..

# Build and restart admin-service
echo -e "\n${YELLOW}[2/5]${NC} Rebuilding admin-service..."
docker-compose stop admin-service 2>/dev/null || true
docker-compose rm -f admin-service 2>/dev/null || true
docker-compose build admin-service
docker-compose up -d admin-service

# Wait for admin-service to be ready
echo -e "\n${YELLOW}[3/5]${NC} Waiting for admin-service to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if curl -s http://localhost:4007/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Admin service is ready!"
    break
  fi
  echo -n "."
  sleep 1
  RETRY_COUNT=$((RETRY_COUNT+1))
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  echo -e "\n${RED}✗${NC} Admin service failed to start"
  echo "Check logs with: docker-compose logs admin-service"
  exit 1
fi

# Start frontend server
echo -e "\n${YELLOW}[4/5]${NC} Starting frontend server..."
cd frontend
if [ ! -d "node_modules" ]; then
  npm install
fi
pkill -f "node server.js" 2>/dev/null || true
nohup node server.js > /tmp/frontend-server.log 2>&1 &
FRONTEND_PID=$!
cd ..

# Wait for frontend to be ready
echo -e "\n${YELLOW}[5/5]${NC} Waiting for frontend server..."
sleep 3
if curl -s http://localhost:3002 > /dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} Frontend server is ready!"
else
  echo -e "${RED}✗${NC} Frontend server failed to start"
  echo "Check logs with: cat /tmp/frontend-server.log"
fi

echo -e "\n======================================"
echo -e "${GREEN}Admin Dashboard is Ready!${NC}"
echo "======================================"
echo ""
echo "📊 Dashboard URLs:"
echo "   • Admin Dashboard: http://localhost:3002/admin"
echo "   • Admin API: http://localhost:4007"
echo ""
echo "🔧 Service Endpoints:"
echo "   • User Management: GET/POST/PUT/DELETE /api/admin/users"
echo "   • Balance Operations: POST /api/admin/balance/add|deduct"
echo "   • Chat: GET/POST /api/admin/chat/:userId/messages"
echo "   • Stats: GET /api/admin/stats"
echo ""
echo "💬 Real-time Features:"
echo "   • Socket.IO server running on port 4007"
echo "   • WebSocket chat support enabled"
echo "   • Live user notifications"
echo ""
echo "📝 Quick Test Commands:"
echo "   # Test stats endpoint"
echo "   curl http://localhost:4007/api/admin/stats"
echo ""
echo "   # Test health check"
echo "   curl http://localhost:4007/health"
echo ""
echo "🛑 To stop:"
echo "   docker-compose stop admin-service"
echo "   pkill -f 'node server.js'"
echo ""
echo "📖 View logs:"
echo "   docker-compose logs -f admin-service"
echo "   cat /tmp/frontend-server.log"
echo ""

# Open browser
if command -v xdg-open > /dev/null 2>&1; then
  echo "Opening browser..."
  xdg-open http://localhost:3002/admin &
elif command -v open > /dev/null 2>&1; then
  open http://localhost:3002/admin &
fi

echo -e "${YELLOW}Note:${NC} Make sure auth-service, payment-service, and chat-service are running for full functionality"
