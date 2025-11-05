#!/bin/bash
# Security Setup Script for Aesus Asset Reclaim
# This script sets proper file permissions and helps with SSL certificate setup

set -e

echo "🔒 Security Setup Script"
echo "========================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "📁 Setting up file permissions..."
echo ""

# Data directory permissions
DATA_DIR="$SCRIPT_DIR/data"
if [ -d "$DATA_DIR" ]; then
    echo "Setting permissions for data directory..."
    chmod 700 "$DATA_DIR" 2>/dev/null || true
    echo -e "${GREEN}✅ Data directory: 700${NC}"
    
    # JSON files - read/write for owner only
    if [ -f "$DATA_DIR/leads.json" ]; then
        chmod 600 "$DATA_DIR/leads.json" 2>/dev/null || true
        echo -e "${GREEN}✅ leads.json: 600${NC}"
    fi
    
    if [ -f "$DATA_DIR/users.json" ]; then
        chmod 600 "$DATA_DIR/users.json" 2>/dev/null || true
        echo -e "${GREEN}✅ users.json: 600${NC}"
    fi
    
    if [ -f "$DATA_DIR/asset-reclaims.json" ]; then
        chmod 600 "$DATA_DIR/asset-reclaims.json" 2>/dev/null || true
        echo -e "${GREEN}✅ asset-reclaims.json: 600${NC}"
    fi
    
    if [ -f "$DATA_DIR/msal-cache.json" ]; then
        chmod 600 "$DATA_DIR/msal-cache.json" 2>/dev/null || true
        echo -e "${GREEN}✅ msal-cache.json: 600${NC}"
    fi
    
    # Set ownership (if running as root, adjust ownership)
    # Uncomment if needed:
    # chown -R $(whoami) "$DATA_DIR" 2>/dev/null || true
else
    echo -e "${YELLOW}⚠️  Data directory not found, creating...${NC}"
    mkdir -p "$DATA_DIR"
    chmod 700 "$DATA_DIR"
    touch "$DATA_DIR/leads.json"
    touch "$DATA_DIR/users.json"
    chmod 600 "$DATA_DIR"/*.json 2>/dev/null || true
    echo -e "${GREEN}✅ Created data directory with secure permissions${NC}"
fi

# Logs directory permissions
LOGS_DIR="$SCRIPT_DIR/logs"
if [ -d "$LOGS_DIR" ]; then
    chmod 700 "$LOGS_DIR" 2>/dev/null || true
    find "$LOGS_DIR" -type f -exec chmod 600 {} \; 2>/dev/null || true
    echo -e "${GREEN}✅ Logs directory: 700${NC}"
    echo -e "${GREEN}✅ Log files: 600${NC}"
else
    mkdir -p "$LOGS_DIR"
    chmod 700 "$LOGS_DIR"
    echo -e "${GREEN}✅ Created logs directory with secure permissions${NC}"
fi

# Uploads directory permissions
UPLOADS_DIR="$SCRIPT_DIR/uploads"
if [ -d "$UPLOADS_DIR" ]; then
    chmod 700 "$UPLOADS_DIR" 2>/dev/null || true
    find "$UPLOADS_DIR" -type d -exec chmod 700 {} \; 2>/dev/null || true
    find "$UPLOADS_DIR" -type f -exec chmod 600 {} \; 2>/dev/null || true
    echo -e "${GREEN}✅ Uploads directory: 700${NC}"
    echo -e "${GREEN}✅ Upload files: 600${NC}"
else
    mkdir -p "$UPLOADS_DIR"
    chmod 700 "$UPLOADS_DIR"
    echo -e "${GREEN}✅ Created uploads directory with secure permissions${NC}"
fi

# .env file permissions
if [ -f "$SCRIPT_DIR/.env" ]; then
    chmod 600 "$SCRIPT_DIR/.env" 2>/dev/null || true
    echo -e "${GREEN}✅ .env file: 600${NC}"
else
    echo -e "${YELLOW}⚠️  .env file not found${NC}"
fi

echo ""
echo "🔐 SSL Certificate Setup"
echo "======================"
echo ""

SSL_DIR="$SCRIPT_DIR/ssl"
if [ ! -d "$SSL_DIR" ]; then
    mkdir -p "$SSL_DIR"
    chmod 700 "$SSL_DIR"
    echo -e "${GREEN}✅ Created SSL directory${NC}"
fi

# Check if certificates exist
if [ -f "$SSL_DIR/cert.pem" ] && [ -f "$SSL_DIR/key.pem" ]; then
    echo -e "${GREEN}✅ SSL certificates found${NC}"
    chmod 644 "$SSL_DIR/cert.pem" 2>/dev/null || true
    chmod 600 "$SSL_DIR/key.pem" 2>/dev/null || true
    echo -e "${GREEN}✅ SSL cert.pem: 644${NC}"
    echo -e "${GREEN}✅ SSL key.pem: 600${NC}"
    
    # Check certificate expiry
    if command -v openssl &> /dev/null; then
        EXPIRY=$(openssl x509 -enddate -noout -in "$SSL_DIR/cert.pem" 2>/dev/null | cut -d= -f2)
        if [ -n "$EXPIRY" ]; then
            echo -e "${GREEN}   Certificate expires: $EXPIRY${NC}"
        fi
    fi
else
    echo -e "${YELLOW}⚠️  SSL certificates not found${NC}"
    echo ""
    echo "Options for SSL certificates:"
    echo ""
    echo "1. DEVELOPMENT (Self-signed certificate):"
    echo "   Run: ./generate-ssl-cert.sh"
    echo ""
    echo "2. PRODUCTION (Let's Encrypt - Recommended):"
    echo "   - Install certbot: sudo apt-get install certbot"
    echo "   - Generate certificate:"
    echo "     sudo certbot certonly --standalone -d yourdomain.com"
    echo "   - Copy certificates:"
    echo "     sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem $SSL_DIR/cert.pem"
    echo "     sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem $SSL_DIR/key.pem"
    echo "     sudo chmod 644 $SSL_DIR/cert.pem"
    echo "     sudo chmod 600 $SSL_DIR/key.pem"
    echo ""
    echo "3. PRODUCTION (Commercial SSL):"
    echo "   - Purchase SSL certificate from provider"
    echo "   - Place cert.pem and key.pem in $SSL_DIR"
    echo ""
fi

echo ""
echo "📊 Summary"
echo "=========="
echo ""
echo "File permissions set:"
echo "  - Data files: 600 (owner read/write only)"
echo "  - Data directory: 700 (owner access only)"
echo "  - Log files: 600"
echo "  - Log directory: 700"
echo "  - Upload files: 600"
echo "  - Upload directory: 700"
echo "  - .env file: 600"
echo "  - SSL certificates: cert.pem (644), key.pem (600)"
echo ""
echo -e "${GREEN}✅ Security setup complete!${NC}"
echo ""
echo "💡 Next steps:"
echo "  1. Review file permissions: ls -la data/ logs/ uploads/"
echo "  2. Ensure .env file has proper values"
echo "  3. For production: Obtain valid SSL certificate"
echo ""

