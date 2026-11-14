# MedRelief (Campus Edition)
### Pure Non-Profit Campus Medicine Donation & Redistribution Platform
**Built with Native HTML5, CSS3, and Modern JavaScript (ES6+ Modules)**

> **Institutional Notice:** MedRelief is a pure non-profit extension activity operating exclusively within university grounds. **NO MEDICINES ARE SOLD OR MONETIZED.** All surplus medicine is verified by licensed campus pharmacists and distributed 100% free of charge to accredited partner NGOs for charitable patient care.

---

## 🌟 Modern Typography & Brand Palette

- **Primary Font:** **Plus Jakarta Sans** (Google Fonts) - Clean, academic, high-legibility health-tech typography.
- **Monospace Font:** **JetBrains Mono** - High-precision rendering for Batch IDs, Expiry Dates, and Tracking Codes.
- **Primary Teal:** `#007380` (Headings, primary action buttons, active tab indicators)
- **Accent Leaf Green:** `#6EB56F` (Verified checkmarks, clinical approval badges, environmental tags)
- **Background Fill:** `#F9FAFB` (Clean, off-white card backgrounds)
- **Neutral Dark Text:** `#1F2937` / `#4B5563` (High-contrast, clinical text)
- **Timeline & Card Tint:** `#E1F1F8` (Milestone progress steppers, alert callouts)

---

## 📱 Fully Responsive Design

- **Mobile First & Fluid:** Responsive grid and flexbox layout adapting seamlessly from 320px mobile screens to 4K displays.
- **Adaptive Navigation:** Clean top navigation on desktop, transforming into a smooth slide-out hamburger menu on mobile devices.
- **Touch-Friendly Controls:** Sized touch targets, responsive HTML5 digital signature pad, and mobile-friendly camera viewfinder.
- **Responsive Tables & Modals:** Horizontal smooth-scrolling data tables and centered modal dialogs with native backdrops.

---

## 🚀 Key Modules & Capabilities

1. **Student / Donor Hub (`#tab-student`)**:
   - Registration inputs: **Full Name**, **Roll Number**, **Division**, **Phone**, **Email**.
   - **In-Browser Web Camera OCR**: Integrated Tesseract.js utilizing HTML5 `navigator.mediaDevices.getUserMedia` to read medicine brand, generic active ingredient, batch number, and expiry date. Includes sample blister presets for hardware-free testing.
   - Designated campus drop-box selection (Health Center, Pharmacy Foyer, Hostel C, SAC).
   - Dynamic **Visual Milestone Status Timeline** (Requested ➔ Collected ➔ Pharmacist Verified ➔ NGO Handover Completed) with real-time SMS & Email receipts.

2. **Campus Drop-Box Collector Hub (`#tab-collector`)**:
   - Retrieval queue of uncollected packages across campus hostels and dispensaries.
   - Volunteer Collector ID verification.
   - Single & batch pickup actions transitioning packages to `COLLECTED` and routing to pharmacy audit.

3. **Pharmacist Clinical Audit Desk (`#tab-pharmacist`)**:
   - Authorized Pharmacist: Dr. S. K. Mehta (Reg #MH-PH-88231).
   - Inspection criteria: Intact blister seal check, packaging condition, and 60-day shelf-life threshold verification.
   - Single & batch approval to `PHARMACIST_VERIFIED`.
   - Rejection modal requiring mandatory reason logging (broken seal, expiry issue) with automatic routing to the Campus Biomedical Waste Incinerator.

4. **Partner NGO Distribution & Proof Portal (`#tab-ngo`)**:
   - Live inventory view of 100% verified, non-monetized stock.
   - Non-commercial claim cart for registered NGOs (Red Cross Campus Wing, Seva Health Trust, etc.).
   - Mandatory delivery proof: Physical handover photo upload + HTML5 Canvas Digital Signature pad.
   - Finalizes status to `NGO_HANDOVER_COMPLETED`.

5. **Admin "God View" & Central Audit Vault (`#tab-admin`)**:
   - High-level environmental impact telemetry: Total Waste Diverted (kg and strips), Clinical Audit Rate, NGO Claims count, and Active Donors.
   - **Central Handover Proofs & Signatures Vault**: View all uploaded delivery proof photos and representative digital signatures.
   - **Notification Audit Log**: Chronological audit trail of automated student SMS & Email alerts.
   - **Supabase Cloud Schema Manager**: Built-in viewer and copy tool for PostgreSQL migrations.

6. **Automated Milestone Alerts**:
   - Slide-out student notification drawer showing simulated Twilio SMS & Resend Email webhooks.
   - Live toast notifications popping up on screen as any donation progresses through the milestones.

---

## 📂 File Architecture

```
d:\medrelife\
├── index.html            # Main HTML5 application shell & view templates
├── css/
│   └── style.css         # Responsive academic health-tech stylesheet with Plus Jakarta Sans
├── js/
│   ├── app.js            # Main application controller, tab switching, and modal interactions
│   ├── store.js          # Reactive data store with localStorage persistence & seed data
│   └── ocr.js            # In-browser Tesseract.js OCR engine & camera capture
├── manifest.json         # PWA Web App Manifest
├── sw.js                 # PWA Service Worker for offline shell caching
├── supabase/
│   └── schema.sql        # Supabase PostgreSQL database schema, RLS policies, and triggers
└── README.md             # Project documentation
```

---

## 🏃‍♂️ How to Run

Because this project is built entirely with pure, standard HTML, CSS, and JavaScript, you can run it instantly using any static file server or your preferred development server:

### Option 1: Python Simple HTTP Server
```bash
python -m http.server 3000
```
Then visit **http://localhost:3000**.

### Option 2: Node.js `npx serve` or `npx live-server`
```bash
npx serve .
```

### Option 3: VS Code / IDE Live Server
Right-click `index.html` and select **"Open with Live Server"**.
