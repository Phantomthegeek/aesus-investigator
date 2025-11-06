# Railway Deployment Guide

Railway is a modern platform that makes deployment easy with automatic SSL and zero-config deployments.

## 📋 Prerequisites

- Railway account (free tier available)
- GitHub repository with your code
- Domain name (optional, Railway provides free subdomain)

## 🚀 Step 1: Create Railway Account

1. Go to https://railway.app
2. Sign up with GitHub
3. Create a new project

## 📦 Step 2: Deploy Backend

### Option A: Deploy from GitHub (Recommended)

1. Click "New Project" → "Deploy from GitHub repo"
2. Select your repository
3. Railway will auto-detect it's a Node.js app
4. Set root directory to `backend/`
5. Add environment variables (see below)

### Option B: Deploy from CLI

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

## ⚙️ Step 3: Configure Environment Variables

In Railway dashboard → Your Project → Variables:

```bash
PORT=3000
NODE_ENV=production
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=your-secure-password
JWT_SECRET=generate-strong-random-string
ALLOWED_ORIGINS=https://yourdomain.com,https://your-app.railway.app
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

## 🌐 Step 4: Configure Domain

1. Go to Settings → Networking
2. Click "Generate Domain" (free Railway domain)
3. Or add custom domain:
   - Click "Custom Domain"
   - Enter your domain
   - Add DNS records as shown

## 📝 Step 5: Update Frontend API URL

Update your frontend files to use the Railway backend URL:

```javascript
// In admin-login.html, admin-dashboard.html, etc.
const API_BASE_URL = 'https://your-app.railway.app';
```

Or use environment detection:
```javascript
const getBackendUrl = () => {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:3001';
    }
    return 'https://your-app.railway.app';  // Your Railway URL
};
```

## 🔄 Step 6: Deploy Frontend

### Option 1: GitHub Pages (Current)
- Keep using GitHub Pages for frontend
- Update API URLs to point to Railway backend

### Option 2: Railway Static Site
1. Create new service in Railway
2. Set root directory to `/` (root of repo)
3. Add build command: (none needed, static files)
4. Add start command: `npx serve -s . -l 3000`
5. Railway will serve your static files

## ✅ Step 7: Verify Deployment

1. Check Railway logs: Dashboard → Deployments → View Logs
2. Test API: `https://your-app.railway.app/api/health`
3. Test admin login
4. Test file uploads
5. Test email sending

## 🔧 Railway Configuration File (Optional)

Create `railway.json` in backend folder:

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node server.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

## 📊 Monitoring

- View logs in Railway dashboard
- Set up alerts in Settings → Notifications
- Monitor usage in Usage tab

## 💰 Pricing

- **Free Tier**: $5 credit/month
- **Hobby**: $5/month (after free credit)
- **Pro**: $20/month

## 🆘 Troubleshooting

### Build fails:
- Check Node.js version in `package.json`
- Ensure all dependencies are in `dependencies` (not `devDependencies`)

### Environment variables not working:
- Ensure variables are set in Railway dashboard
- Redeploy after adding variables

### Port issues:
- Railway sets `PORT` automatically
- Don't hardcode port, use `process.env.PORT || 3000`

## 🔄 Updating

Railway auto-deploys on git push to main branch, or:
1. Go to Dashboard
2. Click "Redeploy"
3. Or push to GitHub (if connected)

