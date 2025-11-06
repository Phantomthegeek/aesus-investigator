# VPS Deployment Guide - DigitalOcean / Linode / AWS EC2

This guide covers deploying to a Virtual Private Server (VPS) for full control.

## 📋 Prerequisites

- VPS with Ubuntu 20.04+ or Debian 11+
- Root or sudo access
- Domain name pointed to your VPS IP
- Basic command line knowledge

## 🚀 Step 1: Initial Server Setup

### Connect to your server:
```bash
ssh root@your-server-ip
```

### Update system:
```bash
apt update && apt upgrade -y
```

### Install Node.js (v18+):
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs
node --version  # Should show v18+
```

### Install PM2 (Process Manager):
```bash
npm install -g pm2
```

### Install Nginx (Web Server):
```bash
apt install -y nginx
```

### Install Certbot (SSL):
```bash
apt install -y certbot python3-certbot-nginx
```

---

## 📦 Step 2: Deploy Your Application

### Create application directory:
```bash
mkdir -p /var/www/aesus
cd /var/www/aesus
```

### Clone your repository (or upload files):
```bash
# Option 1: Git clone
git clone https://github.com/yourusername/aesus-investigator.git .

# Option 2: Upload via SCP from your local machine
# scp -r /path/to/aesus/* root@your-server-ip:/var/www/aesus/
```

### Install backend dependencies:
```bash
cd backend
npm install --production
```

---

## ⚙️ Step 3: Configure Environment

### Create `.env` file:
```bash
cd /var/www/aesus/backend
nano .env
```

### Add your production configuration:
```bash
PORT=3000
NODE_ENV=production
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=your-secure-password
JWT_SECRET=your-strong-random-secret-here
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
EMAIL_USER=noreply@yourdomain.com
EMAIL_PASSWORD=your-email-password
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=587
SMTP_SECURE=false
```

**Generate JWT_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## 🔄 Step 4: Set Up PM2 (Process Manager)

### Create PM2 ecosystem file:
```bash
cd /var/www/aesus
nano ecosystem.config.js
```

### Add this configuration:
```javascript
module.exports = {
  apps: [{
    name: 'aesus-backend',
    script: './backend/server.js',
    cwd: '/var/www/aesus',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M'
  }]
};
```

### Start the application:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Follow instructions to enable auto-start on reboot
```

### Check status:
```bash
pm2 status
pm2 logs aesus-backend
```

---

## 🌐 Step 5: Configure Nginx (Reverse Proxy)

### Create Nginx configuration:
```bash
nano /etc/nginx/sites-available/aesus
```

### Add this configuration:
```nginx
# Backend API
server {
    listen 80;
    server_name api.yourdomain.com;  # Or yourdomain.com if using subdirectory

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Frontend (static files)
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    root /var/www/aesus;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    # API proxy (if using same domain)
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Enable the site:
```bash
ln -s /etc/nginx/sites-available/aesus /etc/nginx/sites-enabled/
nginx -t  # Test configuration
systemctl restart nginx
```

---

## 🔒 Step 6: Set Up SSL with Let's Encrypt

### Get SSL certificate:
```bash
certbot --nginx -d yourdomain.com -d www.yourdomain.com
# If using API subdomain:
certbot --nginx -d api.yourdomain.com
```

### Auto-renewal (already set up by certbot):
```bash
certbot renew --dry-run  # Test renewal
```

---

## 🔥 Step 7: Configure Firewall

### Allow necessary ports:
```bash
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw enable
ufw status
```

---

## 📊 Step 8: Monitoring & Maintenance

### PM2 Commands:
```bash
pm2 status              # Check status
pm2 logs aesus-backend  # View logs
pm2 restart aesus-backend  # Restart
pm2 stop aesus-backend     # Stop
pm2 monit               # Monitor resources
```

### Nginx Commands:
```bash
systemctl status nginx
systemctl restart nginx
nginx -t  # Test config before restart
```

### View Logs:
```bash
# Application logs
pm2 logs aesus-backend

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log

# Backend logs
tail -f /var/www/aesus/backend/logs/errors/errors-*.log
```

---

## 🔄 Updating Your Application

### Pull latest changes:
```bash
cd /var/www/aesus
git pull origin main
cd backend
npm install --production
pm2 restart aesus-backend
```

---

## 🆘 Troubleshooting

### Application won't start:
```bash
pm2 logs aesus-backend  # Check logs
cd /var/www/aesus/backend
node server.js  # Test manually
```

### Nginx 502 Bad Gateway:
- Check if backend is running: `pm2 status`
- Check backend logs: `pm2 logs aesus-backend`
- Verify port 3000 is accessible: `netstat -tulpn | grep 3000`

### SSL certificate issues:
```bash
certbot certificates  # List certificates
certbot renew --force-renewal  # Force renewal
```

### Permission issues:
```bash
chown -R www-data:www-data /var/www/aesus
chmod -R 755 /var/www/aesus
```

---

## ✅ Post-Deployment Checklist

- [ ] Backend is running: `pm2 status`
- [ ] Nginx is running: `systemctl status nginx`
- [ ] SSL certificate is active (check browser)
- [ ] Frontend loads correctly
- [ ] API endpoints work
- [ ] Admin login works
- [ ] File uploads work
- [ ] Email sending works
- [ ] Firewall is configured
- [ ] Backups are set up (see backup guide)

---

## 📝 Next Steps

1. Set up automated backups
2. Configure monitoring (optional: UptimeRobot, Pingdom)
3. Set up log rotation
4. Configure email alerts for errors
5. Review security settings

