/**
 * server.js - Aesus Asset Reclaim Backend Server
 * 
 * Express.js server providing REST API endpoints for:
 * - Admin authentication and case management
 * - Client authentication (OTP-based) and case tracking
 * - Contact form submissions
 * - Asset reclaim case submissions
 * - File uploads and management
 * - Email notifications
 * - Case status updates and messaging
 * 
 * Security features:
 * - JWT token authentication
 * - Rate limiting
 * - CORS protection
 * - Input sanitization
 * - File upload validation
 * - Helmet security headers
 */

// ============================================================================
// ENVIRONMENT CONFIGURATION
// ============================================================================

// Load environment variables from .env file
// This allows configuration without hardcoding sensitive values
const dotenv = require('dotenv');
const path = require('path');                    // Path manipulation utilities (needed early for .env path)
dotenv.config();

// Also load .env from the backend directory explicitly (works regardless of cwd)
// This ensures .env is found even if server is run from different directory
try { dotenv.config({ path: path.join(__dirname, '.env') }); } catch (_) {}

// ============================================================================
// CORE DEPENDENCIES
// ============================================================================

const express = require('express');              // Web framework
const multer = require('multer');                 // File upload handling
const fs = require('fs').promises;               // File system operations (async)
const logger = require('./logger');              // Custom logging utility
const cors = require('cors');                    // Cross-Origin Resource Sharing
const helmet = require('helmet');                // Security headers middleware
const rateLimit = require('express-rate-limit'); // Rate limiting middleware
const nodemailer = require('nodemailer');        // Email sending
const jwt = require('jsonwebtoken');             // JSON Web Token authentication
const bcrypt = require('bcryptjs');              // Password hashing
const { v4: uuidv4 } = require('uuid');          // UUID generation for case IDs
const { ClientSecretCredential } = require('@azure/identity'); // Azure authentication
const { Client } = require('@microsoft/microsoft-graph-client'); // Microsoft Graph API
const msal = require('@azure/msal-node');         // Microsoft Authentication Library

// Initialize Express application
const app = express();

// ============================================================================
// SSL/HTTPS CONFIGURATION
// ============================================================================

/**
 * SSL Certificate Loading
 * Attempts to load SSL certificates for HTTPS support if available.
 * If certificates exist in backend/ssl/, HTTPS will be enabled.
 * Otherwise, the server runs on HTTP (development mode).
 */
let httpsEnabled = false;
let httpsServer = null;

if (process.env.USE_HTTPS !== 'false') {
  try {
    const fs = require('fs');
    const https = require('https');
    const certPath = path.join(__dirname, 'ssl', 'cert.pem');
    const keyPath = path.join(__dirname, 'ssl', 'key.pem');
    
    // Check if SSL certificate files exist
    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      const options = {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath)
      };
      httpsServer = https.createServer(options, app);
      httpsEnabled = true;
      console.log('🔒 HTTPS enabled with SSL certificate');
    }
  } catch (error) {
    console.log('⚠️  HTTPS not available, using HTTP');
  }
}

// ============================================================================
// ENVIRONMENT VARIABLES
// ============================================================================

/**
 * Server Configuration from Environment Variables
 * These values are loaded from .env file or use defaults for development.
 * In production, these MUST be set in .env file.
 */
const PORT = process.env.PORT || 3000;                    // Server port (default: 3000)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;              // Admin login email
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;        // Admin login password (should be hashed)
const JWT_SECRET = process.env.JWT_SECRET;                // Secret key for JWT token signing

// CRITICAL: Require environment variables in production
if (process.env.NODE_ENV === 'production') {
  if (!ADMIN_EMAIL) {
    console.error('🚨 CRITICAL SECURITY ERROR: ADMIN_EMAIL must be set in .env file!');
    process.exit(1);
  }
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD === 'admin123') {
    console.error('🚨 CRITICAL SECURITY ERROR: ADMIN_PASSWORD must be set in .env file and cannot be default!');
    process.exit(1);
  }
  if (!JWT_SECRET || JWT_SECRET.includes('capital-reclaim-secret-key-change-in-production')) {
    console.error('🚨 CRITICAL SECURITY ERROR: JWT_SECRET must be set in .env file and cannot be default!');
    process.exit(1);
  }
} else {
  // Development fallbacks (still warn)
  if (!ADMIN_EMAIL) {
    console.warn('⚠️  WARNING: ADMIN_EMAIL not set, using fallback');
  }
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD === 'admin123') {
    console.warn('⚠️  WARNING: ADMIN_PASSWORD not set or using default. Set a secure password in .env!');
  }
  if (!JWT_SECRET || JWT_SECRET.includes('capital-reclaim-secret-key-change-in-production')) {
    console.warn('⚠️  WARNING: JWT_SECRET not set or using default. Set a secure secret in .env!');
  }
}

// Final fallbacks (only for development)
const finalAdminEmail = ADMIN_EMAIL || 'admin@capitalreclaim.com';
const finalAdminPassword = ADMIN_PASSWORD || 'admin123';
const finalJwtSecret = JWT_SECRET || 'capital-reclaim-secret-key-change-in-production';

// OAuth2 Configuration for Microsoft Graph API
// Application credentials (client credentials flow)
let graphClient = null;
let accessToken = null;
let tokenExpiry = null;

// Delegated auth (authorization code + refresh token using MSAL)
let delegatedAccessToken = null;
let delegatedAccessTokenExpiry = 0;
let delegatedAccount = null; // { username, homeAccountId, environment, tenantId }
let msalClient = null;
const msalCacheFile = path.join(__dirname, 'data', 'msal-cache.json');

// Initialize Microsoft Graph client if OAuth credentials are provided
if (process.env.OAUTH_CLIENT_ID && process.env.OAUTH_CLIENT_SECRET && process.env.OAUTH_TENANT_ID) {
  try {
    const credentials = new ClientSecretCredential(
      process.env.OAUTH_TENANT_ID,
      process.env.OAUTH_CLIENT_ID,
      process.env.OAUTH_CLIENT_SECRET
    );
    
    graphClient = Client.init({
      authProvider: async (done) => {
        try {
          if (!accessToken || Date.now() >= tokenExpiry) {
            // Client credentials flow must use `.default` only
            const tokenResponse = await credentials.getToken([
              'https://graph.microsoft.com/.default'
            ]);
            accessToken = tokenResponse.token;
            tokenExpiry = Date.now() + (tokenResponse.expiresOnTimestamp - Date.now() - 60000); // Expire 1 minute early
          }
          done(null, accessToken);
        } catch (error) {
          done(error, null);
        }
      }
    });
    console.log('✅ Microsoft Graph OAuth2 client initialized');
  } catch (error) {
    console.error('⚠️  Failed to initialize Microsoft Graph client:', error.message);
  }
}

// Initialize MSAL confidential client for delegated flow (if redirect URI configured)
if (
  process.env.OAUTH_CLIENT_ID &&
  process.env.OAUTH_CLIENT_SECRET &&
  (process.env.OAUTH_AUTHORITY || process.env.OAUTH_TENANT_ID)
) {
  try {
    const cachePlugin = {
      beforeCacheAccess: async (cacheContext) => {
        try {
          await fs.mkdir(path.dirname(msalCacheFile), { recursive: true });
          const cacheData = await fs.readFile(msalCacheFile, 'utf8').catch(() => '');
          if (cacheData) cacheContext.tokenCache.deserialize(cacheData);
        } catch (e) {
          console.warn('MSAL cache read failed:', e.message);
        }
      },
      afterCacheAccess: async (cacheContext) => {
        if (cacheContext.cacheHasChanged) {
          try {
            await fs.writeFile(msalCacheFile, cacheContext.tokenCache.serialize(), 'utf8');
          } catch (e) {
            console.warn('MSAL cache write failed:', e.message);
          }
        }
      }
    };

    msalClient = new msal.ConfidentialClientApplication({
      auth: {
        clientId: process.env.OAUTH_CLIENT_ID,
        authority: process.env.OAUTH_AUTHORITY || `https://login.microsoftonline.com/${process.env.OAUTH_TENANT_ID || 'common'}`,
        clientSecret: process.env.OAUTH_CLIENT_SECRET
      },
      cache: { cachePlugin },
      system: { loggerOptions: { loggerCallback: () => {} } }
    });
    console.log('✅ MSAL confidential client initialized (delegated email ready)');
    // Try to hydrate delegatedAccount/access token from cache silently
    msalClient.getTokenCache().getAllAccounts().then(async (accounts) => {
      if (accounts && accounts.length > 0) {
        delegatedAccount = accounts[0];
        try {
          const result = await msalClient.acquireTokenSilent({
            account: delegatedAccount,
            scopes: ['Mail.Send']
          });
          delegatedAccessToken = result.accessToken;
          delegatedAccessTokenExpiry = result.expiresOn?.getTime() || (Date.now() + 60 * 60 * 1000);
          console.log('🔄 Delegated token restored from cache for', delegatedAccount.username || 'account');
        } catch (e) {
          console.log('ℹ️  No valid delegated token available on startup');
        }
      }
    }).catch(() => {});
  } catch (e) {
    console.error('⚠️  MSAL init failed:', e.message);
  }
} else {
  const missing = [];
  if (!process.env.OAUTH_CLIENT_ID) missing.push('OAUTH_CLIENT_ID');
  if (!process.env.OAUTH_CLIENT_SECRET) missing.push('OAUTH_CLIENT_SECRET');
  if (!process.env.OAUTH_TENANT_ID) missing.push('OAUTH_TENANT_ID');
  console.warn('ℹ️  MSAL delegated auth not configured. Missing:', missing.join(', '), '\nSet these in backend/.env. Redirect URI will default dynamically if not set.');
}

