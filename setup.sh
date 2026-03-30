#!/bin/bash
set -e

echo "🚀 Setting up SM locally..."
echo ""

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker Desktop and try again."
  exit 1
fi

# Start Postgres
echo "📦 Starting Postgres..."
docker compose up postgres -d --wait 2>/dev/null || docker-compose up postgres -d 2>/dev/null
echo "✅ Postgres running on localhost:5432"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
cd app
npm install

# Copy env if not exists
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "✅ Created .env.local from .env.example"
else
  echo "· .env.local already exists, skipping"
fi

# Push schema to database
echo ""
echo "🗄️  Pushing database schema..."
npx drizzle-kit push

# Seed data
echo ""
echo "🌱 Seeding database..."
npx tsx src/lib/db/seed.ts

echo ""
echo "✅ Setup complete! Run the app with:"
echo ""
echo "   cd app && npm run dev"
echo ""
