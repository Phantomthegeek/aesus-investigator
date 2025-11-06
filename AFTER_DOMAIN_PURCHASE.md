# What to Do After Buying aesusassetreclaim.com

## 🎉 Congratulations! You've Purchased Your Domain!

Here's exactly what to do next, step by step.

---

## 📋 Step-by-Step Process

### ✅ Step 1: Verify Domain Purchase (2 minutes)

After purchasing on Namecheap:

1. **Check your email** - You'll receive a confirmation
2. **Log into Namecheap** - Go to Domain List
3. **Verify domain is there** - You should see `aesusassetreclaim.com`
4. **Enable WHOIS Privacy** (if not already enabled)
   - Click "Manage" on your domain
   - Enable "WhoisGuard" (FREE)

**✅ Done when**: Domain shows in your Namecheap account

---

### 🚀 Step 2: Set Up Hosting (15-20 minutes)

**Choose your hosting platform:**

#### Option A: DigitalOcean App Platform (Recommended - $12/month)

1. **Create DigitalOcean Account**
   - Go to https://cloud.digitalocean.com
   - Sign up (get $200 free credit!)
   - Verify email

2. **Create New App**
   - Click "Create" → "Apps"
   - Click "Deploy from GitHub"
   - Connect your GitHub account
   - Select your `aesus-investigator` repository

3. **Configure Backend Component**
   - Click "Edit" on the detected component
   - **Name**: `backend`
   - **Type**: Web Service
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Run Command**: `node server.js`
   - **Environment**: Node.js
   - **Instance Size**: Basic ($12/month) - 512MB RAM

4. **Add Environment Variables**
   Click "Environment Variables" and add:
   ```bash
   PORT=3000
   NODE_ENV=production
   ADMIN_EMAIL=admin@aesusassetreclaim.com
   ADMIN_PASSWORD=your-secure-password-here
   JWT_SECRET=80d44021e98ec5db63560019b873aeeac728016b7933596c93c4aa5fc92c538f
   ALLOWED_ORIGINS=https://aesusassetreclaim.com,https://www.aesusassetreclaim.com
   EMAIL_USER=noreply@aesusassetreclaim.com
   EMAIL_PASSWORD=your-email-password
   SMTP_HOST=mail.aesusassetreclaim.com
   SMTP_PORT=587
   SMTP_SECURE=false
   DEFAULT_EMAIL_FROM=noreply@aesusassetreclaim.com
   ```

5. **Add Frontend Component**
   - Click "Add Component" → "Static Site"
   - **Root Directory**: `/` (root)
   - **Output Directory**: `/`
   - **Build Command**: (leave empty)

6. **Deploy!**
   - Click "Next" → Review → "Create Resources"
   - Wait 5-10 minutes for deployment

**✅ Done when**: Both components show "Live" status

---

#### Option B: Railway Pro ($20/month - Easier)

1. **Create Railway Account**
   - Go to https://railway.app
   - Sign up with GitHub

2. **Create New Project**
   - Click "New Project"
   - "Deploy from GitHub repo"
   - Select your repository

3. **Configure Backend**
   - Railway auto-detects Node.js
   - Set root directory to `backend/`
   - Add environment variables (same as above)

4. **Deploy Frontend**
   - Add new service
   - Type: Static Site
   - Root: `/`

**✅ Done when**: Services show "Active"

---

### 🔗 Step 3: Connect Domain to Hosting (10 minutes)

#### For DigitalOcean App Platform:

1. **In DigitalOcean Dashboard:**
   - Go to your App → Settings → Domains
   - Click "Add Domain"
   - Enter: `aesusassetreclaim.com`
   - Click "Add Domain"
   - DigitalOcean will show you DNS records

2. **In Namecheap:**
   - Go to Domain List → Click "Manage" on your domain
   - Go to "Advanced DNS" tab
   - **Option 1 (Easiest)**: Change Nameservers
     - Click "Change" next to Nameservers
     - Select "Custom DNS"
     - Enter DigitalOcean's nameservers (they'll show you)
     - Usually: `ns1.digitalocean.com`, `ns2.digitalocean.com`, `ns3.digitalocean.com`
   
   - **Option 2**: Add DNS Records
     - Add A Record:
       - Type: A Record
       - Host: @
       - Value: [IP from DigitalOcean]
       - TTL: Automatic
     - Add CNAME Record:
       - Type: CNAME
       - Host: www
       - Value: [provided by DigitalOcean]
       - TTL: Automatic

3. **Wait for DNS Propagation**
   - Usually 5-60 minutes
   - Check status: https://www.whatsmydns.net/#A/aesusassetreclaim.com

**✅ Done when**: Domain shows as "Active" in DigitalOcean

---

#### For Railway:

1. **In Railway Dashboard:**
   - Go to your service → Settings → Networking
   - Click "Custom Domain"
   - Enter: `aesusassetreclaim.com`
   - Railway shows you DNS records

2. **In Namecheap:**
   - Add CNAME record pointing to Railway's domain
   - Or change nameservers to Railway's

**✅ Done when**: Domain shows as "Active" in Railway

---

### 🔒 Step 4: SSL Certificate (Automatic!)

**Good news**: SSL is automatic!

