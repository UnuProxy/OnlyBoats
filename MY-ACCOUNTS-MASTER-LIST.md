# 🗂️ Just Enjoy Ibiza — Master Accounts List

**Owner:** Alin Letca · **Email:** alin.letca2010@gmail.com
**Last updated:** 25 May 2026

---

## 🌐 LIVE WEBSITES

| Site | URL |
|---|---|
| Boats site (live) | https://justenjoyibizaboats.com |
| Master brand site | https://justenjoyibiza.com |
| CRM (internal tool) | Lives on Netlify — your private dashboard URL |

---

## 💻 CODE & HOSTING

### GitHub (source code — the "master copy" of everything)
- **URL:** https://github.com
- **Login:** Your GitHub account
- **Repos:**
  - `justenjoyibiza/OnlyBoats` → code for justenjoyibizaboats.com
  - `justenjoyibiza/JustEnjoyIbiza.CRM` → code for the CRM
- **What it does:** Every file change you make commits here. Netlify watches this and auto-deploys.

### Netlify (hosting + auto-deploy + forms + serverless functions)
- **URL:** https://app.netlify.com
- **Login:** Sign in with GitHub
- **What it does:**
  - Hosts both websites (pulls from GitHub on every commit)
  - Runs the Netlify Functions (`send-email`, `google-reviews`, `daily-reminders`)
  - Stores environment variables (API keys — NEVER put these in code)
- **Env vars stored here:** `RESEND_API_KEY`, `SUPABASE_URL`, `SUPABASE_KEY`, `CALLMEBOT_PHONE`, Google Places API key
- **Sites:** Boats site + CRM site

---

## ✍️ CONTENT EDITING

### Pages CMS (edit boats without touching code)
- **URL:** https://app.pagescms.org
- **Login:** Sign in with GitHub
- **What it does:** Friendly editor for `boats.json` — change prices, add/remove boats, toggle Published, upload photos
- **Photo location it writes to:** `public/assets/img/` in the OnlyBoats repo

### Squoosh (image compression — use BEFORE uploading photos)
- **URL:** https://squoosh.app
- **Login:** No login needed
- **Settings to use:** Resize to 1600px width, MozJPEG quality 75
- **Why:** Photos straight from camera are too big, will fail upload and slow the site

---

## 📊 ANALYTICS & SEO

### Google Analytics 4 (traffic — who visits, when, from where)
- **URL:** https://analytics.google.com
- **Login:** Your Google account (alin.letca2010@gmail.com)
- **Property ID:** G-JRDCG93F2Z
- **What it shows:** Visitor count, what pages they view, how long they stay, where they came from

### Google Search Console (how Google sees your site)
- **URL:** https://search.google.com/search-console
- **Login:** Your Google account
- **What it shows:** Which Google searches lead to your site, ranking position, indexing errors

### Bing Webmaster Tools (Bing + ChatGPT + AI assistants use Bing's index)
- **URL:** https://www.bing.com/webmasters
- **Login:** Microsoft account
- **What it does:** Submit sitemap, see Bing ranking, SEO report card
- **IndexNow key:** `d25a34feadd24a58ba4fc3ec6a266f7a` (already auto-pinged via GitHub Action)

### Google Cloud Console (for Google Reviews widget on homepage)
- **URL:** https://console.cloud.google.com
- **Login:** Your Google account
- **What it does:** Holds the Places API key that powers your reviews widget
- **API enabled:** Places API
- **Place ID for Just Enjoy Ibiza Boats:** (stored in Netlify function)

---

## ✉️ EMAIL & MESSAGING

### Resend (transactional emails — the engine behind CRM emails)
- **URL:** https://resend.com
- **Login:** Your account
- **What it does:** Sends emails from `info@justenjoyibiza.com` (signature emails, contracts) on behalf of the CRM
- **API key:** Stored in Netlify env vars as `RESEND_API_KEY`

### Usebasin (powers the inquiry forms on the website)
- **URL:** https://usebasin.com
- **Login:** Your account
- **What it does:** Catches inquiry form submissions and emails them to you
- **Form endpoint:** `https://usebasin.com/f/d0b5557a2cc1`

### WhatsApp Business
- **Number:** +34 642 45 39 52
- **Used in:** CRM email signatures, the floating WhatsApp button on the site

---

## 🗄️ DATABASE

### Supabase (backend for the CRM)
- **URL:** https://supabase.com
- **Login:** Your account
- **What it does:** Stores all CRM data — clients, bookings, contracts, history
- **Credentials:** Stored in Netlify env vars as `SUPABASE_URL` and `SUPABASE_KEY`

---

## 🌍 DOMAINS

### Domain registrar (where you bought the .com names)
- **URL:** Check your billing — likely GoDaddy, Namecheap, or wherever you registered
- **Domains owned:**
  - `justenjoyibiza.com`
  - `justenjoyibizaboats.com`
  - `justenjoyibizatours.com` (if registered — future site)
- **DNS pointing to:** Netlify

---

## 🧠 QUICK MENTAL MODEL

```
You edit boats in Pages CMS
        ↓
Pages CMS commits to GitHub
        ↓
GitHub triggers Netlify
        ↓
Netlify rebuilds + deploys
        ↓
Live site updates in ~60 seconds
```

```
Customer fills inquiry form
        ↓
Usebasin catches it
        ↓
Email arrives in your inbox
        ↓
You add to CRM
        ↓
CRM sends contract via Resend
        ↓
Customer receives email
```

```
Google/Bing crawl your site
        ↓
GA4 + Search Console + Bing Tools show stats
        ↓
You see which pages perform
```

---

## 🚨 IF SOMETHING BREAKS — TROUBLESHOOTING ORDER

1. **Site is down** → Check Netlify dashboard for deploy errors
2. **CMS not saving** → Check Pages CMS, then check GitHub repo for recent commits
3. **Photos missing** → Check `public/assets/img/` in GitHub
4. **Form not sending** → Check Usebasin dashboard for spam blocking
5. **CRM email fails** → Check Resend dashboard for rejected sends
6. **Traffic dropped** → Check Google Search Console for indexing errors

---

## 📌 PIN THESE 6 TABS

In Chrome, right-click each → "Pin tab" so you never lose them:

1. https://github.com/justenjoyibiza
2. https://app.netlify.com
3. https://app.pagescms.org
4. https://analytics.google.com
5. https://www.bing.com/webmasters
6. https://resend.com (or whichever you use most that day)
