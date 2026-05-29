# 30-Day SEO Sprint Plan — Just Enjoy Ibiza

**Owner**: Alin Letca (alin.letca2010@gmail.com)
**Created**: 24 May 2026 (updated end of session 1)
**Capacity**: Aggressive — 1-2 hours/day for 30 days

---

## 🏛️ Brand architecture (LOCKED IN)

**Model**: Hub-and-spoke umbrella brand. ONE company, TWO service lines, each with their own address/phone/site.

```
                  JUST ENJOY IBIZA (Company — one legal entity)
                              │
                              ▼
                    justenjoyibiza.com (MASTER HUB)
                    "Beautiful experiences in Ibiza"
                    ┌──────────────┐  ┌──────────────┐
                    │   BOATS →    │  │   TOURS →    │
                    └──────┬───────┘  └──────┬───────┘
                           ▼                  ▼
            justenjoyibizaboats.com    justenjoyibizatours.com
            (own address, phone,         (own address, phone,
             GBP, analytics)              GBP, analytics)
            ✅ LIVE — main work here    ❌ TO BUILD (Phase 5)
```

### Important strategic decisions
- **Don't merge boats + tours into one domain.** Different services, different audiences, different addresses justify separate sites.
- **Master site is NOT a thin redirect.** It's a polished landing page introducing both services.
- **Each spoke has its own SEO authority.** They share corporate identity via Schema `parentOrganization` markup, not via merging.
- **Phase 5 (tours site)** is for off-season — focus on boats site through summer.

---

## 📦 Technical setup (already configured for boats site)

### Sites & domains
- **Master hub**: justenjoyibiza.com (umbrella brand — needs Phase 1 work too)
- **Boats spoke**: justenjoyibizaboats.com (✅ everything configured)
- **Tours spoke**: justenjoyibizatours.com or similar (to be registered + built — Phase 5)
- **GitHub repo (boats)**: github.com/justenjoyibiza/OnlyBoats
- **Deploy via**: Netlify (publish directory = `public/`)
- **CMS (boats)**: Pages CMS (app.pagescms.org)

### Boats site NAP
- **Name**: Just Enjoy Ibiza Boats
- **Address**: Passeig Joan Carles I, 5, 07800 Ibiza, Islas Baleares, Spain
- **Phone**: +34 642 45 39 52
- **Email**: info@justenjoyibizaboats.com
- **Instagram**: @justenjoyibiza_boats_tours
- **WhatsApp**: wa.me/34642453952

### Tours site NAP (TODO — collect this info)
- **Name**: Just Enjoy Ibiza Tours (or whatever you decide)
- **Address**: ??? (different from boats)
- **Phone**: ??? (different from boats)
- **Email**: ???

### Tracking & APIs
- **Google Analytics (master)**: G-QCKDTQ7T5R
- **Google Analytics (boats)**: G-JRDCG93F2Z
- **Google Analytics (tours)**: TBD when tours site exists
- **Google Place ID (boats)**: ChIJp-s7_opHmRIRLUwDDFs9B8E
- **Google Places API Key**: AIzaSyC_u_1CmkNC_XZtB1sauSVp3_rNY42pb5A
- **IndexNow Key**: d25a34feadd24a58ba4fc3ec6a266f7a
- **IndexNow verification file**: /public/d25a34feadd24a58ba4fc3ec6a266f7a.txt

### Search Console accounts
- **Bing Webmaster Tools**: bing.com/webmasters (justenjoyibizaboats.com verified ✅)
- **Google Search Console**: NOT YET set up — Phase 1E

### Automation in place (boats site)
- GitHub Action: `.github/workflows/indexnow.yml` (pings IndexNow on every commit + daily at 6 UTC)
- Netlify Function: `/netlify/functions/google-reviews.js` (fetches Google reviews server-side)
- Pages CMS: edits boats via `app.pagescms.org` → commits to GitHub → Netlify auto-deploys

---

## ✅ Already shipped (today, 24 May 2026)

