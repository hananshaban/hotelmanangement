#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 Hotel PMS Database Setup Script"
echo "=================================="
echo ""

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ PostgreSQL is not installed${NC}"
    echo "Please install PostgreSQL first:"
    echo "  - Ubuntu/Debian: sudo apt-get install postgresql"
    echo "  - macOS: brew install postgresql"
    exit 1
fi

echo -e "${GREEN}✅ PostgreSQL is installed${NC}"

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file not found, copying from .env.example${NC}"
    cp .env.example .env
    echo -e "${YELLOW}📝 Please update .env with your database credentials${NC}"
fi

# Load environment variables
source .env 2>/dev/null || true

DB_USER=${DB_USER:-postgres}
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-hotel_pms_dev}
DB_NAME_TEST=${DB_NAME_TEST:-hotel_pms_test}

echo ""
echo "Database Configuration:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  User: $DB_USER"
echo "  Dev DB: $DB_NAME"
echo "  Test DB: $DB_NAME_TEST"
echo ""

# Function to create database if it doesn't exist
create_db_if_not_exists() {
    local db_name=$1
    
    # Check if database exists
    if PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -lqt | cut -d \| -f 1 | grep -qw $db_name; then
        echo -e "${YELLOW}⚠️  Database '$db_name' already exists${NC}"
    else
        echo "Creating database '$db_name'..."
        PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -c "CREATE DATABASE $db_name;" 2>&1
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✅ Database '$db_name' created successfully${NC}"
        else
            echo -e "${RED}❌ Failed to create database '$db_name'${NC}"
            return 1
        fi
    fi
}

# Create databases
echo "Creating databases..."
create_db_if_not_exists $DB_NAME
create_db_if_not_exists $DB_NAME_TEST

echo ""
echo "Running migrations..."
npm run db:migrate

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Migrations completed successfully${NC}"
else
    echo -e "${RED}❌ Migrations failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 Database setup complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Start the development server: npm run dev"
echo "  2. (Optional) Seed the database: npm run db:seed"
echo ""
