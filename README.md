# Asset Recovery Service - Aesus Asset Reclaim

A complete asset recovery web application with secure case submission, client dashboard, and admin management.

## 🚀 Features

- **Asset Recovery Focus** - Dedicated to recovering lost, unclaimed, or misappropriated assets
- **No Win, No Fee** - 100% free assessment, payment only on successful recovery
- **Secure Case Submission** - Encrypted form submissions with file attachments
- **Client Portal** - Case status tracking and real-time updates
- **Admin Dashboard** - Complete case management and client communication
- **File Management** - Secure file uploads with validation
- **Email Notifications** - Automatic case confirmations
- **Responsive Design** - Works on all devices

## 📁 Project Structure

```
/
├── index.html                 # Main landing page for asset recovery
├── services.html              # Our services page
├── process.html               # About Us / Working process
├── asset-reclaim.html         # Contact Us / Submit case form
├── client-login.html          # Client authentication portal
├── client-dashboard.html      # Client case management dashboard
├── admin-login.html           # Admin authentication
├── admin-dashboard.html       # Admin case management dashboard
├── privacy-policy.html        # Privacy policy
├── terms-of-service.html      # Terms of service
├── styles.css                 # Global styling
├── siteConfig.js              # Global site configuration
├── icons.js                   # SVG icon system
├── terms-acceptance.js        # Terms acceptance handling
└── backend/                   # Node.js backend server
    ├── server.js              # Express server with all API endpoints
    ├── package.json           # Dependencies
    ├── data/
    │   ├── leads.json         # Case database
    │   └── users.json         # User authentication
    └── uploads/               # Secure file storage
```

## 🎯 Key Pages

- **`index.html`** - Main landing page with hero section and CTA
- **`services.html`** - Detailed service offerings page
- **`process.html`** - About Us / Our working process
- **`asset-reclaim.html`** - Contact form / Submit case
- **`client-login.html`** - OTP-based client authentication
- **`client-dashboard.html`** - Full case management for clients
- **`admin-login.html`** - Admin authentication
- **`admin-dashboard.html`** - Complete admin management interface

## 🔧 Setup & Installation

1. **Install dependencies:**
   ```bash
   cd backend
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp backend/env.example backend/.env
   # Edit backend/.env with your configuration
   ```

3. **Start the server:**
   ```bash
   cd backend
   node server.js
   ```

4. **Access the application:**
   - Main site: `http://localhost:3001`
   - Admin dashboard: `http://localhost:3001/admin-dashboard.html`

## 📝 Asset Recovery Features

### Client Features
- Submit asset recovery cases with supporting documents
- Track case status in real-time
- View case updates and messages
- Download case files securely
- Two-way communication with case team

### Admin Features
- View all asset recovery cases
- Update case status and add messages
- Manage case files
- Communicate with clients
- Track case metrics and statistics

## 🔒 Security Features

- Password hashing with bcrypt
- JWT token authentication
- Secure file uploads with validation
- Rate limiting on API endpoints
- HTTPS support (SSL/TLS)
- Input validation and sanitization
- XSS and CSRF protection

## 💼 Asset Recovery Types

- Corporate assets (dividends, bonds, stocks)
- Property reclaims (deposits, bonds)
- Financial assets (bank accounts, investments, pensions)
- Legal recovery (disputes, inheritance, settlements)

## 📞 Contact

For questions about asset recovery services, please use the contact form on the main page.

---

**Aesus Asset Reclaim** - Recovering what's rightfully yours.
