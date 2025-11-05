# Let's Encrypt SSL Certificate Setup Guide

Complete guide for setting up Let's Encrypt SSL certificates for production.

---

## 🚀 Quick Start

### Automated Setup (Recommended)
```bash
cd backend
./setup-letsencrypt.sh
```

The script will guide you through:
1. Domain selection
2. Installation method (Standalone/Webroot)
3. Certificate generation
4. Auto-renewal configuration

---

## 📋 Prerequisites

### Required
- ✅ Domain name pointing to your server
- ✅ Server accessible from the internet (ports 80 and 443 open)
- ✅ Root or sudo access on the server
- ✅ Node.js server running (for webroot mode)

### Check Domain DNS
```bash
# Verify domain points to your server
nslookup aesusinvestigators.com
dig aesusinvestigators.com
```

### Check Ports
```bash
# Ensure ports 80 and 443 are open
sudo netstat -tlnp | grep -E ':80|:443'
```

---

## 🔧 Installation Methods

### Method 1: Standalone Mode (Easiest)

**Best for:** Single server, can stop Node.js app temporarily

**Steps:**
1. **Install Certbot:**
   ```bash
   # Ubuntu/Debian
   sudo apt-get update
   sudo apt-get install certbot
   
   # macOS
   brew install certbot
   ```

2. **Stop your Node.js server:**
   ```bash
   # Stop the server
   pkill -f "node.*server.js"
   # or if using PM2: pm2 stop all
   # or if using systemd: sudo systemctl stop aesus-backend
   ```

3. **Generate certificate:**
   ```bash
   cd backend
   ./setup-letsencrypt.sh
   # Choose option 1 (Standalone)
   ```

4. **Start your Node.js server:**
   ```bash
   cd backend && node server.js &
   ```

**Advantages:**
- ✅ Simplest setup
- ✅ No code changes needed
- ✅ Works with any web server

**Disadvantages:**
- ⚠️ Server must be stopped temporarily (~30 seconds)

---

### Method 2: Webroot Mode (No Downtime)

**Best for:** Production servers that can't be stopped

**Steps:**
1. **Install Certbot** (same as Method 1)

2. **Generate certificate:**
   ```bash
   cd backend
   ./setup-letsencrypt.sh
   # Choose option 2 (Webroot)
   ```

3. **Ensure your server serves validation files:**
   - The server.js already includes the `.well-known/acme-challenge` route
   - Certbot will place validation files in: `/.well-known/acme-challenge/`
   - Your server automatically serves these files

**Advantages:**
- ✅ No server downtime
- ✅ Works with running applications
- ✅ Easy auto-renewal

**Disadvantages:**
- ⚠️ Requires webroot directory to be accessible

---

### Method 3: Reverse Proxy (Nginx/Apache)

**Best for:** Production with reverse proxy

**Steps:**
1. **Install Nginx:**
   ```bash
   sudo apt-get install nginx certbot python3-certbot-nginx
   ```

2. **Configure Nginx** (create `/etc/nginx/sites-available/aesus`):
   ```nginx
   server {
       listen 80;
       server_name aesusinvestigators.com www.aesusinvestigators.com;
       
       location / {
           proxy_pass http://localhost:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

3. **Enable site:**
   ```bash
   sudo ln -s /etc/nginx/sites-available/aesus /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

4. **Get certificate with Nginx plugin:**
   ```bash
   sudo certbot --nginx -d aesusinvestigators.com -d www.aesusinvestigators.com
   ```

5. **Certbot automatically configures HTTPS in Nginx**

**Advantages:**
- ✅ Professional setup
- ✅ SSL termination at proxy level
- ✅ Easy certificate management
- ✅ Automatic HTTP to HTTPS redirect

**Disadvantages:**
- ⚠️ Requires Nginx/Apache setup

---

## 🔄 Auto-Renewal Setup

### Automatic (Recommended)

The `setup-letsencrypt.sh` script automatically configures crontab for renewal.

**Manual setup:**
```bash
# Edit crontab
crontab -e

# Add this line (runs daily at 2 AM)
0 2 * * * /path/to/backend/renew-ssl-cert.sh >> /path/to/backend/ssl-renewal.log 2>&1
```

### Test Renewal
```bash
# Dry run (test without actually renewing)
sudo certbot renew --dry-run
```