// Configure email transporter - Primary method for cPanel/domain email
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'mail.aesusinvestigators.com',
  port: parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true' || process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASSWORD || ''
  },
  tls: {
    rejectUnauthorized: false // Allow self-signed certs if needed
  },
  debug: process.env.NODE_ENV !== 'production', // Debug logging in development only
  logger: process.env.NODE_ENV !== 'production' // Console logging in development only
});

// Set default email from address
// Uses contact@aesusinvestigators.com as the default sender
const DEFAULT_EMAIL_FROM = process.env.DEFAULT_EMAIL_FROM || process.env.EMAIL_USER || 'contact@aesusinvestigators.com';

// SECURITY FIX: Enhanced helmet configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline needed for inline styles
      scriptSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline needed for inline scripts in HTML files
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null // Only in production
    }
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
    force: process.env.NODE_ENV === 'production' // Only force in production
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  permittedCrossDomainPolicies: false, // Disable Adobe Flash/Silverlight policies
  expectCt: {
    enforce: process.env.NODE_ENV === 'production',
    maxAge: 86400 // 24 hours
  },
  crossOriginEmbedderPolicy: false, // Set to true if you want stricter isolation
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "same-origin" },
  originAgentCluster: true
}));

// SECURITY FIX: Restrictive CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : (process.env.NODE_ENV === 'production' 
      ? [] // No origins allowed in production unless explicitly set
      : ['http://localhost:3000', 'http://localhost:3001', 'https://localhost:3000', 'http://localhost:8000', 'null']); // Dev defaults - 'null' allows file:// protocol

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman, file:// protocol)
    if (!origin || origin === 'null') return callback(null, true);
    
    // In development, allow all localhost origins
    if (process.env.NODE_ENV !== 'production') {
      if (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.startsWith('file://')) {
        return callback(null, true);
      }
    }
    
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️  CORS: Blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// SECURITY FIX: Trust proxy only when explicitly configured
// In production, only trust specific proxy IPs
const trustProxy = process.env.TRUST_PROXY === 'true';
const trustedProxies = process.env.TRUSTED_PROXY_IPS 
  ? process.env.TRUSTED_PROXY_IPS.split(',').map(ip => ip.trim())
  : [];
  
if (trustProxy || trustedProxies.length > 0) {
  if (trustedProxies.length > 0) {
    app.set('trust proxy', (ip) => trustedProxies.includes(ip));
  } else {
    app.set('trust proxy', 1); // Only for development
    console.warn('⚠️  WARNING: Trusting all proxies. Set TRUSTED_PROXY_IPS in production!');
  }
} else {
  // Don't trust proxy by default
  app.set('trust proxy', false);
}

// Rate limiting - prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    if (req.path.startsWith('/api/')) {
      res.status(429).json({
        success: false,
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
      });
    } else {
      res.status(429).send('Too many requests from this IP, please try again later.');
    }
  }
});

// Apply rate limiting to all API routes
app.use('/api/', limiter);

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many login attempts, please try again later.',
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many login attempts from this IP. Please try again later.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});

app.use('/api/admin/login', authLimiter);

// Rate limiting for client OTP endpoints
const clientLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 OTP requests per windowMs
  message: 'Too many OTP requests. Please wait a few minutes before trying again.',
  skipSuccessfulRequests: false,
});

const clientVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 verification attempts per windowMs
  message: 'Too many verification attempts. Please wait a few minutes before trying again.',
  skipSuccessfulRequests: false,
});

app.use('/api/client/request-login', clientLoginLimiter);
app.use('/api/client/verify-otp', clientVerifyLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
// Serve favicon
app.get('/favicon.ico', (req, res) => {
  // Return a simple 204 No Content to avoid 404 errors
  // Browsers will just not show a favicon instead of logging errors
  res.status(204).end();
});

// SECURITY FIX: Serve Let's Encrypt validation files (for webroot mode)
app.get('/.well-known/acme-challenge/:token', (req, res) => {
  const token = req.params.token;
  const validationPath = path.join(__dirname, '..', '.well-known', 'acme-challenge', token);
  
  // SECURITY: Validate token to prevent path traversal
  if (!token || !token.match(/^[a-zA-Z0-9_-]+$/)) {
    return res.status(400).send('Invalid token');
  }
  
  res.sendFile(validationPath, (err) => {
    if (err) {
      res.status(404).send('Not found');
    }
  });
});

app.use(express.static(path.join(__dirname, '..')));

// Data storage setup
const dataDir = path.join(__dirname, 'data');
const leadsFile = path.join(dataDir, 'leads.json');
const usersFile = path.join(dataDir, 'users.json');

const initDirectories = async () => {
  try {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(path.join(__dirname, 'uploads'), { recursive: true });
    
    await fs.access(leadsFile).catch(() => fs.writeFile(leadsFile, '[]', 'utf8'));
    await fs.access(usersFile).catch(() => fs.writeFile(usersFile, '[]', 'utf8'));
  } catch (error) {
    console.error('Directory initialization failed:', error);
  }
};

let writeQueue = Promise.resolve();

const readLeads = async () => {
  try {
    const data = await fs.readFile(leadsFile, 'utf8');
    return JSON.parse(data || '[]');
  } catch (error) {
    console.error('Error reading leads:', error);
    return [];
  }
};

const writeLeads = async (leads) => {
  return new Promise((resolve, reject) => {
    writeQueue = writeQueue
      .then(() => fs.writeFile(leadsFile, JSON.stringify(leads, null, 2), 'utf8'))
      .then(resolve)
      .catch(reject);
  });
};

const readUsers = async () => {
  try {
    const data = await fs.readFile(usersFile, 'utf8');
    return JSON.parse(data || '[]');
  } catch (error) {
    return [];
  }
};

const writeUsers = async (users) => {
  return new Promise((resolve, reject) => {
    writeQueue = writeQueue
      .then(() => fs.writeFile(usersFile, JSON.stringify(users, null, 2), 'utf8'))
      .then(resolve)
      .catch(reject);
  });
};

// Helper to get a Graph client using a provided bearer token
const getGraphClientWithToken = (token) => {
  return Client.init({
    authProvider: (done) => done(null, token)
  });
};

// Email helper - Prefer Delegated Graph if available, else App Graph, else SMTP
const tryRefreshDelegatedToken = async () => {
  try {
    if (msalClient && delegatedAccount) {
      const result = await msalClient.acquireTokenSilent({ account: delegatedAccount, scopes: ['Mail.Send'] });
      delegatedAccessToken = result.accessToken;
      delegatedAccessTokenExpiry = result.expiresOn?.getTime() || (Date.now() + 60 * 60 * 1000);
    }
  } catch (_) {}
};

const logGraphError = async (e) => {
  try {
    const status = e?.statusCode || e?.status || 'unknown';
    const code = e?.code || 'unknown';
    console.warn('Graph send error:', status, code);
  } catch (_) {}
};

const sendEmail = async (to, subject, html, options = {}) => {
  try {
    // Priority 1: SMTP (primary method for cPanel/domain email)
    if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
      try {
        await transporter.sendMail({
          from: DEFAULT_EMAIL_FROM,
          to,
          subject,
          html,
          ...options
        });
        if (process.env.NODE_ENV !== 'production') {
          console.log('✅ Email sent via SMTP to:', to);
        }
        return;
      } catch (smtpError) {
        console.warn('⚠️  SMTP send failed:', smtpError.message);
        // Fall through to Graph if SMTP fails
      }
    }

    // Priority 2: Microsoft Graph (Delegated token)
    const buildGraphMessage = () => ({
      message: {
        subject: subject,
        body: { contentType: 'HTML', content: html },
        toRecipients: [ { emailAddress: { address: to } } ],
        ...(options.cc && { ccRecipients: [ { emailAddress: { address: options.cc } } ] })
      }
    });

    if (delegatedAccessToken && Date.now() < delegatedAccessTokenExpiry - 60000) {
      try {
        const delegatedClient = getGraphClientWithToken(delegatedAccessToken);
        await delegatedClient.api('/me/sendMail').post(buildGraphMessage());
        // Email sent successfully (log only in development)
        return;
      } catch (e) {
        await logGraphError(e);
        await tryRefreshDelegatedToken();
        if (delegatedAccessToken && Date.now() < delegatedAccessTokenExpiry - 60000) {
          try {
            const delegatedClient = getGraphClientWithToken(delegatedAccessToken);
            await delegatedClient.api('/me/sendMail').post(buildGraphMessage());
            // Email sent successfully after token refresh
            return;
          } catch (e2) {
            await logGraphError(e2);
            console.warn('Graph delegated retry failed');
          }
        }
      }
    }

    // Priority 3: Microsoft Graph (Application)
    if (graphClient && process.env.EMAIL_USER) {
      try {
        await graphClient.api(`/users/${process.env.EMAIL_USER}/sendMail`).post(buildGraphMessage());
        // Email sent via Graph (application)
        return;
      } catch (e) {
        await logGraphError(e);
        console.warn('Graph application send failed');
      }
    }

    // If all methods failed and SMTP wasn't configured, throw error
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      throw new Error('No email method available. Configure EMAIL_USER and EMAIL_PASSWORD for SMTP.');
    }
    
    // Final attempt: SMTP without credentials (may work if server allows)
    await transporter.sendMail({
      from: DEFAULT_EMAIL_FROM,
      to,
      subject,
      html,
      ...options
    });
    // Email sent via SMTP (unauthenticated)
  } catch (error) {
    console.error('❌ Email error:', error.message);
    throw error;
  }
};