- Migrated boats from Firebase to Pages CMS (15 boats, 6-month pricing structure)
- Custom Google Reviews widget on homepage with Schema.org JSON-LD
- Google Analytics tracking on all pages
- Fixed pre-existing `getTotalLength` JS error in custom.js
- IndexNow set up on Bing + automated via GitHub Action
- Sitemap submitted to Bing
- 6 URLs manually submitted via Bing URL Submission
- First URL indexed by Bing in same session (rare speed!)
- Validated by Google Rich Results Test (10 valid items: 2 LocalBusiness + 2 Organization + 6 Reviews)
- yacht-rental.html: clean meta description (139 chars) + single H1 ("Boat & Yacht Charter in Ibiza")

---

# 🚀 The 30-Day Plan

## PHASE 1 — Entity Setup (Week 1, ~4 hours total)

Tells AI/Google: "These are related entities (parent + spoke), not random sites."

### 1A — Rename Google Business Profile (5 min, START HERE)
1. Go to **business.google.com** → log in
2. Select profile (currently "Just Enjoy Ibiza")
3. Edit profile → Business name → change to **"Just Enjoy Ibiza Boats"**
4. Save
5. ⚠️ Google may require re-verification.

### 1B — Add `parentOrganization` schema to boats site (15 min)
On every page of justenjoyibizaboats.com, the LocalBusiness JSON-LD should include:

```json
"parentOrganization": {
  "@type": "Organization",
  "@id": "https://justenjoyibiza.com/#organization",
  "name": "Just Enjoy Ibiza",
  "url": "https://justenjoyibiza.com",
  "logo": "https://justenjoyibiza.com/assets/img/logo.png"
}
```

### 1C — Add `subOrganization` schema to master site (15 min)
On justenjoyibiza.com, the Organization JSON-LD should list its specialty businesses:

```json
"subOrganization": [
  {
    "@type": "LocalBusiness",
    "@id": "https://justenjoyibizaboats.com/#business",
    "name": "Just Enjoy Ibiza Boats",
    "url": "https://justenjoyibizaboats.com"
  }
]
```

(Add tours site later when it exists.)

### 1D — Cross-link properly between domains (10 min)
- On master (justenjoyibiza.com): clear navigation to "Boats →" and (later) "Tours →"
- On boats (justenjoyibizaboats.com): footer link "Part of [Just Enjoy Ibiza](https://justenjoyibiza.com)"
- On boats: small "back to main brand" link in nav

### 1E — Set up Google Search Console for both domains (30 min)
1. Go to search.google.com/search-console
2. Add property: **justenjoyibizaboats.com** (verify via HTML file or DNS)
3. Add property: **justenjoyibiza.com** (verify same way)
4. Submit sitemaps for both
5. Set up email alerts

### 1F — Audit homepage of master site (justenjoyibiza.com) (1 hour)
The master site has issues:
- Multiple H1 tags ("Arrive as Clients, Leave as Friends" + "Experience Ibiza Differently")
- Probably missing/old meta description
- Probably no Google Analytics yet (or only G-QCKDTQ7T5R)
- Probably no Google Reviews widget
- Probably no schema.org markup with subOrganization

Fix all these.

### 1G — Standardize boats site NAP everywhere (30 min)
- Audit all directory listings, social media bios, partner sites
- Make sure boats address/phone is IDENTICAL everywhere
- Don't worry about tours yet — that comes in Phase 5

### 1H — Add `hreflang` if you'll add languages later (optional, 10 min)
If you plan to translate to Spanish, German, French — add `<link rel="alternate" hreflang>` tags now.

---

## PHASE 2 — Marina + Location Pages on BOATS site (Week 2, ~6 hours)

Each page targets ONE high-intent keyword.

### Pages to build on justenjoyibizaboats.com:
1. `/marina-botafoch-boat-charter`
2. `/marina-ibiza-magna-yacht-rental`
3. `/cala-bassa-boat-trip`
4. `/cala-comte-boat-rental`
5. `/es-vedra-boat-tour`
6. `/formentera-day-trip-boat`
7. `/sunset-cruise-ibiza`
8. `/private-yacht-charter-ibiza`

Template per page:
- ~600-800 words original copy
- 3-5 photos
- Schema markup (TouristAttraction or Service)
- Internal link to /yacht-rental
- CTA: inquiry form
- Mobile-responsive

---

## PHASE 2.5 — Boat Detail Pages (Week 2, ~3 hours)

Rebuild boat-details.html as dynamic pages reading from boats.json. One template → 15+ pages.

