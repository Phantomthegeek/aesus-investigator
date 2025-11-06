# aesusassetreclaim.com - Complete Setup Guide

## ✅ Domain Information

**Domain**: `aesusassetreclaim.com`  
**Status**: Check availability below  
**Recommended**: ⭐⭐⭐⭐⭐ (Perfect for your business!)

## 🔍 Check Availability

- [Check on Namecheap](https://www.namecheap.com/domains/registration/results/?domain=aesusassetreclaim.com) (Recommended)
- [Check on GoDaddy](https://www.godaddy.com/en/domains)
- [Instant Check](https://www.instantdomainsearch.com/search?q=aesusassetreclaim.com)

## 💰 Expected Pricing

- **First Year**: $10-15
- **Renewal**: $10-15/year
- **With Privacy**: Usually FREE (Namecheap includes it)

## 🎯 Why .com is Perfect for Your Business

✅ **Most Trusted** - Users trust .com domains  
✅ **Professional** - Best for business credibility  
✅ **Memorable** - People default to .com  
✅ **SEO Friendly** - Search engines favor .com  
✅ **Email Friendly** - Less likely to be blocked  

## 🚀 Complete Setup Checklist

### Step 1: Purchase Domain
- [ ] Go to Namecheap.com
- [ ] Search for `aesusassetreclaim.com`
- [ ] Add to cart
- [ ] Enable FREE WHOIS privacy
- [ ] Complete purchase (~$10-15)

### Step 2: Set Up Hosting
- [ ] Choose hosting (DigitalOcean App Platform recommended)
- [ ] Deploy your backend
- [ ] Deploy your frontend

### Step 3: Connect Domain to Hosting
- [ ] Get DNS records from hosting provider
- [ ] Add DNS records in Namecheap
- [ ] Wait for DNS propagation (5-60 minutes)

### Step 4: Configure SSL
- [ ] SSL is automatic with DigitalOcean/Railway
- [ ] Verify HTTPS works

### Step 5: Update Your Code
- [ ] Update API URLs in frontend
- [ ] Update ALLOWED_ORIGINS in backend .env
- [ ] Test everything!

## 📋 DNS Configuration (After Purchase)

When you connect to DigitalOcean App Platform:

**Option 1: Use Nameservers (Easiest)**
```
Change nameservers in Namecheap to:
ns1.digitalocean.com
ns2.digitalocean.com
ns3.digitalocean.com
```

**Option 2: Use DNS Records**
```
Type: A Record
Host: @
Value: [IP from DigitalOcean]
TTL: Automatic

Type: CNAME
Host: www
Value: [provided by DigitalOcean]
TTL: Automatic
```

## ⚙️ Backend Environment Variables

Update your `backend/.env` file:

```bash
ALLOWED_ORIGINS=https://aesusassetreclaim.com,https://www.aesusassetreclaim.com
```

Or if using API subdomain:
```bash
ALLOWED_ORIGINS=https://aesusassetreclaim.com,https://www.aesusassetreclaim.com,https://api.aesusassetreclaim.com
```

## 🌐 Frontend URL Updates

Update these files to use your new domain:

1. **admin-login.html** - Update `getBackendUrl()` function
2. **admin-dashboard.html** - Update `getBackendUrl()` function
3. **index.html** - Update contact form API URL (if hardcoded)
4. **asset-reclaim.html** - Update form submission URL (if hardcoded)

## 📧 Email Setup

You can set up email with your domain:

**Option 1: Use Domain Email (cPanel)**
```
EMAIL_USER=noreply@aesusassetreclaim.com
SMTP_HOST=mail.aesusassetreclaim.com
```

**Option 2: Use Third-Party (Recommended)**
- Google Workspace ($6/month)
- Microsoft 365 ($6/month)
- Zoho Mail (Free tier available)

## ✅ Post-Setup Verification

After everything is connected:

- [ ] Visit https://aesusassetreclaim.com - Frontend loads
- [ ] Visit https://aesusassetreclaim.com/admin-login.html - Admin page works
- [ ] Test API endpoints - Backend responds
- [ ] Test file uploads - Files save correctly
- [ ] Test email sending - Emails deliver
- [ ] Check SSL certificate - Green lock in browser

## 🆘 Common Issues

**Domain not working?**
- Wait 5-60 minutes for DNS propagation
- Check DNS records are correct
- Verify nameservers are set properly

**SSL not working?**
- Wait a few minutes after DNS propagates
- Check hosting provider's SSL status
- Clear browser cache

**Email not working?**
- Verify SMTP settings in .env
- Check email credentials
- Test with a simple email first

## 🎉 You're All Set!

Once `aesusassetreclaim.com` is:
- ✅ Purchased
- ✅ Connected to hosting
- ✅ SSL configured
- ✅ Code updated

Your professional website will be live!

---

**Need help with any step?** Let me know and I'll guide you through it!