### Manual Renewal
```bash
sudo certbot renew
cd backend
sudo cp /etc/letsencrypt/live/YOURDOMAIN/fullchain.pem ssl/cert.pem
sudo cp /etc/letsencrypt/live/YOURDOMAIN/privkey.pem ssl/key.pem
sudo chown $(whoami):$(whoami) ssl/*.pem
chmod 644 ssl/cert.pem
chmod 600 ssl/key.pem

# Restart your server
pkill -f "node.*server.js"
cd backend && node server.js &
```

---

## 🔍 Verification

### Check Certificate
```bash
# View certificate details
openssl x509 -in backend/ssl/cert.pem -text -noout

# Check expiration
openssl x509 -in backend/ssl/cert.pem -noout -dates
```

### Test HTTPS Connection
```bash
# Test locally
curl -v https://localhost:3000/api/health

# Test from external
curl -v https://aesusinvestigators.com/api/health
```

### Online SSL Test
Visit: https://www.ssllabs.com/ssltest/
Enter your domain for a comprehensive SSL report

---

## 🛠️ Troubleshooting

### Error: "Could not bind to port 80"
**Solution:** Stop your Node.js server or use webroot mode
```bash
# Check what's using port 80
sudo lsof -i :80
sudo netstat -tlnp | grep :80
```

### Error: "Domain not resolving"
**Solution:** Check DNS settings
```bash
dig aesusinvestigators.com
nslookup aesusinvestigators.com
```

### Error: "Certificate not found after renewal"
**Solution:** Copy certificates manually
```bash
sudo cp /etc/letsencrypt/live/YOURDOMAIN/fullchain.pem backend/ssl/cert.pem
sudo cp /etc/letsencrypt/live/YOURDOMAIN/privkey.pem backend/ssl/key.pem
```

### Certificate Expired
**Solution:** Renew manually
```bash
sudo certbot renew --force-renewal
cd backend
sudo cp /etc/letsencrypt/live/YOURDOMAIN/fullchain.pem ssl/cert.pem
sudo cp /etc/letsencrypt/live/YOURDOMAIN/privkey.pem ssl/key.pem
```

---

## 📝 Let's Encrypt Limitations

- **Rate Limits:**
  - 50 certificates per domain per week
  - 5 duplicate certificates per week
  - 300 new registrations per IP per 3 hours

- **Certificate Validity:**
  - 90 days (auto-renewal recommended)

- **Supported Domains:**
  - Fully qualified domain names (FQDNs)
  - Wildcards (requires DNS validation)
  - IP addresses (not supported)

---

## 🔐 Security Best Practices

1. ✅ **Keep certificates up to date** (auto-renewal configured)
2. ✅ **Set proper file permissions** (cert: 644, key: 600)
3. ✅ **Never commit private keys to git**
4. ✅ **Monitor certificate expiration** (set up alerts)
5. ✅ **Use HSTS** (already configured in Helmet)
6. ✅ **Enable OCSP Stapling** (if using Nginx)

---

## 📊 Certificate Status

Check certificate expiration:
```bash
openssl x509 -in backend/ssl/cert.pem -noout -checkend 86400
# Returns 0 if valid for next 24 hours, 1 if expiring
```

Set up monitoring script:
```bash
# Add to crontab to check weekly
0 9 * * 1 openssl x509 -in /path/to/backend/ssl/cert.pem -noout -checkend 604800 || echo "Certificate expiring soon!" | mail -s "SSL Alert" admin@example.com
```

---

## 🎯 Production Checklist

- [ ] Domain DNS configured and propagated
- [ ] Ports 80 and 443 open in firewall
- [ ] Certbot installed
- [ ] Certificate generated and copied to `backend/ssl/`
- [ ] File permissions set (cert: 644, key: 600)
- [ ] Auto-renewal configured (crontab)
- [ ] Renewal tested (`certbot renew --dry-run`)
- [ ] HTTPS working (test with browser)
- [ ] HTTP redirects to HTTPS (if using Nginx)
- [ ] SSL Labs test passed (A or A+ rating)
- [ ] Monitoring alerts configured

---

## 📚 Additional Resources

- **Let's Encrypt Documentation:** https://letsencrypt.org/docs/
- **Certbot Documentation:** https://eff-certbot.readthedocs.io/
- **SSL Labs Test:** https://www.ssllabs.com/ssltest/
- **Let's Encrypt Community:** https://community.letsencrypt.org/

---

**Last Updated:** November 1, 2025  
**Certificate Expiration:** Let's Encrypt certificates are valid for 90 days and auto-renew

