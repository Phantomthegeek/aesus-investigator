# Render Deployment Guide

Render is a cloud platform that provides free SSL, automatic deployments, and zero-config hosting.

## 📋 Prerequisites

- Render account (free tier available)
- GitHub repository with your code
- Domain name (optional)

## 🚀 Step 1: Create Render Account

1. Go to https://render.com
2. Sign up with GitHub
3. Verify your email

## 📦 Step 2: Deploy Backend Service

1. Click "New +" → "Web Service"
2. Connect your GitHub repository
3. Configure:
   - **Name**: `aesus-backend`
   - **Environment**: `Node`
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: Free (or paid for better performance)

## ⚙️ Step 3: Configure Environment Variables

In Render dashboard → Your Service → Environment:

```bash
PORT=3000
NODE_ENV=production
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=your-secure-password
JWT_SECRET=generate-strong-random-string
ALLOWED_ORIGINS=https://yourdomain.com,https://your-app.onrender.com
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

## 🌐 Step 4: Configure Domain & SSL

1. Go to Settings → Custom Domains
2. Add your domain (e.g., `api.yourdomain.com`)
3. Render automatically provisions SSL certificate
4. Add DNS records as shown in Render dashboard

## 📝 Step 5: Deploy Frontend (Static Site)

1. Click "New +" → "Static Site"
2. Connect your GitHub repository
3. Configure:
   - **Name**: `aesus-frontend`
   - **Root Directory**: `/` (root)
   - **Build Command**: (leave empty, static files)
   - **Publish Directory**: `/` (root)

### Update Frontend API URL

In your frontend files, update the backend URL:

```javascript
// In admin-login.html, admin-dashboard.html, etc.
const getBackendUrl = () => {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:3001';
    }
    return 'https://your-backend-service.onrender.com';  // Your Render backend URL
};
```

## 🔧 Step 6: Render Configuration (Optional)

Create `render.yaml` in root:

```yaml
services:
  - type: web
    name: aesus-backend
    env: node
    rootDir: backend
    buildCommand: npm install
    startCommand: node server.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 3000

  - type: web
    name: aesus-frontend
    env: static
    buildCommand: ""
    staticPublishPath: .
```

## ✅ Step 7: Verify Deployment

1. Check Render logs: Dashboard → Your Service → Logs
2. Test API: `https://your-backend.onrender.com/api/health`
3. Test admin login
4. Test file uploads
5. Test email sending

## 📊 Monitoring

- View logs in real-time in Render dashboard
- Set up alerts in Settings → Notifications
- Monitor usage in Metrics tab

## 💰 Pricing

- **Free Tier**: 
  - Web services spin down after 15 min inactivity
  - 750 hours/month free
  - SSL included
- **Starter**: $7/month (always-on)
- **Standard**: $25/month (better performance)

## 🆘 Troubleshooting

### Service won't start:
- Check logs in Render dashboard
- Verify all environment variables are set
- Ensure `package.json` has correct start script

### Build fails:
- Check Node.js version compatibility
- Ensure all dependencies are listed in `package.json`

### Free tier spinning down:
- Upgrade to paid plan for always-on
- Or use a ping service to keep it awake (UptimeRobot)

## 🔄 Updating

Render auto-deploys on git push to main branch, or:
1. Go to Dashboard
2. Click "Manual Deploy" → "Deploy latest commit"

## ⚠️ Important Notes

- Free tier services spin down after inactivity
- First request after spin-down takes ~30 seconds
- Consider paid plan for production use
- Use environment variables, never commit secrets