Each page:
- Boat name as H1
- Full specs (length, guests, year, engine, features)
- 5-10 boat photos (use Pages CMS)
- Pricing table (all 6 months)
- Boat-specific reviews if available
- Map showing typical itineraries
- Inquiry form pre-filled with boat name

---

## PHASE 3 — Blog Content Sprint on BOATS site (Week 3, ~10 hours)

5-8 articles targeting long-tail searches:
1. "Best 5 beaches in Ibiza accessible only by boat"
2. "Complete guide to chartering a yacht in Ibiza 2026"
3. "Ibiza vs Mallorca: which is better for a boat trip?"
4. "How much does a yacht charter in Ibiza cost? Full price breakdown"
5. "Sunset cruise Ibiza: the ultimate evening on the water"
6. "5 hidden coves in Ibiza only locals know about"
7. "Family-friendly boat charter in Ibiza: what to bring"
8. "Bachelor/bachelorette party on a yacht in Ibiza"

Each article: 1000-1500 words, original, photos, Article schema, internal links to boat + location pages.

---

## PHASE 4 — Directory Citations + Backlinks for BOATS (Week 4, ~5 hours)

Priority directories:
- ⭐ Tripadvisor → Things to do → Boat tours
- ⭐ Click&Boat
- ⭐ Nautal
- ⭐ GetMyBoat
- ⭐ Yelp Ibiza
- Ibiza Spotlight business directory
- Ibiza Tourism Board
- White Ibiza directory
- Local hotel partners (5-10 outreach)

Press outreach:
- 3 Ibiza travel bloggers (free 2-hr charter for feature)
- Pitch to Ibiza Spotlight, IbizaPreservation magazines

---

## PHASE 5 — Build justenjoyibizatours.com (Off-season project, ~40 hours)

When boats season slows down (Oct-Nov), build the tours site.

### Pre-work:
- Register domain (justenjoyibizatours.com or similar)
- Decide on tours brand name (Just Enjoy Ibiza Tours? Just Enjoy Ibiza Island Tours?)
- Get the different address + phone confirmed

### Build:
- Same Netlify + Pages CMS stack (proven to work)
- Same architecture: tours.json + dynamic rendering
- Tour types: half-day, full-day, multi-day
- Tour pages: one per popular route (north Ibiza, south Ibiza, full island)
- Same Google Reviews widget (different Place ID for tours GBP)
- Google Analytics property (separate)
- Bing IndexNow + GitHub Action (separate key)
- Submit to all the same directories

### Schema:
- Same `parentOrganization` pattern pointing to justenjoyibiza.com
- Master site adds tours to its `subOrganization` list

---

## 📊 Tracking progress

### Weekly review checklist:
- [ ] Bing Webmaster Tools: indexed URL count growing for boats?
- [ ] Google Search Console: impressions growing?
- [ ] Google Analytics: traffic trending up?
- [ ] Google Business Profile: views/searches growing?
- [ ] Reviews count: new ones coming in?

### Monthly review (end of 30 days):
- Number of indexed URLs in Bing: target 50+ for boats site
- Number of indexed URLs in Google: target 50+
- Branded search volume for "Just Enjoy Ibiza Boats"
- Ranking for top 5 keywords (use Ahrefs Webmaster Tools — free)
- Inquiry form submissions in last 30 days

---

## 🎯 Tomorrow's starting point

**Do this FIRST when you sit down:**

1. Go to business.google.com
2. Rename profile from "Just Enjoy Ibiza" to "Just Enjoy Ibiza Boats"
3. Save
4. Open Claude, paste this whole document, and say "Ready for Phase 1B"

That single rename action starts merging entity signals. The rest of Phase 1 (1B-1H) takes ~3-4 hours and Claude will guide you.

---

## 🆘 If something breaks

- **CMS not loading edits?** → check Netlify Deploys tab for failed builds
- **Boats page blank?** → check `/content/boats.json` in public/ folder
- **Reviews widget broken?** → check Netlify env variable `GOOGLE_PLACES_API_KEY` is set
- **404 errors in Bing?** → wait 24-48h after IndexNow ping
- **Anything else?** → paste this whole doc into Claude with your question

---

*Last updated: 24 May 2026 (end of session 1) — Architecture decision: hub-and-spoke with master justenjoyibiza.com + specialty spokes for boats (live) and tours (Phase 5)*
