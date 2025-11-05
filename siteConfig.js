// siteConfig.js
// Aesus Asset Reclaim Website Configuration
// Developed by Little Einstein Studios 🇬🇧

// Browser-compatible version (no ES6 modules)
var siteConfig = {
  developer: {
    studio: "Little Einstein Studios",
    website: "https://littleeinsteinstudios.com",
    credits:
      "Designed and developed by Little Einstein Studios — Bringing brands to life through design, animation, and technology."
  },

  company: {
    name: "Aesus Asset Reclaim",
    tagline: "Recovering what's rightfully yours",
    slogan: "Asset Recovery & Financial Investigations",
    description:
      "Aesus Asset Reclaim is a UK-based professional asset recovery and financial investigation company. We specialise in locating and reclaiming lost, unclaimed, or misappropriated assets for individuals, families, and organisations across the United Kingdom.",
    industry: "Asset Recovery & Investigations",
    keyStats: {
      assetsRecovered: "£2.5M+",
      successCases: "1,200+",
      successRate: "98%",
      averageResponse: "Within 24 hours"
    },
    cta: {
      primaryText: "Submit Your Case",
      primaryLink: "/submit-case",
      secondaryText: "Track Existing Case",
      secondaryLink: "/track-case"
    },
    location: "United Kingdom",
    email: "contact@aesusinvestigators.com",
    phone: "+44 20 7946 0275"
  },

  contact: {
    email: "contact@aesusinvestigators.com",
    phone: "+44 20 7946 0275",
    officeHours: "Mon–Fri, 9am–6pm (GMT)",
    form: {
      title: "Send Us a Message",
      fields: [
        "Full Name",
        "Email Address",
        "Phone Number",
        "Case Type",
        "Message"
      ],
      submitText: "Submit Enquiry",
      successMessage:
        "Thank you for contacting Aesus Asset Reclaim. A licensed investigator will respond within 24 hours."
    },
    socials: {
      facebook: "https://facebook.com/aesusassetreclaim",
      linkedin: "https://linkedin.com/company/aesusassetreclaim",
      twitter: "https://twitter.com/aesusinvest"
    }
  },

  footer: {
    text: "© 2025 Aesus Asset Reclaim. All rights reserved.",
    builtBy:
      "Website crafted with precision and passion by Little Einstein Studios."
  }
};

// Helper function to apply config to the page
function applySiteConfig() {
  if (typeof siteConfig === 'undefined') return;
  
  // Update page title if it contains the company name
  if (document.title && document.title.includes('Aesus')) {
    document.title = document.title.replace(/Aesus Asset Reclaim/g, siteConfig.company.name);
  }
  
  // Update company name throughout the page
  const companyNameElements = document.querySelectorAll('[data-company-name]');
  companyNameElements.forEach(el => {
    el.textContent = siteConfig.company.name;
  });
  
  // Update tagline
  const taglineElements = document.querySelectorAll('[data-tagline]');
  taglineElements.forEach(el => {
    el.textContent = siteConfig.company.tagline;
  });
  
  // Update slogan
  const sloganElements = document.querySelectorAll('[data-slogan]');
  sloganElements.forEach(el => {
    el.textContent = siteConfig.company.slogan;
  });
  
  // Update stats
  const statsElements = document.querySelectorAll('[data-stat]');
  statsElements.forEach(el => {
    const statType = el.getAttribute('data-stat');
    if (siteConfig.company.keyStats[statType]) {
      el.textContent = siteConfig.company.keyStats[statType];
    }
  });
  
  // Update contact info
  const emailElements = document.querySelectorAll('[data-email]');
  emailElements.forEach(el => {
    if (el.tagName === 'A') {
      el.href = 'mailto:' + siteConfig.contact.email;
      el.textContent = siteConfig.contact.email;
    } else {
      el.textContent = siteConfig.contact.email;
    }
  });
  
  const phoneElements = document.querySelectorAll('[data-phone]');
  phoneElements.forEach(el => {
    if (el.tagName === 'A') {
      el.href = 'tel:' + siteConfig.contact.phone.replace(/\s/g, '');
      el.textContent = siteConfig.contact.phone;
    } else {
      el.textContent = siteConfig.contact.phone;
    }
  });
  
  // Update footer
  const footerText = document.querySelector('[data-footer-text]');
  if (footerText) {
    footerText.textContent = siteConfig.footer.text;
  }
  
  // Update current year
  const yearElements = document.querySelectorAll('[data-current-year]');
  const currentYear = new Date().getFullYear();
  yearElements.forEach(el => {
    el.textContent = currentYear;
  });
}

// Auto-apply when DOM is ready - wrapped in try-catch to prevent errors
(function() {
  try {
    function loadUIScript(){
      try{
        var s=document.createElement('script');
        s.src='ui.js';
        s.defer=true;
        document.head.appendChild(s);
      }catch(e){}
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function(){
        applySiteConfig();
        loadUIScript();
      });
    } else {
      // DOM already loaded
      setTimeout(function(){
        applySiteConfig();
        loadUIScript();
      }, 0);
    }
  } catch (error) {
    console.warn('siteConfig: Error applying config', error);
  }
})();