- DigitalOcean: Automatically provisions SSL (5-10 minutes after DNS)
- Railway: Automatically provisions SSL
- **No action needed** - just wait!

**✅ Done when**: You see green lock in browser (https://aesusassetreclaim.com)

---

### ⚙️ Step 5: Update Your Code (5 minutes)

#### Update Backend Environment Variables

Your `.env` file should already have:
```bash
ALLOWED_ORIGINS=https://aesusassetreclaim.com,https://www.aesusassetreclaim.com
```

If not, update it:
```bash
cd backend
nano .env
# Add or update:
ALLOWED_ORIGINS=https://aesusassetreclaim.com,https://www.aesusassetreclaim.com
```

#### Update Frontend API URLs

Update these files to use your domain:

**admin-login.html** and **admin-dashboard.html**:

Find this function:
```javascript
const getBackendUrl = () => {
    const hostname = window.location.hostname;
    const port = window.location.port || '3001';
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '') {
        return `http://localhost:${port}`;
    }
    // Add your production domain
    if (hostname === 'aesusassetreclaim.com' || hostname === 'www.aesusassetreclaim.com') {
        return 'https://your-backend-url.ondigitalocean.app'; // Your DigitalOcean backend URL
    }
    return 'https://aesus-investigator-backend.herokuapp.com'; // Fallback
};
```

**Or simpler** - if using same domain for frontend and backend:
```javascript
const getBackendUrl = () => {
    const hostname = window.location.hostname;
    const port = window.location.port || '3001';
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '') {
        return `http://localhost:${port}`;
    }
    // Use same domain for API
    return `https://${hostname}`;
};
```

**index.html** - Update contact form (if hardcoded):
```javascript
// Find this line:
const response = await fetch('https://aesus-investigator-backend.herokuapp.com/api/contact', {

// Change to:
const response = await fetch('https://aesusassetreclaim.com/api/contact', {
```

**asset-reclaim.html** - Update form submission URL similarly

#### Commit and Push Changes

```bash
git add .
git commit -m "Update URLs for production domain"
git push origin main
```

Hosting will auto-deploy!

**✅ Done when**: Code is pushed and hosting redeploys

---

### 🧪 Step 6: Test Everything (10 minutes)

#### Frontend Tests:
- [ ] Visit https://aesusassetreclaim.com - Homepage loads
- [ ] Visit https://aesusassetreclaim.com/services.html - Services page works
- [ ] Visit https://aesusassetreclaim.com/asset-reclaim.html - Form page loads
- [ ] Check SSL - Green lock in browser

#### Backend Tests:
- [ ] Visit https://aesusassetreclaim.com/api/health - Should return JSON
- [ ] Test admin login: https://aesusassetreclaim.com/admin-login.html
- [ ] Submit contact form - Should work
- [ ] Submit asset reclaim form - Should work
- [ ] Test file upload - Should save

#### Admin Tests:
- [ ] Log into admin dashboard
- [ ] View cases
- [ ] Update case status
- [ ] Send message to client

#### Email Tests:
- [ ] Submit contact form - Check email received
- [ ] Submit asset reclaim - Check confirmation email

**✅ Done when**: Everything works!

---

## 📊 Complete Checklist

### Domain Setup:
- [ ] Domain purchased on Namecheap
- [ ] WHOIS privacy enabled
- [ ] Domain verified in account

### Hosting Setup:
- [ ] Hosting account created (DigitalOcean/Railway)
- [ ] Backend deployed
- [ ] Frontend deployed
- [ ] Environment variables configured

### Domain Connection:
- [ ] DNS records added OR nameservers changed
- [ ] DNS propagated (check with whatsmydns.net)
- [ ] Domain shows as "Active" in hosting

### SSL:
- [ ] SSL certificate provisioned (automatic)
- [ ] HTTPS works (green lock)

### Code Updates:
- [ ] Backend .env updated with domain
- [ ] Frontend URLs updated
- [ ] Changes committed and pushed
- [ ] Hosting redeployed

### Testing:
- [ ] Frontend loads
- [ ] Backend API works
- [ ] Forms submit correctly
- [ ] Admin login works
- [ ] File uploads work
- [ ] Emails send correctly

---

## 🆘 Troubleshooting

### Domain not working?
- Wait 5-60 minutes for DNS propagation
- Check DNS records are correct
- Verify nameservers if using that method

### SSL not working?
- Wait 10-15 minutes after DNS propagates
- Check hosting provider's SSL status
- Clear browser cache

### Backend not responding?
- Check environment variables are set
- Check logs in hosting dashboard
- Verify PORT is set correctly

### Frontend not loading?
- Check static site is deployed
- Verify root directory is correct
- Check build completed successfully

---

## 🎉 You're Live!

Once all steps are complete:
- ✅ Your website is live at https://aesusassetreclaim.com
- ✅ SSL is active (secure)
- ✅ Everything is working
- ✅ Professional and ready for business!

---

## 📞 Need Help?

I can help you with:
1. Setting up DigitalOcean/Railway account
2. Configuring environment variables
3. Connecting domain to hosting
4. Updating your code
5. Testing everything
6. Troubleshooting any issues

**Just let me know which step you're on and I'll guide you through it!**

