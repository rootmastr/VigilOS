#!/bin/bash
# VigilOS - Seed users via API
# Run: bash seed-users.sh

SERVER="http://111.68.31.232:4141/api/v1"

echo "Seeding VigilOS users..."
echo ""

# Admin
echo "Creating Admin..."
curl -s -X POST "$SERVER/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"Cmdr. Rahmat","email":"admin@vigilos.id","password":"admin123","role":"SUPER_ADMIN","tenantId":"ws-semarang-01"}' | head -c 200
echo ""

# Operator
echo "Creating Operator..."
curl -s -X POST "$SERVER/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"Operator 04","email":"operator@vigilos.id","password":"operator123","role":"COMMAND_CENTER_OPERATOR","tenantId":"ws-semarang-01"}' | head -c 200
echo ""

# Officer
echo "Creating Officer..."
curl -s -X POST "$SERVER/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"Officer Hendra","email":"hendra@vigilos.id","password":"officer123","role":"PATROL_OFFICER","tenantId":"ws-semarang-01","officerId":"OFF-101"}' | head -c 200
echo ""

# Public User
echo "Creating Public User..."
curl -s -X POST "$SERVER/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"Public User","email":"public@vigilos.id","password":"public123","role":"PUBLIC_USER","tenantId":"ws-semarang-01"}' | head -c 200
echo ""

echo ""
echo "Done! Users created:"
echo "  admin@vigilos.id / admin123"
echo "  operator@vigilos.id / operator123"
echo "  hendra@vigilos.id / officer123"
echo "  public@vigilos.id / public123"
