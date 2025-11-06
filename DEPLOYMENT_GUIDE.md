# Deployment Guide - Aesus Asset Reclaim

This guide covers deploying your application to various hosting platforms.

## 🎯 Current Setup

- **Frontend**: GitHub Pages (https://phantomthegeek.github.io/aesus-investigator/)
- **Backend**: Heroku (https://aesus-investigator-backend.herokuapp.com)

## 📋 Hosting Options

### Option 1: VPS (Virtual Private Server) - Recommended for Full Control

**Best for**: Production deployments with full control
**Providers**: DigitalOcean, Linode, AWS EC2, Vultr, Hetzner
**Cost**: $5-20/month
**Pros**: Full control, better performance, custom domain, SSL
**Cons**: Requires server management knowledge

### Option 2: Cloud Platform (PaaS) - Easiest Deployment

**Best for**: Quick deployment without server management
**Providers**: Railway, Render, Fly.io, Vercel (frontend only)
**Cost**: $5-25/month
**Pros**: Easy setup, automatic SSL, scaling
**Cons**: Less control, potential vendor lock-in

### Option 3: Shared Hosting (cPanel) - Traditional Web Hosting

**Best for**: If you already have cPanel hosting
**Providers**: Bluehost, HostGator, SiteGround
**Cost**: $3-10/month
**Pros**: Familiar interface, email included
**Cons**: Limited Node.js support, may need VPS upgrade

## 🚀 Quick Start: Choose Your Platform

### For Beginners: Railway or Render (Easiest)
- See `DEPLOY_RAILWAY.md` or `DEPLOY_RENDER.md`

### For Full Control: VPS (DigitalOcean/Linode)
- See `DEPLOY_VPS.md`

### For Existing Hosting: cPanel
- See `DEPLOY_CPANEL.md`

---

## 📦 Pre-Deployment Checklist

Before deploying, ensure:

- [ ] Backend `.env` file is configured with production values
- [ ] Admin credentials are changed from defaults
- [ ] JWT_SECRET is a strong random string
- [ ] Email SMTP settings are configured
- [ ] CORS origins are set correctly
- [ ] Domain name is ready (if using custom domain)
- [ ] SSL certificate is ready (or use Let's Encrypt)

---

## 🔧 Environment Variables Required

See `backend/env.example` for all required variables. Key ones:

```bash
PORT=3000
ADMIN_EMAIL=your-admin@email.com
ADMIN_PASSWORD=secure-password-here
JWT_SECRET=generate-strong-random-string
ALLOWED_ORIGINS=https://yourdomain.com
EMAIL_USER=noreply@yourdomain.com
EMAIL_PASSWORD=email-password
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=587
NODE_ENV=production
```

---

## 📝 Next Steps

1. Choose your hosting platform
2. Follow the specific deployment guide for that platform
3. Configure your domain DNS
4. Set up SSL/HTTPS
5. Test all functionality
6. Monitor and maintain

---

## 🆘 Need Help?

- Check platform-specific guides in this directory
- Review error logs in `backend/logs/`
- Ensure all environment variables are set correctly
- Verify firewall/security group settings allow your port

