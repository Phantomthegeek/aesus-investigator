#!/bin/bash
# Let's Encrypt SSL Certificate Setup Script
# This script helps automate Let's Encrypt certificate setup for production

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SSL_DIR="$SCRIPT_DIR/ssl"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "🔐 Let's Encrypt SSL Certificate Setup"
echo "======================================"
echo ""

# Check if running as root (needed for certbot)
if [ "$EUID" -ne 0 ]; then 
    echo -e "${YELLOW}⚠️  Note: This script may need sudo for certbot installation${NC}"
    echo ""
fi

# Check for domain
read -p "Enter your domain name (e.g., aesusinvestigators.com): " DOMAIN
if [ -z "$DOMAIN" ]; then
    echo -e "${RED}❌ Domain name is required${NC}"
    exit 1
fi

echo ""
echo "Select setup method:"
echo "1) Standalone mode (Node.js app must be stopped temporarily)"
echo "2) Webroot mode (Node.js app must serve /.well-known/acme-challenge)"
echo "3) Already have certificates from Let's Encrypt (copy existing)"
echo ""
read -p "Enter option (1-3): " METHOD

case $METHOD in
    1)
        echo ""
        echo "📋 Standalone Mode Setup"
        echo "======================="
        echo ""
        echo "⚠️  IMPORTANT: Your Node.js server must be stopped during certificate generation"
        echo ""
        read -p "Continue? (y/n): " CONFIRM
        if [ "$CONFIRM" != "y" ]; then
            echo "Cancelled."
            exit 0
        fi
        
        # Check if certbot is installed
        if ! command -v certbot &> /dev/null; then
            echo ""
            echo "Installing certbot..."
            if [[ "$OSTYPE" == "darwin"* ]]; then
                # macOS
                if command -v brew &> /dev/null; then
                    brew install certbot
                else
                    echo -e "${RED}❌ Homebrew not found. Install certbot manually:${NC}"
                    echo "   brew install certbot"
                    exit 1
                fi
            elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
                # Linux
                sudo apt-get update
                sudo apt-get install -y certbot
            else
                echo -e "${RED}❌ Unsupported OS. Install certbot manually.${NC}"
                exit 1
            fi
        fi
        
        echo ""
        echo "🛑 Please STOP your Node.js server now (Ctrl+C if running)"
        echo "   Press Enter when the server is stopped..."
        read
        
        # Create SSL directory
        mkdir -p "$SSL_DIR"
        chmod 700 "$SSL_DIR"
        
        # Generate certificate
        echo ""
        echo "Generating Let's Encrypt certificate..."
        sudo certbot certonly --standalone \
            -d "$DOMAIN" \
            --email "admin@$DOMAIN" \
            --agree-tos \
            --non-interactive \
            --preferred-challenges http
        
        # Copy certificates
        echo ""
        echo "Copying certificates..."
        sudo cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$SSL_DIR/cert.pem"
        sudo cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$SSL_DIR/key.pem"
        
        # Set permissions
        sudo chown $(whoami):$(whoami) "$SSL_DIR/cert.pem" "$SSL_DIR/key.pem"
        chmod 644 "$SSL_DIR/cert.pem"
        chmod 600 "$SSL_DIR/key.pem"
        
        echo ""
        echo -e "${GREEN}✅ Certificate generated and copied!${NC}"
        ;;
        
    2)
        echo ""
        echo "📋 Webroot Mode Setup"
        echo "===================="
        echo ""
        echo "This mode requires your Node.js app to serve files from a webroot directory"
        echo ""
        
        read -p "Enter webroot path (default: $SCRIPT_DIR/../): " WEBROOT
        WEBROOT=${WEBROOT:-"$SCRIPT_DIR/../"}
        
        # Check if certbot is installed
        if ! command -v certbot &> /dev/null; then
            echo ""
            echo "Installing certbot..."
            if [[ "$OSTYPE" == "darwin"* ]]; then
                if command -v brew &> /dev/null; then
                    brew install certbot
                else
                    echo -e "${RED}❌ Homebrew not found. Install certbot manually.${NC}"
                    exit 1
                fi
            elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
                sudo apt-get update
                sudo apt-get install -y certbot
            fi
        fi
        
        # Create .well-known directory structure
        WELLKNOWN_DIR="$WEBROOT/.well-known/acme-challenge"
        mkdir -p "$WELLKNOWN_DIR"
        chmod 755 "$WEBROOT/.well-known"
        chmod 755 "$WEBROOT/.well-known/acme-challenge"
        
        echo ""
        echo "⚠️  IMPORTANT: Your Node.js server must serve files from: $WEBROOT"
        echo "   Ensure this route is configured in server.js"
        echo ""
        read -p "Continue? (y/n): " CONFIRM
        if [ "$CONFIRM" != "y" ]; then
            echo "Cancelled."
            exit 0
        fi
        
        # Generate certificate
        echo ""
        echo "Generating Let's Encrypt certificate..."
        sudo certbot certonly --webroot \
            -w "$WEBROOT" \
            -d "$DOMAIN" \
            --email "admin@$DOMAIN" \
            --agree-tos \
            --non-interactive
        
        # Copy certificates
        mkdir -p "$SSL_DIR"
        chmod 700 "$SSL_DIR"
        sudo cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$SSL_DIR/cert.pem"
        sudo cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$SSL_DIR/key.pem"
        
        # Set permissions
        sudo chown $(whoami):$(whoami) "$SSL_DIR/cert.pem" "$SSL_DIR/key.pem"
        chmod 644 "$SSL_DIR/cert.pem"
        chmod 600 "$SSL_DIR/key.pem"
        
        echo ""
        echo -e "${GREEN}✅ Certificate generated and copied!${NC}"
        ;;
        
    3)
        echo ""
        echo "📋 Copy Existing Certificates"
        echo "============================"
        echo ""
        read -p "Enter path to Let's Encrypt live directory (e.g., /etc/letsencrypt/live/$DOMAIN): " LE_PATH
        
        if [ ! -d "$LE_PATH" ]; then
            echo -e "${RED}❌ Directory not found: $LE_PATH${NC}"
            exit 1
        fi
        
        if [ ! -f "$LE_PATH/fullchain.pem" ] || [ ! -f "$LE_PATH/privkey.pem" ]; then
            echo -e "${RED}❌ Certificate files not found in $LE_PATH${NC}"
            exit 1
        fi
        
        mkdir -p "$SSL_DIR"
        chmod 700 "$SSL_DIR"
        
        sudo cp "$LE_PATH/fullchain.pem" "$SSL_DIR/cert.pem"
        sudo cp "$LE_PATH/privkey.pem" "$SSL_DIR/key.pem"
        
        sudo chown $(whoami):$(whoami) "$SSL_DIR/cert.pem" "$SSL_DIR/key.pem"
        chmod 644 "$SSL_DIR/cert.pem"
        chmod 600 "$SSL_DIR/key.pem"
        
        echo ""
        echo -e "${GREEN}✅ Certificates copied!${NC}"
        ;;
        
    *)
        echo -e "${RED}❌ Invalid option${NC}"
        exit 1
        ;;
