# SSL Certificate Setup Guide

## Quick Start

### Development (Self-Signed Certificate)
```bash
cd backend
./generate-ssl-cert.sh
```

### Production (Let's Encrypt - Recommended)

#### Option 1: Certbot (Let's Encrypt)
```bash
# Install certbot
sudo apt-get update
sudo apt-get install certbot

# Generate certificate (replace with your domain)
sudo certbot certonly --standalone -d aesusinvestigators.com -d www.aesusinvestigators.com

# Copy certificates to backend/ssl/
sudo cp /etc/letsencrypt/live/aesusinvestigators.com/fullchain.pem backend/ssl/cert.pem
sudo cp /etc/letsencrypt/live/aesusinvestigators.com/privkey.pem backend/ssl/key.pem

# Set permissions
sudo chmod 644 backend/ssl/cert.pem
sudo chmod 600 backend/ssl/key.pem
sudo chown $(whoami):$(whoami) backend/ssl/*.pem
```

#### Option 2: Certbot with Nginx/Apache
```bash
# If using Nginx/Apache as reverse proxy
sudo certbot --nginx -d aesusinvestigators.com
# or
sudo certbot --apache -d aesusinvestigators.com

# Certbot automatically configures your web server
```

#### Auto-Renewal (Let's Encrypt)
```bash
# Test renewal
sudo certbot renew --dry-run

# Add to crontab for automatic renewal
sudo crontab -e
# Add this line (runs daily at 2 AM):
0 2 * * * certbot renew --quiet --deploy-hook "systemctl reload nginx"
```

### Production (Commercial SSL Certificate)

1. Purchase SSL certificate from provider (DigiCert, GlobalSign, etc.)
2. Generate CSR (Certificate Signing Request):
```bash
cd backend/ssl
openssl req -new -newkey rsa:2048 -nodes -keyout key.pem -out csr.pem
```
3. Submit CSR to certificate provider
4. Download certificate files
5. Place in `backend/ssl/`:
   - `cert.pem` - Certificate file
   - `key.pem` - Private key (keep secret!)
6. Set permissions:
```bash
chmod 644 backend/ssl/cert.pem
chmod 600 backend/ssl/key.pem
```

---

## Certificate File Permissions

**Security Best Practices:**
- Certificate (`cert.pem`): `644` (readable by all, writable by owner)
- Private Key (`key.pem`): `600` (read/write by owner only)
- SSL Directory: `700` (accessible by owner only)

**Apply permissions:**
```bash
cd backend
./setup-security.sh
```

---

## Server Configuration

The server automatically detects SSL certificates if:
- `backend/ssl/cert.pem` exists
- `backend/ssl/key.pem` exists

**HTTPS Settings:**
- Default port: `3000` (HTTPS)
- HTTP fallback: `3001` (for development)
- To disable HTTPS: Set `USE_HTTPS=false` in `.env`

---

## Testing SSL

### Check Certificate
```bash
openssl x509 -in backend/ssl/cert.pem -text -noout
```

### Test Certificate Validity
```bash
openssl x509 -in backend/ssl/cert.pem -noout -checkend 0
```

### Test HTTPS Connection
```bash
curl -v https://localhost:3000/api/health
# or with self-signed cert:
curl -k https://localhost:3000/api/health
```

### Online SSL Test (Production)
Visit: https://www.ssllabs.com/ssltest/
Enter your domain to get a detailed SSL report

---

## Troubleshooting

### "Certificate expired"
- Let's Encrypt: Renew with `sudo certbot renew`
- Commercial: Purchase renewal and replace certificate

### "Certificate not trusted"
- Self-signed: Expected in development, click "Advanced" → "Proceed"
- Production: Ensure certificate chain is complete (fullchain.pem)

### "Permission denied"
```bash
chmod 600 backend/ssl/key.pem
chmod 644 backend/ssl/cert.pem
```

### "Certificate not found"
- Check files exist: `ls -la backend/ssl/`
- Check server logs for SSL initialization messages

---

## Security Best Practices

1. ✅ **Always use HTTPS in production**
2. ✅ **Keep private keys secure** (never commit to git)
3. ✅ **Set proper file permissions** (key: 600, cert: 644)
4. ✅ **Enable HSTS** (already configured in Helmet)
5. ✅ **Renew certificates before expiration** (Let's Encrypt: 90 days)
6. ✅ **Use strong key sizes** (2048-bit minimum, 4096-bit recommended)
7. ✅ **Keep certificates up to date**

---

## Let's Encrypt Renewal Automation

Create `/etc/cron.d/certbot-renewal`:
```
0 2 * * * root certbot renew --quiet --deploy-hook "cp /etc/letsencrypt/live/YOURDOMAIN/fullchain.pem /path/to/backend/ssl/cert.pem && cp /etc/letsencrypt/live/YOURDOMAIN/privkey.pem /path/to/backend/ssl/key.pem && systemctl restart your-service-name"
```

Replace:
- `YOURDOMAIN` with your actual domain
- `/path/to/backend` with your actual path
- `your-service-name` with your Node.js service name (if using systemd)

---

**Last Updated:** November 1, 2025

