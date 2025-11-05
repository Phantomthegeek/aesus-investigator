#!/bin/bash
# Generate self-signed SSL certificate for development
# WARNING: Self-signed certificates will show security warnings in browsers
# For production, use Let's Encrypt or a commercial SSL certificate

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SSL_DIR="$SCRIPT_DIR/ssl"

echo "🔐 Generating Self-Signed SSL Certificate"
echo "=========================================="
echo ""
echo "⚠️  WARNING: This creates a self-signed certificate for development only!"
echo "   Browsers will show security warnings. Use Let's Encrypt for production."
echo ""

# Create SSL directory if it doesn't exist
mkdir -p "$SSL_DIR"
chmod 700 "$SSL_DIR"

# Check if openssl is installed
if ! command -v openssl &> /dev/null; then
    echo "❌ Error: openssl is not installed"
    echo "   Install with: sudo apt-get install openssl (Ubuntu/Debian)"
    echo "                 brew install openssl (macOS)"
    exit 1
fi

# Prompt for domain (default to localhost)
read -p "Enter domain name (default: localhost): " DOMAIN
DOMAIN=${DOMAIN:-localhost}

# Generate private key
echo "Generating private key..."
openssl genrsa -out "$SSL_DIR/key.pem" 2048
chmod 600 "$SSL_DIR/key.pem"

# Generate certificate signing request (CSR)
echo "Generating certificate signing request..."
openssl req -new -key "$SSL_DIR/key.pem" -out "$SSL_DIR/csr.pem" \
    -subj "/C=US/ST=State/L=City/O=Aesus Asset Reclaim/CN=$DOMAIN"

# Generate self-signed certificate (valid for 365 days)
echo "Generating self-signed certificate..."
openssl x509 -req -days 365 -in "$SSL_DIR/csr.pem" -signkey "$SSL_DIR/key.pem" \
    -out "$SSL_DIR/cert.pem" \
    -extensions v3_req \
    -extfile <(echo "[v3_req]"; echo "subjectAltName=DNS:$DOMAIN,DNS:*.$DOMAIN,IP:127.0.0.1,IP:::1")

# Set proper permissions
chmod 644 "$SSL_DIR/cert.pem"
chmod 600 "$SSL_DIR/key.pem"

# Clean up CSR
rm -f "$SSL_DIR/csr.pem"

echo ""
echo "✅ SSL certificate generated successfully!"
echo ""
echo "Files created:"
echo "  - $SSL_DIR/cert.pem (Certificate)"
echo "  - $SSL_DIR/key.pem (Private Key)"
echo ""
echo "Certificate details:"
openssl x509 -in "$SSL_DIR/cert.pem" -noout -subject -dates
echo ""
echo "🔒 Permissions set:"
echo "  - cert.pem: 644 (readable)"
echo "  - key.pem: 600 (owner only)"
echo ""
echo "⚠️  Remember:"
echo "   - This is for DEVELOPMENT ONLY"
echo "   - Browsers will show security warnings"
echo "   - Click 'Advanced' → 'Proceed' in browser"
echo "   - For production, use Let's Encrypt or commercial SSL"
echo ""