// MSAL delegated auth endpoints
// 1) Get login URL
app.get('/api/ms/login-url', (req, res) => {
  try {
    if (!msalClient) return res.status(400).json({ error: 'MSAL not configured' });
    const dynamicRedirect = `${req.protocol}://${req.get('host')}/api/ms/callback`;
    const redirectUri = process.env.OAUTH_REDIRECT_URI || dynamicRedirect;
    const authCodeUrlParameters = {
      scopes: ['openid', 'profile', 'offline_access', 'Mail.Send'],
      redirectUri,
      authority: process.env.OAUTH_AUTHORITY || undefined,
      prompt: 'select_account',
      domainHint: 'consumers',
      loginHint: process.env.EMAIL_USER || undefined
    };
    msalClient.getAuthCodeUrl(authCodeUrlParameters)
      .then((url) => res.json({ url }))
      .catch((e) => res.status(500).json({ error: e.message }));
  } catch (e) {
    res.status(500).json({ error: 'Failed to create login URL' });
  }
});

// 2) Callback to exchange code for tokens
app.get('/api/ms/callback', async (req, res) => {
  try {
    if (!msalClient) return res.status(400).send('MSAL not configured');
    const dynamicRedirect = `${req.protocol}://${req.get('host')}/api/ms/callback`;
    const redirectUri = process.env.OAUTH_REDIRECT_URI || dynamicRedirect;
    const tokenResponse = await msalClient.acquireTokenByCode({
      code: req.query.code,
      scopes: ['openid', 'profile', 'offline_access', 'Mail.Send'],
      redirectUri,
      authority: process.env.OAUTH_AUTHORITY || undefined
    });

    delegatedAccessToken = tokenResponse.accessToken;
    delegatedAccessTokenExpiry = tokenResponse.expiresOn?.getTime() || (Date.now() + 60 * 60 * 1000);
    delegatedAccount = tokenResponse.account || null;

    // Optionally persist refresh token via cache plugin (not implemented here)
    res.send('Delegated email connected. You can close this window.');
  } catch (e) {
    console.error('MSAL callback error:', e.message);
    res.status(500).send('Authentication failed');
  }
});

// 3) Silent refresh endpoint (optional, uses MSAL cache)
app.post('/api/ms/refresh', async (req, res) => {
  try {
    if (!msalClient || !delegatedAccount) return res.status(400).json({ error: 'Not connected' });
    const result = await msalClient.acquireTokenSilent({
      account: delegatedAccount,
      scopes: ['Mail.Send']
    });
    delegatedAccessToken = result.accessToken;
    delegatedAccessTokenExpiry = result.expiresOn?.getTime() || (Date.now() + 60 * 60 * 1000);
    res.json({ success: true, expiresOn: delegatedAccessTokenExpiry });
  } catch (e) {
    console.error('MSAL silent refresh error:', e.message);
    res.status(500).json({ error: 'Refresh failed' });
  }
});

// 4) Status endpoint
app.get('/api/ms/status', async (req, res) => {
  try {
    const connected = !!delegatedAccount && !!delegatedAccessToken && (Date.now() < (delegatedAccessTokenExpiry - 60000));
    res.json({
      connected,
      account: delegatedAccount ? { username: delegatedAccount.username, tenantId: delegatedAccount.tenantId } : null,
      expiresOn: delegatedAccessTokenExpiry || null
    });
  } catch (e) {
    res.status(500).json({ error: 'Status unavailable' });
  }
});

// 5) Logout/Disconnect delegated session
app.post('/api/ms/logout', async (req, res) => {
  try {
    delegatedAccessToken = null;
    delegatedAccessTokenExpiry = 0;
    delegatedAccount = null;
    try { await fs.unlink(msalCacheFile); } catch (_) {}
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Logout failed' });
  }
});


// File upload configuration
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const tempDir = path.join(__dirname, 'uploads', 'temp');
    try {
      await fs.mkdir(tempDir, { recursive: true });
      cb(null, tempDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${timestamp}-${cleanName}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif',
      'application/pdf', 'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error(`File type ${file.mimetype} not allowed`), false);
    }
    
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.txt', '.doc', '.docx'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.includes(fileExt)) {
      return cb(new Error(`File extension ${fileExt} not allowed`), false);
    }
    
    cb(null, true);
  }
});

// SECURITY FIX: HTML escaping function
const escapeHtml = (text) => {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// SECURITY FIX: Apply input sanitization middleware to all routes
const sanitizeInput = (req, res, next) => {
  // Sanitize query parameters
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        // Remove null bytes and trim
        req.query[key] = req.query[key].replace(/\0/g, '').trim();
        // Limit length to prevent DoS
        if (req.query[key].length > 1000) {
          req.query[key] = req.query[key].substring(0, 1000);
        }
      }
    });
  }
  
  // Sanitize body parameters (if JSON)
  if (req.body && typeof req.body === 'object') {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        // Remove null bytes and trim
        req.body[key] = req.body[key].replace(/\0/g, '').trim();
        // Limit length based on field type
        const maxLength = key === 'message' || key === 'details' || key === 'notes' ? 50000 : 1000;
        if (req.body[key].length > maxLength) {
          req.body[key] = req.body[key].substring(0, maxLength);
        }
      }
    });
  }
  
  // Sanitize URL parameters
  if (req.params) {
    Object.keys(req.params).forEach(key => {
      if (typeof req.params[key] === 'string') {
        // Remove dangerous characters for path traversal
        req.params[key] = req.params[key].replace(/[./\\]/g, '');
        // Limit length
        if (req.params[key].length > 255) {
          req.params[key] = req.params[key].substring(0, 255);
        }
      }
    });
  }
  
  next();
};

// Apply sanitization middleware
app.use(sanitizeInput);

// SECURITY FIX: Email validation
const validateEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim()) && email.length <= 255;
};

// SECURITY FIX: Validate required fields
const validateRequired = (fields, data) => {
  const missing = [];
  fields.forEach(field => {
    if (!data[field] || (typeof data[field] === 'string' && !data[field].trim())) {
      missing.push(field);
    }
  });
  return missing;
};