esac

echo ""
echo "🔄 Setting up auto-renewal..."
echo ""

# Create renewal script
RENEWAL_SCRIPT="$SCRIPT_DIR/renew-ssl-cert.sh"
cat > "$RENEWAL_SCRIPT" << EOF
#!/bin/bash
# Auto-renewal script for Let's Encrypt certificates

DOMAIN="$DOMAIN"
SSL_DIR="$SSL_DIR"

# Renew certificate
sudo certbot renew --quiet

# Copy renewed certificates
sudo cp /etc/letsencrypt/live/\$DOMAIN/fullchain.pem \$SSL_DIR/cert.pem
sudo cp /etc/letsencrypt/live/\$DOMAIN/privkey.pem \$SSL_DIR/key.pem

# Set permissions
sudo chown \$(whoami):\$(whoami) \$SSL_DIR/cert.pem \$SSL_DIR/key.pem
chmod 644 \$SSL_DIR/cert.pem
chmod 600 \$SSL_DIR/key.pem

# Restart Node.js server (adjust command as needed)
# pm2 restart aesus-backend
# or
# systemctl restart aesus-backend
# or
# pkill -f "node.*server.js" && cd /path/to/backend && node server.js &

echo "SSL certificate renewed at \$(date)"
EOF

chmod +x "$RENEWAL_SCRIPT"
echo -e "${GREEN}✅ Renewal script created: $RENEWAL_SCRIPT${NC}"

# Add to crontab
echo ""
echo "Setting up crontab for auto-renewal (runs daily at 2 AM)..."
(crontab -l 2>/dev/null | grep -v "renew-ssl-cert.sh"; echo "0 2 * * * $RENEWAL_SCRIPT >> $SCRIPT_DIR/ssl-renewal.log 2>&1") | crontab -

echo ""
echo -e "${GREEN}✅ Auto-renewal configured!${NC}"

echo ""
echo "📊 Summary"
echo "=========="
echo "Domain: $DOMAIN"
echo "Certificate: $SSL_DIR/cert.pem"
echo "Private Key: $SSL_DIR/key.pem"
echo "Renewal Script: $RENEWAL_SCRIPT"
echo ""
echo -e "${GREEN}✅ Let's Encrypt setup complete!${NC}"
echo ""
echo "💡 Next steps:"
echo "  1. Restart your Node.js server"
echo "  2. Test HTTPS: https://$DOMAIN/api/health"
echo "  3. Verify certificate: openssl x509 -in $SSL_DIR/cert.pem -text -noout"
echo "  4. Test renewal: sudo certbot renew --dry-run"
echo ""