// SECURITY FIX: CSV injection prevention
const escapeCsvValue = (value) => {
  if (!value) return '';
  const str = String(value);
  // Check for formula injection characters
  if (/^[=+\-@\t\r]/.test(str)) {
    // Escape with tab character to prevent formula execution
    return "'" + str.replace(/'/g, "''");
  }
  // Escape quotes for CSV
  return str.replace(/"/g, '""');
};

const validateContactInput = (data) => {
  const errors = [];
  
  if (!data.name?.trim()) errors.push('Name is required');
  if (!data.email?.trim()) errors.push('Email is required');
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (data.email && !emailRegex.test(data.email)) {
    errors.push('Invalid email format');
  }
  
  if (data.name && data.name.length > 100) errors.push('Name too long');
  if (data.email && data.email.length > 255) errors.push('Email too long');
  
  const sanitized = {
    name: data.name?.trim(),
    email: data.email?.trim(),
    phone: data.phone?.trim(),
    service: data.service?.trim(),
    message: data.message?.trim()
  };
  
  return { errors, sanitized };
};

const generateCaseId = () => 'C-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();

const moveFilesToCaseFolder = async (tempFiles, caseId) => {
  const caseDir = path.join(__dirname, 'uploads', caseId);
  await fs.mkdir(caseDir, { recursive: true });

  const movedFiles = [];
  for (const tempFile of tempFiles) {
    const oldPath = path.join(__dirname, 'uploads', 'temp', tempFile.filename);
    const newPath = path.join(caseDir, tempFile.filename);
    
    try {
      await fs.rename(oldPath, newPath);
      movedFiles.push({
        ...tempFile,
        url: `/api/uploads/${caseId}/${tempFile.filename}`
      });
    } catch (error) {
      console.error('Error moving file:', error);
    }
  }

  return movedFiles;
};

// File download endpoint
app.get('/api/uploads/:caseId/:filename', async (req, res) => {
  try {
    const { caseId, filename } = req.params;
    
    if (!filename.match(/^\d+-[a-zA-Z0-9._-]+$/)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
    // SECURITY FIX: Prevent path traversal
    // Validate caseId and filename are safe
    if (!caseId.match(/^[a-zA-Z0-9_-]+$/) || !filename.match(/^\d+-[a-zA-Z0-9._-]+$/)) {
      return res.status(400).json({ error: 'Invalid case ID or filename format' });
    }
    
    // Use path.resolve and ensure it stays within uploads directory
    const uploadsDir = path.resolve(__dirname, 'uploads');
    const caseDir = path.resolve(uploadsDir, caseId);
    const filePath = path.resolve(caseDir, filename);
    
    // Verify file is within uploads directory (prevent path traversal)
    if (!filePath.startsWith(uploadsDir)) {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    
    await fs.access(filePath);
    res.setHeader('Content-Disposition', 'inline');
    res.sendFile(filePath);
    
  } catch (error) {
    console.error('File download error:', error);
    res.status(404).json({ error: 'File not found' });
  }
});

// AUTHENTICATION MIDDLEWARE
const authenticateAdmin = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, finalJwtSecret);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Admin login attempts tracking
let loginAttempts = {};
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes

// Clean up old login attempts
setInterval(() => {
  const now = Date.now();
  Object.keys(loginAttempts).forEach(ip => {
    if (now - loginAttempts[ip].lastAttempt > LOGIN_LOCKOUT_TIME) {
      delete loginAttempts[ip];
    }
  });
}, 60 * 1000); // Clean every minute

// Admin activity logging (refactored to dedicated subfolder with validation)
const logAdminActivity = async (action, adminEmail, details = {}) => {
  try {
    const logDir = path.join(__dirname, 'logs', 'admin-activity');
    await fs.mkdir(logDir, { recursive: true });

    // Validate inputs
    const safeAction = typeof action === 'string' ? action.slice(0, 100) : 'unknown';
    const safeEmail = typeof adminEmail === 'string' ? adminEmail.slice(0, 255) : 'unknown';
    const meta = (details && typeof details === 'object') ? details : {};

    const logFile = path.join(logDir, `admin-activity-${new Date().toISOString().split('T')[0]}.log`);
    const logEntry = {
      timestamp: new Date().toISOString(),
      action: safeAction,
      adminEmail: safeEmail,
      meta
    };

    await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n');
  } catch (error) {
    try { logger.error('Failed to log admin activity', { error: error.message }); } catch (_) {}
  }
};

// AUTH API
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid input format' });
    }
    
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // Sanitize input length
    if (email.length > 255 || password.length > 200) {
      return res.status(400).json({ error: 'Input too long' });
    }
    
    // Normalize email (lowercase, trim)
    const normalizedEmail = email.toLowerCase().trim();
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    
    // Check rate limiting (login attempts)
    if (loginAttempts[clientIP] && loginAttempts[clientIP].attempts >= MAX_LOGIN_ATTEMPTS) {
      const timeRemaining = LOGIN_LOCKOUT_TIME - (Date.now() - loginAttempts[clientIP].lastAttempt);
      if (timeRemaining > 0) {
        await logAdminActivity('login_attempt_blocked', normalizedEmail, { 
          reason: 'Too many failed attempts',
          ip: clientIP,
          attempts: loginAttempts[clientIP].attempts
        });
        return res.status(429).json({ 
          error: `Too many login attempts. Please try again in ${Math.ceil(timeRemaining / 60000)} minutes.` 
        });
      } else {
        // Lockout expired, reset
        delete loginAttempts[clientIP];
      }
    }
    
    // Check email
    const expectedEmail = finalAdminEmail.toLowerCase().trim();
    if (normalizedEmail !== expectedEmail) {
      // Failed login - wrong email
      if (!loginAttempts[clientIP]) {
        loginAttempts[clientIP] = { attempts: 0, lastAttempt: Date.now() };
      }
      loginAttempts[clientIP].attempts++;
      loginAttempts[clientIP].lastAttempt = Date.now();
      
      await logAdminActivity('login_failed', normalizedEmail, { 
        ip: clientIP,
        reason: 'Invalid email',
        attempts: loginAttempts[clientIP].attempts
      });
      
      // Use generic error message (don't reveal if email exists)
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Verify password
    // Support both hashed (bcrypt) and plaintext passwords for migration
    let isPasswordValid = false;
    
    if (!finalAdminPassword) {
      // No password configured
      await logAdminActivity('login_failed', normalizedEmail, { 
        ip: clientIP,
        reason: 'Password not configured'
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check if password is a bcrypt hash (starts with $2a$, $2b$, or $2y$)
    const isBcryptHash = /^\$2[ayb]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(finalAdminPassword);
    
    if (isBcryptHash) {
      // Password is hashed - use bcrypt comparison
      try {
        isPasswordValid = await bcrypt.compare(password, finalAdminPassword);
      } catch (bcryptError) {
        console.error('Bcrypt comparison error:', bcryptError.message);
        isPasswordValid = false;
      }
    } else {
      // Password is plaintext - compare directly (development/legacy support)
      // In production, passwords should be hashed
      if (process.env.NODE_ENV === 'production') {
        console.warn('⚠️  SECURITY WARNING: Using plaintext password in production!');
      }
      isPasswordValid = (password === finalAdminPassword);
    }
    
    // Check if credentials are valid
    if (!isPasswordValid) {
      // Failed login - wrong password
      if (!loginAttempts[clientIP]) {
        loginAttempts[clientIP] = { attempts: 0, lastAttempt: Date.now() };
      }
      loginAttempts[clientIP].attempts++;
      loginAttempts[clientIP].lastAttempt = Date.now();
      
      await logAdminActivity('login_failed', normalizedEmail, { 
        ip: clientIP,
        reason: 'Invalid password',
        attempts: loginAttempts[clientIP].attempts
      });
      
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Successful login
    delete loginAttempts[clientIP];
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        id: 'admin', 
        email: expectedEmail, 
        role: 'admin',
        iat: Math.floor(Date.now() / 1000)
      },
      finalJwtSecret,
      { expiresIn: '24h' }
    );
    
    await logAdminActivity('login_success', normalizedEmail, { ip: clientIP });
    
    return res.json({ 
      success: true, 
      token,
      expiresIn: '24h'
    });
    
  } catch (error) {
    console.error('Login error:', error);
    await logAdminActivity('login_error', req.body?.email || 'unknown', { 
      error: error.message 
    }).catch(() => {});
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ADMIN API ENDPOINTS
app.get('/api/admin/cases', authenticateAdmin, async (req, res) => {
  try {
    const leads = await readLeads();
    
    // Also get asset-reclaim cases
    let assetReclaimCases = [];
    try {
      const assetReclaimsPath = path.join(dataDir, 'asset-reclaims.json');
      const assetReclaimsData = await fs.readFile(assetReclaimsPath, 'utf8');
      const assetReclaims = JSON.parse(assetReclaimsData || '[]');
      assetReclaimCases = assetReclaims.map(c => ({
        id: c.caseId,
        caseId: c.caseId,
        name: c.contactName,
        company: c.company,
        email: c.email,
        phone: c.phone,
        service: 'Asset Reclaim',
        status: c.status || 'new',
        createdAt: c.createdAt,
        updatedAt: c.updatedAt || c.createdAt,
        details: c.details,
        propertyAddress: c.propertyAddress,
        files: c.files || [],
        updates: c.updates || [],
        clientReplies: c.clientReplies || []
      }));
    } catch (error) {
      console.log('Could not read asset-reclaims.json:', error.message);
    }
    
    // Combine both sources
    const allCases = [...leads, ...assetReclaimCases];
    
    // Pagination support
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    
    // Sort support
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder || 'desc'; // 'asc' or 'desc'
    
    // Filter support
    let filteredCases = [...allCases];
    
    // Status filter
    if (req.query.status) {
      filteredCases = filteredCases.filter(c => c.status === req.query.status);
    }
    
    // Date range filter
    if (req.query.startDate) {
      const startDate = new Date(req.query.startDate);
      filteredCases = filteredCases.filter(c => new Date(c.createdAt) >= startDate);
    }
    if (req.query.endDate) {
      const endDate = new Date(req.query.endDate);
      endDate.setHours(23, 59, 59, 999); // Include entire end date
      filteredCases = filteredCases.filter(c => new Date(c.createdAt) <= endDate);
    }
    
    // Search filter
    if (req.query.search) {
      const searchTerm = req.query.search.toLowerCase();
      filteredCases = filteredCases.filter(c => 
        c.id?.toLowerCase().includes(searchTerm) ||
        c.name?.toLowerCase().includes(searchTerm) ||
        c.email?.toLowerCase().includes(searchTerm) ||
        c.service?.toLowerCase().includes(searchTerm)
      );
    }
    
    // Sorting
    filteredCases.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];
      
      // Handle dates
      if (sortBy.includes('date') || sortBy.includes('Date') || sortBy.includes('At')) {
        aValue = new Date(aValue || 0);
        bValue = new Date(bValue || 0);
      }
      
      // Handle strings
      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }
      
      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      }
    });
    
    // Pagination
    const totalCases = filteredCases.length;
    const paginatedCases = filteredCases.slice(startIndex, endIndex);
    
    // Ensure updatedAt field exists
    paginatedCases.forEach(caseItem => {
      if (!caseItem.updatedAt) {
        caseItem.updatedAt = caseItem.createdAt;
      }
    });
    
    res.json({ 
      success: true, 
      cases: paginatedCases,
      pagination: {
        page,
        limit,
        total: totalCases,
        totalPages: Math.ceil(totalCases / limit),
        hasNextPage: endIndex < totalCases,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    if (logError) {
      await logError(error, { endpoint: '/api/admin/cases' }).catch(() => {});
    }
    res.status(500).json({ success: false, error: 'Failed to read cases' });
  }
});

app.get('/api/admin/cases/:caseId', authenticateAdmin, async (req, res) => {
  try {
    const leads = await readLeads();
    let caseData = leads.find(c => c.id === req.params.caseId);
    
    // If not found in leads, check asset-reclaims.json
    if (!caseData) {
      try {
        const assetReclaimsPath = path.join(dataDir, 'asset-reclaims.json');
        const assetReclaimsData = await fs.readFile(assetReclaimsPath, 'utf8');
        const assetReclaims = JSON.parse(assetReclaimsData || '[]');
        const found = assetReclaims.find(c => c.caseId === req.params.caseId);
        if (found) {
          caseData = {
            id: found.caseId,
            caseId: found.caseId,
            name: found.contactName,
            company: found.company,
            email: found.email,
            phone: found.phone,
            service: 'Asset Reclaim',
            status: found.status || 'new',
            createdAt: found.createdAt,
            updatedAt: found.updatedAt || found.createdAt,
            details: found.details,
            propertyAddress: found.propertyAddress,
            files: found.files || [],
            updates: found.updates || [],
            clientReplies: found.clientReplies || []
          };
        }
      } catch (error) {
        console.log('Could not read asset-reclaims.json:', error.message);
      }
    }
    
    if (!caseData) {
      return res.status(404).json({ error: 'Case not found' });
    }
    
    res.json({ success: true, case: caseData });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch case' });
  }
});

// Search endpoint
app.get('/api/admin/cases/search', authenticateAdmin, async (req, res) => {
  try {
    const { query, status, startDate, endDate } = req.query;
    const leads = await readLeads();
    
    // Also get asset-reclaim cases
    let assetReclaimCases = [];
    try {
      const assetReclaimsPath = path.join(dataDir, 'asset-reclaims.json');
      const assetReclaimsData = await fs.readFile(assetReclaimsPath, 'utf8');
      const assetReclaims = JSON.parse(assetReclaimsData || '[]');
      assetReclaimCases = assetReclaims.map(c => ({
        id: c.caseId,
        caseId: c.caseId,
        name: c.contactName,
        company: c.company,
        email: c.email,
        phone: c.phone,
        service: 'Asset Reclaim',
        status: c.status || 'new',
        createdAt: c.createdAt,
        updatedAt: c.updatedAt || c.createdAt,
        details: c.details,
        propertyAddress: c.propertyAddress,
        files: c.files || [],
        updates: c.updates || [],
        clientReplies: c.clientReplies || []
      }));
    } catch (error) {
      console.log('Could not read asset-reclaims.json:', error.message);
    }
    
    let results = [...leads, ...assetReclaimCases];
    
    // Text search
    if (query) {
      const searchTerm = query.toLowerCase();
      results = results.filter(c => 
        c.id?.toLowerCase().includes(searchTerm) ||
        c.caseId?.toLowerCase().includes(searchTerm) ||
        c.name?.toLowerCase().includes(searchTerm) ||
        c.contactName?.toLowerCase().includes(searchTerm) ||
        c.email?.toLowerCase().includes(searchTerm) ||
        c.service?.toLowerCase().includes(searchTerm) ||
        c.message?.toLowerCase().includes(searchTerm) ||
        c.details?.toLowerCase().includes(searchTerm) ||
        c.propertyAddress?.toLowerCase().includes(searchTerm) ||
        c.company?.toLowerCase().includes(searchTerm)
      );
    }
    
    // Status filter
    if (status) {
      results = results.filter(c => c.status === status);
    }
    
    // Date filters
    if (startDate) {
      const start = new Date(startDate);
      results = results.filter(c => new Date(c.createdAt) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      results = results.filter(c => new Date(c.createdAt) <= end);
    }
    
    res.json({ success: true, cases: results, count: results.length });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

// CSV Export endpoint
app.get('/api/admin/cases/export/csv', authenticateAdmin, async (req, res) => {
  try {
    const leads = await readLeads();
    
    // Build CSV header
    const headers = ['Case ID', 'Client Name', 'Email', 'Phone', 'Service', 'Status', 'Created', 'Last Updated'];
    const csvRows = [headers.join(',')];
    
    // Build CSV rows (SECURITY FIX: CSV injection prevention)
    leads.forEach(caseItem => {
      const row = [
        escapeCsvValue(caseItem.id || ''),
        `"${escapeCsvValue(caseItem.name || '')}"`,
        escapeCsvValue(caseItem.email || ''),
        escapeCsvValue(caseItem.phone || ''),
        `"${escapeCsvValue(caseItem.service || '')}"`,
        escapeCsvValue(caseItem.status || ''),
        escapeCsvValue(new Date(caseItem.createdAt).toLocaleDateString()),
        escapeCsvValue(new Date(caseItem.updatedAt || caseItem.createdAt).toLocaleDateString())
      ];
      csvRows.push(row.join(','));
    });
    
    const csvContent = csvRows.join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=cases-export-' + new Date().toISOString().split('T')[0] + '.csv');
    res.send(csvContent);
  } catch (error) {
    res.status(500).json({ success: false, error: 'Export failed' });
  }
});

// Bulk status update
app.put('/api/admin/cases/bulk-update', authenticateAdmin, async (req, res) => {
  try {
    const { caseIds, status, notes } = req.body;
    
    if (!Array.isArray(caseIds) || caseIds.length === 0) {
      return res.status(400).json({ error: 'caseIds array required' });
    }
    
    const leads = await readLeads();
    const updatedCases = [];
    
    caseIds.forEach(caseId => {
      const caseIndex = leads.findIndex(c => c.id === caseId);
      if (caseIndex !== -1) {
        const caseData = leads[caseIndex];
        
        if (status) {
          caseData.status = status;
          caseData.updates = caseData.updates || [];
          caseData.updates.push({
            date: new Date().toISOString(),
            message: notes || `Status changed to ${status}`,
            status: status
          });
        }
        
        caseData.updatedAt = new Date().toISOString();
        updatedCases.push(caseData);
      }
    });
    
    await writeLeads(leads);
    
    res.json({ success: true, updated: updatedCases.length, cases: updatedCases });
  } catch (error) {
    res.status(500).json({ error: 'Bulk update failed' });
  }
});

app.put('/api/admin/cases/:caseId', authenticateAdmin, async (req, res) => {
  try {
    const { caseId } = req.params;
    const { status, updates, notes } = req.body;
    
    // Log case update activity
    await logAdminActivity('case_updated', req.user.email, {
      caseId,
      status: status || null,
      hasNotes: !!notes,
      hasUpdates: !!updates
    });
    
    // Check both leads.json and asset-reclaims.json
    const leads = await readLeads();
    let caseIndex = leads.findIndex(c => c.id === caseId);
    let caseData = caseIndex !== -1 ? leads[caseIndex] : null;
    let isAssetReclaim = false;
    
    // If not found in leads, check asset-reclaims.json
    if (!caseData) {
      try {
        const assetReclaimsPath = path.join(dataDir, 'asset-reclaims.json');
        const assetReclaimsData = await fs.readFile(assetReclaimsPath, 'utf8');
        const assetReclaims = JSON.parse(assetReclaimsData || '[]');
        caseIndex = assetReclaims.findIndex(c => c.caseId === caseId);
        if (caseIndex !== -1) {
          caseData = assetReclaims[caseIndex];
          isAssetReclaim = true;
        }
      } catch (error) {
        console.log('Could not read asset-reclaims.json:', error.message);
      }
    }
    
    if (!caseData) {
      return res.status(404).json({ error: 'Case not found' });
    }
    
    if (status && status !== caseData.status) {
      caseData.status = status;
      caseData.updates = caseData.updates || [];
      caseData.updates.push({
        date: new Date().toISOString(),
        message: `Status changed to ${status}`,
        status: status
      });
    }
    
    if (notes) {
      caseData.notes = caseData.notes || [];
      caseData.notes.push({
        date: new Date().toISOString(),
        message: notes
      });
    }
    
    if (updates && Array.isArray(updates)) {
      caseData.updates = [...(caseData.updates || []), ...updates];
    }
    
    // Update updatedAt timestamp
    caseData.updatedAt = new Date().toISOString();
    
    // Save to the appropriate file
    if (isAssetReclaim) {
      const assetReclaimsPath = path.join(dataDir, 'asset-reclaims.json');
      const assetReclaimsData = await fs.readFile(assetReclaimsPath, 'utf8');
      const assetReclaims = JSON.parse(assetReclaimsData || '[]');
      assetReclaims[caseIndex] = caseData;
      await fs.writeFile(assetReclaimsPath, JSON.stringify(assetReclaims, null, 2));
    } else {
      leads[caseIndex] = caseData;
      await writeLeads(leads);
    }
    
    // Send email notification to client
    if (status) {
      try {
        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 20px; border-radius: 8px 8px 0 0;">
              <h2 style="color: white; margin: 0;">Aesus Asset Reclaim</h2>
            </div>
            <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0;">
              <h2 style="color: #1e40af; margin-top: 0;">Case Update: ${escapeHtml(caseData.id || caseData.caseId)}</h2>
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Your case status has been updated to: <strong style="color: #1e40af;">${escapeHtml(status)}</strong></p>
              ${notes ? `<div style="background: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #1e40af;"><p style="margin: 0; color: #1e40af;"><strong>Notes:</strong> ${escapeHtml(notes)}</p></div>` : ''}
              <a href="${req.protocol}://${req.get('host')}/client-login.html" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; text-decoration: none; border-radius: 5px; font-weight: 600;">View Case Details</a>
            </div>
            <div style="text-align: center; margin-top: 20px; color: #64748b; font-size: 12px;">
              <p>This email was sent from Aesus Asset Reclaim</p>
            </div>
          </div>
        `;
        await sendEmail(caseData.email, `Case Update: ${caseData.id || caseData.caseId}`, emailHtml);
      } catch (emailError) {
        console.error('Failed to send status update email:', emailError.message);
        // Don't fail the entire request if email fails
      }
    }
    
    res.json({ success: true, case: caseData });
  } catch (error) {
    if (logError) {
      await logError(error, { endpoint: '/api/admin/cases/:caseId', caseId: req.params.caseId }).catch(() => {});
    }
    res.status(500).json({ error: 'Failed to update case' });
  }
});

// ADMIN EMAIL - Send custom email to client
app.post('/api/admin/send-email', authenticateAdmin, async (req, res) => {
  try {
    const { to, cc, subject, message, caseId, priority } = req.body;
    
    // SECURITY FIX: Validate required fields and email format
    const missing = validateRequired(['to', 'subject', 'message'], req.body);
    if (missing.length > 0) {
      return res.status(400).json({ success: false, error: `Missing required fields: ${missing.join(', ')}` });
    }
    
    if (!validateEmail(to)) {
      return res.status(400).json({ success: false, error: 'Invalid email address' });
    }
    
    if (cc && !validateEmail(cc)) {
      return res.status(400).json({ success: false, error: 'Invalid CC email address' });
    }
    
    // Validate subject and message lengths
    if (subject.length > 200) {
      return res.status(400).json({ success: false, error: 'Subject too long (max 200 characters)' });
    }
    
    if (message.length > 50000) {
      return res.status(400).json({ success: false, error: 'Message too long (max 50000 characters)' });
    }
    
    // Admin email send request (logged via admin activity logger)
    
    // Determine priority color
    const priorityColors = {
      'urgent': '#dc2626',
      'high': '#ea580c',
      'normal': '#1e40af'
    };
    const priorityColor = priorityColors[priority] || '#1e40af';
    
    // Build email HTML with proper formatting
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="color: white; margin: 0;">Aesus Asset Reclaim</h2>
        </div>
        ${priority && priority !== 'normal' ? `
        <div style="background: ${priorityColor}; color: white; padding: 10px 20px; text-align: center; font-weight: 600;">
          ${priority.toUpperCase()} PRIORITY
        </div>
        ` : ''}
        <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0;">
          <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #1e40af; margin-bottom: 20px;">
            ${escapeHtml(message).replace(/\n/g, '<br>')}
          </div>
          ${caseId ? `
            <div style="margin-top: 20px; padding: 15px; background: #eff6ff; border-radius: 8px;">
              <p style="margin: 0; color: #1e40af;">
                <strong>Reference Case:</strong> ${escapeHtml(caseId)}
              </p>
              <a href="${escapeHtml(req.protocol + '://' + req.get('host') + '/client-login.html')}" style="display: inline-block; margin-top: 10px; padding: 10px 20px; background: #1e40af; color: white; text-decoration: none; border-radius: 5px;">View Case</a>
            </div>
          ` : ''}
        </div>
        <div style="text-align: center; margin-top: 20px; color: #64748b; font-size: 12px;">
          <p>This email was sent from Aesus Asset Reclaim</p>
        </div>
      </div>
    `;
    
    // Use the sendEmail helper function for consistency
    await sendEmail(to, subject, emailHtml, { cc });
    // Email sent successfully (tracked in email history)
    
    // Store email in case history (if caseId provided)
    if (caseId) {
      try {
        const leads = await readLeads();
        const caseIndex = leads.findIndex(c => c.id === caseId);
        if (caseIndex !== -1) {
          const caseData = leads[caseIndex];
          if (!caseData.emailHistory) {
            caseData.emailHistory = [];
          }
          caseData.emailHistory.push({
            date: new Date().toISOString(),
            to,
            cc: cc || null,
            subject,
            sentBy: req.user.email,
            priority: priority || 'normal',
            status: 'sent'
          });
          caseData.updatedAt = new Date().toISOString();
          await writeLeads(leads);
        }
      } catch (error) {
        console.error('Failed to save email history:', error);
      }
    }
    
    res.json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    if (logError) {
      await logError(error, { 
        endpoint: '/api/admin/send-email',
        caseId: req.body.caseId,
        to: req.body.to
      }).catch(() => {});
    }
    console.error('Email send error:', error);
    res.status(500).json({ success: false, error: 'Failed to send email: ' + error.message });
  }
});

// CLIENT LOGIN - Generate magic link
// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

app.post('/api/client/request-login', async (req, res) => {
  try {
    const { email } = req.body;
    
    // Check both leads.json and asset-reclaims.json for cases with this email
    const leads = await readLeads();
    const userCasesFromLeads = leads.filter(l => l.email === email);
    
    // Also check asset-reclaims.json
    let userCasesFromAssetReclaim = [];
    try {
      const assetReclaimsPath = path.join(dataDir, 'asset-reclaims.json');
      const assetReclaimsData = await fs.readFile(assetReclaimsPath, 'utf8');
      const assetReclaims = JSON.parse(assetReclaimsData || '[]');
      userCasesFromAssetReclaim = assetReclaims.filter(c => c.email === email);
    } catch (error) {
      // If asset-reclaims.json doesn't exist or has issues, just continue with leads
      console.log('Could not read asset-reclaims.json:', error.message);
    }
    
    // Combine both sources
    const userCases = [...userCasesFromLeads, ...userCasesFromAssetReclaim];
    
    if (userCases.length === 0) {
      return res.status(404).json({ error: 'No cases found for this email' });
    }
    
    // Generate 6-digit OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
    
    // Store OTP with expiration (ensure OTP is stored as string)
    const otpString = String(otp).trim();
    
    const users = await readUsers();
    // Remove any existing OTPs for this email
    const filteredUsers = users.filter(u => !(u.email === email && u.otp));
    filteredUsers.push({ 
      email, 
      otp: otpString, // Store as string to avoid type mismatch
      otpExpiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString() 
    });
    await writeUsers(filteredUsers);
    
    // Send OTP via email
    try {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb;">
          <div style="background: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <h2 style="color: #1e40af; margin-top: 0;">Your Login Code - Aesus Asset Reclaim</h2>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
              Use this one-time password (OTP) to access your client portal:
            </p>
            <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 24px; border-radius: 12px; text-align: center; margin: 30px 0;">
              <div style="font-size: 14px; opacity: 0.9; margin-bottom: 8px;">Your Code:</div>
              <div style="font-size: 48px; font-weight: bold; letter-spacing: 8px; font-family: 'Courier New', monospace;">${otp}</div>
            </div>
            <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
              This code will expire in <strong>10 minutes</strong> for your security.
            </p>
            <p style="color: #6b7280; font-size: 14px; margin-top: 16px; border-top: 1px solid #e5e7eb; padding-top: 16px;">
              If you didn't request this code, please ignore this email or contact our support team.
            </p>
          </div>
        </div>
      `;
      
      await sendEmail(email, 'Your Aesus Asset Reclaim Login Code', emailHtml);
      // OTP email sent successfully
    } catch (emailError) {
      console.error('Failed to send OTP email:', emailError.message);
      return res.status(500).json({ error: 'Failed to send OTP code. Please try again later.' });
    }
    
    res.json({ 
      success: true, 
      message: 'OTP code sent to your email. Please check your inbox.'
    });
  } catch (error) {
    console.error('Request login error:', error);
    res.status(500).json({ error: 'Failed to send OTP code' });
  }
});


// Verify OTP and create session
app.post('/api/client/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    // SECURITY FIX: Enhanced input validation
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }
    
    if (typeof email !== 'string' || typeof otp !== 'string') {
      return res.status(400).json({ error: 'Invalid input format' });
    }
    
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // Normalize OTP (ensure it's a string, trim whitespace, remove any non-digits)
    const normalizedOtp = String(otp).trim().replace(/[^0-9]/g, '');
    
    if (normalizedOtp.length !== 6) {
      return res.status(400).json({ error: 'OTP must be 6 digits' });
    }
    
    const users = await readUsers();
    const user = users.find(u => {
      const storedOtp = String(u.otp || '').trim();
      return u.email === email && storedOtp === normalizedOtp;
    });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid OTP code. Please check the code and try again.' });
    }
    
    // Check if OTP is expired
    if (user.otpExpiresAt && new Date(user.otpExpiresAt) < new Date()) {
      return res.status(401).json({ error: 'OTP code has expired. Please request a new code.' });
    }
    
    // OTP is valid, create session token
    const sessionToken = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    // Update user with session token, remove OTP
    const userIndex = users.findIndex(u => {
      const storedOtp = String(u.otp || '').trim();
      return u.email === email && storedOtp === normalizedOtp;
    });
    
    if (userIndex !== -1) {
      users[userIndex] = {
        email,
        token: sessionToken,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString()
      };
      await writeUsers(users);
    } else {
      console.error('❌ User not found after verification - this should not happen');
    }
    
    res.json({ success: true, token: sessionToken, message: 'Login successful' });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

app.get('/api/client/cases', async (req, res) => {
  try {
    const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Token required' });
    }
    
    const users = await readUsers();
    const user = users.find(u => u.token === token);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Check if token has expired (24 hours for OTP-based sessions)
    if (user.expiresAt && new Date(user.expiresAt) < new Date()) {
      return res.status(401).json({ error: 'Session expired. Please login again.' });
    }
    
    // Get cases from both leads.json and asset-reclaims.json
    const leads = await readLeads();
    const userCasesFromLeads = leads.filter(l => l.email === user.email);
    
    // Also get asset-reclaim cases
    let userCasesFromAssetReclaim = [];
    try {
      const assetReclaimsPath = path.join(dataDir, 'asset-reclaims.json');
      const assetReclaimsData = await fs.readFile(assetReclaimsPath, 'utf8');
      const assetReclaims = JSON.parse(assetReclaimsData || '[]');
      userCasesFromAssetReclaim = assetReclaims
        .filter(c => c.email === user.email)
        .map(c => ({
          id: c.caseId,
          caseId: c.caseId,
          name: c.contactName,
          company: c.company,
          email: c.email,
          phone: c.phone,
          service: 'Asset Reclaim',
          status: c.status || 'new',
          createdAt: c.createdAt,
          updatedAt: c.updatedAt || c.createdAt,
          details: c.details,
          propertyAddress: c.propertyAddress,
          files: c.files || [],
          updates: c.updates || []
        }));
    } catch (error) {
      console.log('Could not read asset-reclaims.json:', error.message);
    }
    
    // Combine both sources
    const userCases = [...userCasesFromLeads, ...userCasesFromAssetReclaim];
    
    // Ensure updatedAt field exists
    userCases.forEach(caseItem => {
      if (!caseItem.updatedAt) {
        caseItem.updatedAt = caseItem.createdAt;
      }
    });
    
    // Sort by createdAt (most recent first)
    userCases.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0);
      const dateB = new Date(b.createdAt || 0);
      return dateB - dateA;
    });
    
    res.json({ success: true, cases: userCases });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch cases' });
  }
});

// Client message reply endpoint
app.post('/api/client/reply', async (req, res) => {
  try {
    const { token, caseId, message } = req.body;
    
    if (!token || !caseId || !message) {
      return res.status(400).json({ error: 'Token, caseId, and message required' });
    }
    
    const users = await readUsers();
    const user = users.find(u => u.token === token);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Check if session has expired (24 hours for OTP-based sessions)
    if (user.expiresAt && new Date(user.expiresAt) < new Date()) {
      return res.status(401).json({ error: 'Session expired. Please login again.' });
    }
    
    // Check both leads.json and asset-reclaims.json
    const leads = await readLeads();
    let caseIndex = leads.findIndex(c => c.id === caseId && c.email === user.email);
    let caseData = caseIndex !== -1 ? leads[caseIndex] : null;
    let isAssetReclaim = false;
    
    // If not found in leads, check asset-reclaims.json
    if (!caseData) {
      try {
        const assetReclaimsPath = path.join(dataDir, 'asset-reclaims.json');
        const assetReclaimsData = await fs.readFile(assetReclaimsPath, 'utf8');
        const assetReclaims = JSON.parse(assetReclaimsData || '[]');
        caseIndex = assetReclaims.findIndex(c => c.caseId === caseId && c.email === user.email);
        if (caseIndex !== -1) {
          caseData = assetReclaims[caseIndex];
          isAssetReclaim = true;
        }
      } catch (error) {
        console.log('Could not read asset-reclaims.json:', error.message);
      }
    }
    
    if (!caseData) {
      return res.status(404).json({ error: 'Case not found' });
    }
    
    // Add client reply
    if (!caseData.clientReplies) {
      caseData.clientReplies = [];
    }
    
    caseData.clientReplies.push({
      date: new Date().toISOString(),
      message: message.trim().replace(/[<>]/g, ''),
      from: 'client'
    });
    
    caseData.updatedAt = new Date().toISOString();
    
    // Save to the appropriate file
    if (isAssetReclaim) {
      const assetReclaimsPath = path.join(dataDir, 'asset-reclaims.json');
      const assetReclaimsData = await fs.readFile(assetReclaimsPath, 'utf8');
      const assetReclaims = JSON.parse(assetReclaimsData || '[]');
      assetReclaims[caseIndex] = caseData;
      await fs.writeFile(assetReclaimsPath, JSON.stringify(assetReclaims, null, 2));
    } else {
      leads[caseIndex] = caseData;
      await writeLeads(leads);
    }
    
    // Notify admin via email (if configured)
    try {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 20px; border-radius: 8px 8px 0 0;">
            <h2 style="color: white; margin: 0;">Aesus Asset Reclaim</h2>
          </div>
          <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0;">
            <h2 style="color: #1e40af; margin-top: 0;">📬 New Client Reply - Case ${caseId}</h2>
            <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #10b981;">
              <p style="margin: 0 0 10px 0; color: #065f46;"><strong>Client:</strong> ${caseData.name || caseData.contactName || 'N/A'}</p>
              <p style="margin: 0; color: #065f46;"><strong>Email:</strong> ${caseData.email}</p>
            </div>
            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 15px 0;">
              <p style="margin: 0 0 10px 0; color: #1e40af; font-weight: 600;">Message:</p>
              <p style="margin: 0; color: #4b5563; line-height: 1.6;">${message.replace(/\n/g, '<br>')}</p>
            </div>
            <a href="${req.protocol}://${req.get('host')}/admin-dashboard.html" style="display: inline-block; margin-top: 10px; padding: 12px 24px; background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; text-decoration: none; border-radius: 5px; font-weight: 600;">View in Admin Dashboard</a>
          </div>
          <div style="text-align: center; margin-top: 20px; color: #64748b; font-size: 12px;">
            <p>This email was sent from Aesus Asset Reclaim</p>
          </div>
        </div>
      `;
      
      await sendEmail(
        process.env.ADMIN_EMAIL || 'admin@capitalreclaim.com',
        `New Client Reply: ${caseId}`,
        emailHtml
      );
    } catch (emailError) {
      console.error('Failed to send admin notification email:', emailError.message);
      // Don't fail the request if email fails
    }
    
    res.json({ success: true, message: 'Reply sent successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send reply' });
  }
});

// Download all files as ZIP endpoint
app.get('/api/client/cases/:caseId/download-all', async (req, res) => {
  try {
    const { caseId } = req.params;
    const token = req.query.token;
    
    if (!token) {
      return res.status(401).json({ error: 'Token required' });
    }
    
    const users = await readUsers();
    const user = users.find(u => u.token === token);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Check if session has expired (24 hours for OTP-based sessions)
    if (user.expiresAt && new Date(user.expiresAt) < new Date()) {
      return res.status(401).json({ error: 'Session expired. Please login again.' });
    }
    
    const leads = await readLeads();
    const caseData = leads.find(c => c.id === caseId && c.email === user.email);
    
    if (!caseData || !caseData.files || caseData.files.length === 0) {
      return res.status(404).json({ error: 'Case not found or no files available' });
    }
    
    // Return list of download URLs instead of creating ZIP server-side
    // Client can download files individually or use a client-side ZIP library
    const downloadLinks = caseData.files.map(file => ({
      filename: file.originalName || file.filename,
      url: `/api/uploads/${caseId}/${file.filename}`,
      size: file.size
    }));
    
    res.json({ success: true, files: downloadLinks });
  } catch (error) {
    res.status(500).json({ error: 'Failed to prepare download' });
  }
});

// PUBLIC API
app.get('/api/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Server is running', 
    timestamp: new Date().toISOString() 
  });
});

app.post('/api/contact', upload.array('files', 5), async (req, res) => {
  try {
    const { errors, sanitized } = validateContactInput(req.body);
    
    if (errors.length > 0) {
      return res.status(400).json({ 
        success: false, 
        error: errors.join(', ') 
      });
    }

    const caseId = generateCaseId();
    
    let files = [];
    if (req.files && req.files.length > 0) {
      const tempFiles = req.files.map(file => ({
        filename: file.filename,
        originalName: file.originalname,
        size: file.size,
        mimetype: file.mimetype
      }));
      
      files = await moveFilesToCaseFolder(tempFiles, caseId);
    }

    const lead = {
      id: caseId,
      ...sanitized,
      files,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'new',
      updates: [],
      clientReplies: []
    };

    const leads = await readLeads();
    leads.push(lead);
    await writeLeads(leads);

    // Send confirmation email to client
    try {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 20px; border-radius: 8px 8px 0 0;">
            <h2 style="color: white; margin: 0;">Aesus Asset Reclaim</h2>
          </div>
          <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0;">
            <h2 style="color: #1e40af; margin-top: 0;">✅ Case Submitted Successfully</h2>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Your case <strong style="color: #1e40af;">${caseId}</strong> has been received by Aesus Asset Reclaim.</p>
            <div style="background: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
              <p style="margin: 0; color: #065f46;"><strong>⏰ Next Steps:</strong> We will review and contact you within <strong>24 hours</strong>.</p>
            </div>
            <a href="${req.protocol}://${req.get('host')}/client-login.html" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; text-decoration: none; border-radius: 5px; font-weight: 600;">Track Your Case</a>
          </div>
          <div style="text-align: center; margin-top: 20px; color: #64748b; font-size: 12px;">
            <p>This email was sent from Aesus Asset Reclaim</p>
          </div>
        </div>
      `;
      await sendEmail(sanitized.email, `Case Created: ${caseId}`, emailHtml);
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError.message);
      // Don't fail the entire request if email fails
    }

    res.json({ 
      success: true, 
      caseId,
      message: 'Case submitted successfully' 
    });

  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

app.get('/api/case/:caseId', async (req, res) => {
  try {
    const { caseId } = req.params;
    
    if (!caseId.match(/^C-[A-Z0-9]+$/) && !caseId.match(/^AR-[A-Z0-9]+$/)) {
      return res.status(400).json({ error: 'Invalid case ID format' });
    }
    
    const leads = await readLeads();
    const caseData = leads.find(lead => lead.id === caseId);

    if (!caseData) {
      return res.status(404).json({ 
        success: false, 
        error: 'Case not found' 
      });
    }

    res.json({
      success: true,
      case: {
        id: caseData.id,
        status: caseData.status,
        createdAt: caseData.createdAt,
        service: caseData.service,
        updates: caseData.updates || []
      }
    });

  } catch (error) {
    console.error('Get case error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Asset Reclaim route
const crypto = require('crypto');

const tmpUploadDir = path.join(__dirname, 'uploads', 'tmp');
fs.mkdir(tmpUploadDir, { recursive: true }).catch(console.error);

const assetReclaimUpload = multer({
  dest: tmpUploadDir,
  limits: { files: 5, fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg'];
    if (!allowed.includes(file.mimetype)) return cb(new Error('Invalid file type'), false);
    cb(null, true);
  }
});

const generateAssetReclaimCaseId = () => 'AR-' + crypto.randomBytes(6).toString('hex').toUpperCase();

app.post('/api/asset-reclaim', assetReclaimUpload.array('files', 5), async (req, res) => {
  try {
    const { company, contactName, email, phone, amountLost, propertyAddress, details } = req.body;
    
    // Debug logging
    console.log('Asset reclaim form submission:', {
      company,
      contactName,
      email,
      phone,
      amountLost,
      propertyAddress,
      details,
      filesCount: req.files ? req.files.length : 0
    });
    
    if (!company || !contactName || !email || !amountLost || !details) {
      console.error('Missing required fields:', { company: !!company, contactName: !!contactName, email: !!email, amountLost: !!amountLost, details: !!details });
      if (req.files) for (const f of req.files) try { await fs.unlink(f.path); } catch(e){}
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const caseId = generateAssetReclaimCaseId();
    const destDir = path.join(__dirname, 'uploads', 'asset-reclaim', caseId);
    await fs.mkdir(destDir, { recursive: true });

    const savedFiles = [];
    if (req.files && req.files.length) {
      for (const f of req.files) {
        // SECURITY FIX: Better filename sanitization and path validation
        const safeName = path.basename(f.originalname.replace(/[^\w.-]/g, '_'));
        if (!safeName || safeName.length > 255) {
          throw new Error('Invalid filename');
        }
        const dest = path.join(destDir, safeName);
        
        // Verify destination is within destDir (prevent path traversal)
        if (!path.resolve(dest).startsWith(path.resolve(destDir))) {
          throw new Error('Invalid destination path');
        }
        await fs.rename(f.path, dest);
        savedFiles.push({ filename: safeName, mimetype: f.mimetype, size: f.size });
      }
    }

    const casesPath = path.join(dataDir, 'asset-reclaims.json');
    let existing = [];
    try {
      const raw = await fs.readFile(casesPath, 'utf8');
      existing = JSON.parse(raw || '[]');
    } catch (e) { existing = []; }

    const record = {
      caseId,
      company,
      contactName,
      email,
      phone,
      amountLost,
      propertyAddress,
      details,
      files: savedFiles,
      createdAt: new Date().toISOString(),
      status: 'new',
      updates: []
    };

    existing.push(record);
    await fs.writeFile(casesPath, JSON.stringify(existing, null, 2));

    // Send confirmation email to client
    try {
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb;">
          <div style="background: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <h2 style="color: #1e40af; margin-top: 0;">Asset Reclaim Case Submitted</h2>
            <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
              Thank you for submitting your asset reclaim case. We have received your information and will begin reviewing your case within 24 hours.
            </p>
            <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); color: white; padding: 24px; border-radius: 12px; text-align: center; margin: 30px 0;">
              <div style="font-size: 14px; opacity: 0.9; margin-bottom: 8px;">Your Case ID:</div>
              <div style="font-size: 32px; font-weight: bold; letter-spacing: 4px; font-family: 'Courier New', monospace;">${caseId}</div>
            </div>
            <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #1e40af; margin-top: 0;">Case Details:</h3>
              <p style="color: #4b5563; margin: 8px 0;"><strong>Company:</strong> ${escapeHtml(company)}</p>
              <p style="color: #4b5563; margin: 8px 0;"><strong>Contact Name:</strong> ${escapeHtml(contactName)}</p>
              ${propertyAddress ? `<p style="color: #4b5563; margin: 8px 0;"><strong>Property Address:</strong> ${escapeHtml(propertyAddress)}</p>` : ''}
            </div>
            <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">
              You'll receive a detailed assessment with recovery probability and next steps via email within 24 hours.
            </p>
            <p style="color: #6b7280; font-size: 14px; margin-top: 16px; border-top: 1px solid #e5e7eb; padding-top: 16px;">
              You can access your case and track updates by logging into the <a href="${req.protocol}://${req.get('host')}/client-login.html" style="color: #1e40af; text-decoration: none;">Client Portal</a> using this email address.
            </p>
          </div>
        </div>
      `;
      
      await sendEmail(email, `Asset Reclaim Case Created: ${caseId}`, emailHtml);
      console.log('Confirmation email sent for asset reclaim case:', caseId);
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError.message);
      // Don't fail the request if email fails
    }

    console.log('Asset reclaim case created successfully:', caseId);
    res.json({ ok: true, caseId });
  } catch (err) {
    console.error('asset-reclaim error', err);
    console.error('asset-reclaim error stack:', err.stack);
    if (req.files) {
      for (const f of req.files) {
        try { await fs.unlink(f.path); } catch (e) {}
      }
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Error tracking and logging (with graceful fallback)
let logError, getErrorStats, cleanOldErrorLogs, cleanOldAdminActivityLogs, ensureAdminActivityLogDir, scheduleDailyCleanup;
let errorHandler = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large' });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files' });
    }
  }
  console.error('Unhandled error:', err);
  if (logError) {
    logError(err, { method: req.method, path: req.path, ip: req.ip }).catch(() => {});
  }
  res.status(err.status || 500).json({ error: 'Something went wrong' });
};

try {
  const errorHandlerModule = require('./error-handler');
  logError = errorHandlerModule.logError;
  getErrorStats = errorHandlerModule.getErrorStats;
  cleanOldErrorLogs = errorHandlerModule.cleanOldErrorLogs;
  cleanOldAdminActivityLogs = errorHandlerModule.cleanOldAdminActivityLogs;
  ensureAdminActivityLogDir = errorHandlerModule.ensureAdminActivityLogDir;

  // Initialize admin activity log directory
  if (ensureAdminActivityLogDir) {
    ensureAdminActivityLogDir().catch(() => {});
  }
  
  // Clean old error logs on startup
  cleanOldErrorLogs().catch(err => console.warn('Error log cleanup warning:', err));
  // Clean old admin activity logs on startup
  if (cleanOldAdminActivityLogs) {
    cleanOldAdminActivityLogs().catch(err => console.warn('Admin activity log cleanup warning:', err));
  }
  
  // Schedule daily cleanup (24h)
  setInterval(() => {
    try { cleanOldErrorLogs().catch(() => {}); } catch (_) {}
    try { cleanOldAdminActivityLogs && cleanOldAdminActivityLogs().catch(() => {}); } catch (_) {}
  }, 24 * 60 * 60 * 1000);

  // Initialize data retention daily cleanup
  try {
    const retention = require('./data-retention');
    scheduleDailyCleanup = retention.scheduleDailyCleanup;
    const retentionDays = parseInt(process.env.DATA_RETENTION_DAYS);
    if (scheduleDailyCleanup) {
      if (Number.isFinite(retentionDays)) {
        scheduleDailyCleanup(retentionDays);
      } else {
        scheduleDailyCleanup();
      }
    }
  } catch (e) {
    console.warn('ℹ️  Data retention scheduler not available:', e.message);
  }
  console.log('✅ Error tracking system initialized');
} catch (error) {
  console.warn('⚠️  Error handler module not available, using basic error logging');
  logError = async (err, ctx) => console.error('Error:', err.message || err, ctx);
  getErrorStats = async () => ({ total: 0, byType: {}, byDay: {}, recent: [] });
  cleanOldErrorLogs = async () => 0;
}

// Error statistics endpoint (admin only) - Must be before other admin routes to catch it
app.get('/api/admin/errors/stats', authenticateAdmin, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const stats = await getErrorStats(days);
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error stats endpoint error:', error);
    if (logError) {
      await logError(error, { endpoint: '/api/admin/errors/stats' }).catch(() => {});
    }
    res.status(500).json({ success: false, error: 'Failed to get error stats' });
  }
});

// Global error handler middleware (must be before 404 handler)
app.use(errorHandler);

// 404 handler for HTML pages (after all API routes)
app.use((req, res) => {
  // Only handle non-API routes with HTML response
  if (!req.path.startsWith('/api') && req.accepts('html')) {
    const indexPath = path.join(__dirname, '..', '404.html');
    const fs = require('fs');
    if (fs.existsSync(indexPath)) {
      return res.status(404).sendFile(indexPath);
    }
  }
  // JSON response for API routes or JSON requests
  res.status(404).json({ error: 'Not found' });
});

const startServer = async () => {
  await initDirectories();
  
  if (httpsEnabled && httpsServer) {
    // Start HTTPS server
    httpsServer.listen(PORT, () => {
      const isProduction = process.env.NODE_ENV === 'production';
      if (!isProduction) {
        console.log('🔒 Aesus Asset Reclaim HTTPS server running on https://localhost:' + PORT);
        console.log('✅ Health check: https://localhost:' + PORT + '/api/health');
        console.log('⚠️  Browser will show security warning (self-signed cert) - click "Advanced" → "Proceed"');
      } else {
        console.log('🔒 Aesus Asset Reclaim HTTPS server running on port ' + PORT);
      }
      console.log('🔒 Security features: Enabled');
    });
    
    // Also start HTTP server on port 3001 as fallback (for browsers that reject self-signed certs)
    const httpPort = 3001;
    app.listen(httpPort, () => {
      if (process.env.NODE_ENV !== 'production') {
        console.log('🚀 HTTP fallback server running on http://localhost:' + httpPort);
        console.log('💡 Use http://localhost:' + httpPort + ' if HTTPS gives connection issues');
      }
    });
  } else {
    app.listen(PORT, () => {
      if (process.env.NODE_ENV !== 'production') {
        console.log('🚀 Aesus Asset Reclaim HTTP server running on http://localhost:' + PORT);
        console.log('✅ Health check: http://localhost:' + PORT + '/api/health');
        console.log('⚠️  Running without HTTPS (for production, use SSL)');
      } else {
        console.log('🚀 Aesus Asset Reclaim server running on port ' + PORT);
      }
      console.log('🔒 Security features: Enabled');
    });
  }
};

startServer().catch(console.error);

