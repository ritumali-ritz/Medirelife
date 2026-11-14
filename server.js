/**
 * MedRelief - Node.js Backend Server
 * Pure Non-Profit Campus Medicine Donation & Redistribution Platform
 */

import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import multer from "multer";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase Cloud Client Setup
const SUPABASE_URL = process.env.SUPABASE_URL || "https://dhkitaftpuqewfarqmeh.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_GSOmTCARbGjCz_Z2Sfxm8Q_FGaYJYI4";
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Static directory serving
app.use(express.static(__dirname));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Multer Storage Configuration for Photos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const isProof = req.baseUrl?.includes("ngo") || req.path?.includes("proof");
    const dir = isProof
      ? path.join(__dirname, "uploads", "proofs")
      : path.join(__dirname, "uploads", "prescriptions");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    const uniqueName = `med_${Date.now()}_${Math.random().toString(36).substr(2, 6)}${ext}`;
    cb(null, uniqueName);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ==============================================================================
// IN-MEMORY / FILE-PERSISTED DATABASE
// ==============================================================================
const DB_FILE = path.join(__dirname, "data", "database.json");

function loadDb() {
  if (fs.existsSync(DB_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    } catch {
      // fallback
    }
  }
  return initDefaultDb();
}

function saveDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save database:", err);
  }
}

function initDefaultDb() {
  const initial = {
    students: [],
    donations: [],
    timelines: [],
    claims: [],
    feedback: [],
    ngos: [
      {
        id: "ngo-1",
        name: "Red Cross Mobile Health Wing",
        specialty: ["Paracetamol", "Pain Relief", "First Aid", "Antibiotics", "General"],
        contact: "+91 94220 18832",
        address: "Community Relief Center, Pune",
        focus: "Mobile Health Camps & Emergency Outreach",
      },
      {
        id: "ngo-2",
        name: "Seva Rural Health Mission",
        specialty: ["Metformin", "Diabetes", "Hypertension", "Cardio", "Antibiotics"],
        contact: "+91 98810 55421",
        address: "Rural Outreach Center, Mulshi & Maval",
        focus: "Chronic Disease Care for Underprivileged Senior Citizens",
      },
      {
        id: "ngo-3",
        name: "Samarpan Elderly Foundation",
        specialty: ["Allergy", "Cetirizine", "Antacid", "Pantoprazole", "Vitamins"],
        contact: "+91 98230 44901",
        address: "Senior Citizen Care & Free Daily Geriatric Dispensary",
        focus: "Senior Citizen Care & Free Daily Geriatric Dispensary",
      },
      {
        id: "ngo-4",
        name: "Jan Swasthya Camp Network",
        specialty: ["Gastro", "Omeprazole", "Antibiotics", "Pediatric", "Fever"],
        contact: "+91 97650 33812",
        address: "Urban Slum Preventive Health Unit",
        focus: "Primary Preventive Healthcare & Free Camps",
      },
    ],
    drop_points: [
      {
        id: "dp-1",
        name: "Campus Central Library Foyer",
        building: "Central Library Building, Ground Floor",
        hours: "08:00 AM - 08:00 PM",
      },
      {
        id: "dp-2",
        name: "Student Health Center Lobby",
        building: "Health & Wellness Pavilion",
        hours: "09:00 AM - 05:00 PM",
      },
      {
        id: "dp-3",
        name: "Main Academic Block A Foyer",
        building: "Academic Complex, North Wing",
        hours: "08:30 AM - 06:30 PM",
      },
      {
        id: "dp-4",
        name: "Student Hostel Complex Hub",
        building: "Residential Quadrangle Gate 2",
        hours: "24 Hours Accessible",
      },
    ],
  };

  saveDb(initial);
  return initial;
}

let db = loadDb();

// ==============================================================================
// NODEMAILER EMAIL SERVICE
// ==============================================================================
let emailTransporter = null;

try {
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    emailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else {
    // Development local logger / test account
    emailTransporter = {
      sendMail: async (options) => {
        console.log("--------------------------------------------------");
        console.log(`📧 [EMAIL DISPATCHED via MedRelief Node Mailer Service]`);
        console.log(`To: ${options.to}`);
        console.log(`Subject: ${options.subject}`);
        console.log(`Preview: ${options.text || options.html?.replace(/<[^>]+>/g, " ").slice(0, 160)}`);
        console.log("--------------------------------------------------");
        return { messageId: `msg_${Date.now()}` };
      },
    };
  }
} catch (e) {
  console.warn("Mail transport initialization note:", e.message);
}

async function sendNotificationEmail({ to, subject, htmlText, studentName }) {
  if (!to) return;
  const wrappedHtml = `
    <div style="font-family: 'Plus Jakarta Sans', system-ui, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 14px; overflow: hidden;">
      <div style="background-color: #007380; color: #FFFFFF; padding: 22px; text-align: center;">
        <h2 style="margin: 0; font-size: 22px;">MedRelief</h2>
        <p style="margin: 4px 0 0; font-size: 12px; color: #E1F1F8;">Pure Non-Profit Campus &amp; Community Medicine Redistribution</p>
      </div>
      <div style="padding: 24px; color: #1F2937; line-height: 1.6; font-size: 14px;">
        <p>Dear <strong>${studentName || "Campus Donor"}</strong>,</p>
        ${htmlText}
        <div style="margin-top: 24px; padding: 14px; background-color: #f0f8f0; border: 1px solid #6EB56F; border-radius: 8px; font-size: 12px; color: #3b753c;">
          <strong>🌱 Environmental Impact:</strong> Thank you for participating in zero medical waste diversion with MedRelief!
        </div>
      </div>
      <div style="background-color: #F9FAFB; padding: 14px; text-align: center; font-size: 11px; color: #6B7280; border-top: 1px solid #E5E7EB;">
        MedRelief is a pure non-profit college initiative. No medicines are sold or monetized.
      </div>
    </div>
  `;

  try {
    await emailTransporter.sendMail({
      from: '"MedRelief Campus" <notifications@medrelief.campus.edu>',
      to,
      subject,
      html: wrappedHtml,
    });
  } catch (err) {
    console.warn("Email dispatch error:", err.message);
  }
}

// ==============================================================================
// AUTHENTICATION ENDPOINTS
// ==============================================================================
app.post("/api/auth/register", (req, res) => {
  const { full_name, roll_number, division, phone, email, password, role } = req.body;
  if (!full_name || !roll_number || !email) {
    return res.status(400).json({ success: false, error: "Missing required fields." });
  }

  const existing = db.students.find((s) => s.roll_number === roll_number || s.email === email);
  if (existing) {
    return res.status(400).json({ success: false, error: "Student roll number or email is already registered." });
  }

  const newStudent = {
    id: `stu-${Date.now()}`,
    full_name,
    roll_number,
    division: division || "MCA Year 1",
    phone: phone || "+91 90000 00000",
    email,
    password: password || "password123",
    role: role || "STUDENT",
    created_at: new Date().toISOString(),
  };

  db.students.unshift(newStudent);
  saveDb(db);

  // Send Welcome Email
  sendNotificationEmail({
    to: newStudent.email,
    studentName: newStudent.full_name,
    subject: "Welcome to MedRelief Campus Initiative!",
    htmlText: `
      <p>Your donor registration at <strong>MedRelief Campus Redistribution Network</strong> is confirmed.</p>
      <p>You can now pledge surplus medicines using our In-Browser Camera OCR or manual entry, and drop them at designated campus smart boxes.</p>
      <p><strong>Your Roll Number:</strong> ${newStudent.roll_number}<br><strong>Division:</strong> ${newStudent.division}</p>
    `,
  });

  res.json({ success: true, student: newStudent });
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  const user = db.students.find(
    (s) =>
      (s.email?.toLowerCase() === username?.toLowerCase() ||
        s.roll_number?.toLowerCase() === username?.toLowerCase()) &&
      (!s.password || s.password === password)
  );

  if (!user) {
    return res.status(401).json({ success: false, error: "Invalid roll number, email, or password." });
  }

  res.json({ success: true, user });
});

app.get("/api/auth/students", (req, res) => {
  res.json({ success: true, students: db.students });
});

// ==============================================================================
// SMART NGO SUGGESTION ENGINE
// ==============================================================================
app.get("/api/ngo/suggest", (req, res) => {
  const query = (req.query.drug || req.query.generic || "").toLowerCase();
  const allNgos = db.ngos || [];

  let matches = allNgos.map((ngo) => {
    let score = 0;
    ngo.specialty.forEach((spec) => {
      if (query.includes(spec.toLowerCase()) || spec.toLowerCase().includes(query)) {
        score += 10;
      }
    });
    return { ...ngo, matchScore: score };
  });

  matches.sort((a, b) => b.matchScore - a.matchScore);
  const bestMatch = matches[0] || allNgos[0];

  res.json({
    success: true,
    suggestedNgo: bestMatch.name,
    allSuggestions: matches.slice(0, 3),
  });
});

// ==============================================================================
// DONATIONS ENDPOINTS
// ==============================================================================
app.get("/api/donations", (req, res) => {
  const donationsWithMeta = db.donations.map((d) => ({
    ...d,
    student: db.students.find((s) => s.id === d.student_id),
    timelines: db.timelines.filter((t) => t.donation_id === d.id),
  }));
  res.json({ success: true, donations: donationsWithMeta });
});

app.post("/api/donations", (req, res) => {
  const {
    student_id,
    drug_name,
    brand_name,
    quantity_strips,
    expiry_date,
    drop_off_point,
    photo_url,
    ocr_raw_text,
    suggested_ngo,
  } = req.body;

  if (!drug_name || !expiry_date || !quantity_strips) {
    return res.status(400).json({ success: false, error: "Missing required medicine details." });
  }

  const newDonation = {
    id: `don-${Date.now().toString().slice(-4)}`,
    student_id: student_id || "stu-1",
    drug_name,
    brand_name: brand_name || null,
    quantity_strips: Number(quantity_strips),
    expiry_date,
    drop_off_point: drop_off_point || "Campus Central Library Foyer",
    photo_url: photo_url || "assets/images/story-hope-1.jpg",
    ocr_raw_text: ocr_raw_text || null,
    status: "REQUESTED",
    suggested_ngo: suggested_ngo || "Red Cross Mobile Health Wing",
    seal_condition: "SEALED_INTACT",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  db.donations.unshift(newDonation);

  // Create initial timeline event
  const student = db.students.find((s) => s.id === newDonation.student_id);
  const timeEvent = {
    id: `time-${Date.now()}`,
    donation_id: newDonation.id,
    status: "REQUESTED",
    message: `Surplus medicine drop-off pledged at ${newDonation.drop_off_point}. Awaiting campus pickup.`,
    created_at: new Date().toISOString(),
  };
  db.timelines.unshift(timeEvent);
  saveDb(db);

  // Send Confirmation Email
  if (student?.email) {
    sendNotificationEmail({
      to: student.email,
      studentName: student.full_name,
      subject: `MedRelief: Donation Confirmation (${newDonation.brand_name || newDonation.drug_name})`,
      htmlText: `
        <p>Thank you for registering your surplus medication pledge!</p>
        <div style="background: #E1F1F8; padding: 14px; border-radius: 8px; margin: 12px 0;">
          <p><strong>Medicine:</strong> ${newDonation.brand_name || newDonation.drug_name}</p>
          <p><strong>Quantity:</strong> ${newDonation.quantity_strips} strip(s)</p>
          <p><strong>Expiry Date:</strong> ${newDonation.expiry_date}</p>
          <p><strong>Campus Drop-Off Point:</strong> ${newDonation.drop_off_point}</p>
          <p><strong>Target Matching NGO:</strong> ${newDonation.suggested_ngo}</p>
        </div>
        <p>Our volunteer team will retrieve your parcel from the smart drop-box soon.</p>
      `,
    });
  }

  res.json({ success: true, donation: newDonation });
});

app.patch("/api/donations/:id/status", (req, res) => {
  const { id } = req.params;
  const { status, collector_id, pharmacist_notes, rejection_reason, photo_url } = req.body;

  const itemIndex = db.donations.findIndex((d) => d.id === id);
  if (itemIndex === -1) {
    return res.status(404).json({ success: false, error: "Donation record not found." });
  }

  const item = db.donations[itemIndex];
  item.status = status;
  item.updated_at = new Date().toISOString();
  if (collector_id) item.collector_id = collector_id;
  if (pharmacist_notes) item.pharmacist_notes = pharmacist_notes;
  if (rejection_reason) item.rejection_reason = rejection_reason;
  if (photo_url) item.photo_url = photo_url;

  // Add timeline entry
  let msg = `Donation updated to ${status}`;
  if (status === "COLLECTED") {
    msg = `Package retrieved from ${item.drop_off_point} by Campus Collector Crew. In transit to Pharmacy Audit Desk.`;
  } else if (status === "PHARMACIST_VERIFIED") {
    msg = `Inspected & Approved by Licensed Pharmacist Dr. S. K. Mehta. Seals intact, expiry safe. Added to non-profit pool.`;
  } else if (status === "REJECTED") {
    msg = `Audited by Pharmacist: Flagged for campus biomedical waste disposal. Reason: ${rejection_reason || "Safety seal breach"}`;
  } else if (status === "NGO_HANDOVER_COMPLETED") {
    msg = `Handed over to verified partner NGO for free charitable distribution. Handover photo proof logged.`;
  }

  const timeEvent = {
    id: `time-${Date.now()}`,
    donation_id: id,
    status,
    message: msg,
    created_at: new Date().toISOString(),
  };
  db.timelines.unshift(timeEvent);
  saveDb(db);

  // Send Notification Email
  const student = db.students.find((s) => s.id === item.student_id);
  if (student?.email) {
    sendNotificationEmail({
      to: student.email,
      studentName: student.full_name,
      subject: `MedRelief Milestone: ${status} (${item.brand_name || item.drug_name})`,
      htmlText: `
        <p>Your donated medicine milestone status has progressed:</p>
        <p style="font-size: 16px; font-weight: bold; color: #007380;">${status.replace(/_/g, " ")}</p>
        <p>${msg}</p>
      `,
    });
  }

  res.json({ success: true, donation: item, timeline: timeEvent });
});

// Upload Blister / Handover Photo
app.post("/api/upload", upload.single("photo"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No image file provided." });
  }
  const isProof = req.path.includes("proof");
  const folder = isProof ? "proofs" : "prescriptions";
  const publicPath = `/uploads/${folder}/${req.file.filename}`;
  res.json({ success: true, url: publicPath });
});

// ==============================================================================
// NGO CLAIMS ENDPOINTS
// ==============================================================================
app.get("/api/ngo/claims", (req, res) => {
  res.json({ success: true, claims: db.claims });
});

app.post("/api/ngo/claims", (req, res) => {
  const { ngo_name, representative, proof_photo_url, signature_url, notes, donation_ids } = req.body;
  if (!ngo_name || !representative || !donation_ids || donation_ids.length === 0) {
    return res.status(400).json({ success: false, error: "Missing required claim fields." });
  }

  const newClaim = {
    id: `claim-${Date.now().toString().slice(-4)}`,
    ngo_name,
    representative,
    proof_photo_url: proof_photo_url || "assets/images/story-hope-1.jpg",
    signature_url: signature_url || null,
    notes: notes || "Free rural camp",
    claimed_at: new Date().toISOString(),
    status: "HANDOVER_COMPLETED",
  };

  db.claims.unshift(newClaim);

  // Update claimed donations
  donation_ids.forEach((donId) => {
    const item = db.donations.find((d) => d.id === donId);
    if (item) {
      item.status = "NGO_HANDOVER_COMPLETED";
      item.updated_at = new Date().toISOString();

      const timeEvent = {
        id: `time-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        donation_id: donId,
        status: "NGO_HANDOVER_COMPLETED",
        message: `Handed over to ${ngo_name} for free patient care. Verified handover photo proof logged.`,
        created_at: new Date().toISOString(),
      };
      db.timelines.unshift(timeEvent);

      // Email student donor
      const student = db.students.find((s) => s.id === item.student_id);
      if (student?.email) {
        sendNotificationEmail({
          to: student.email,
          studentName: student.full_name,
          subject: `MedRelief Impact Complete: Distributed to ${ngo_name}!`,
          htmlText: `
            <p>Your surplus medicine (<strong>${item.brand_name || item.drug_name}</strong>) has successfully reached patients in need through <strong>${ngo_name}</strong>.</p>
            <p>Thank you for supporting zero medical waste with MedRelief!</p>
          `,
        });
      }
    }
  });

  saveDb(db);
  res.json({ success: true, claim: newClaim });
});

// ==============================================================================
// FEEDBACK SYSTEM (DYNAMIC)
// ==============================================================================
app.get("/api/feedback", (req, res) => {
  res.json({ success: true, feedback: db.feedback });
});

app.post("/api/feedback", (req, res) => {
  const { name, roll_number, email, rating, category, message } = req.body;
  if (!name || !message) {
    return res.status(400).json({ success: false, error: "Name and message are required." });
  }

  const newFeedback = {
    id: `fb-${Date.now()}`,
    name,
    roll_number: roll_number || "Campus Visitor",
    email: email || "donor@campus.edu",
    rating: Number(rating) || 5,
    category: category || "General Experience",
    message,
    created_at: new Date().toISOString(),
  };

  db.feedback.unshift(newFeedback);
  saveDb(db);
  res.json({ success: true, feedback: newFeedback });
});

// ==============================================================================
// ADMIN METRICS & REPORT EXPORT
// ==============================================================================
app.get("/api/admin/metrics", (req, res) => {
  const totalStrips = db.donations.reduce((acc, d) => acc + Number(d.quantity_strips || 1), 0);
  const totalKg = ((totalStrips * 35) / 1000).toFixed(2);
  const verified = db.donations.filter((d) => d.status === "PHARMACIST_VERIFIED").length;
  const rejected = db.donations.filter((d) => d.status === "REJECTED").length;
  const distributed = db.donations.filter((d) => d.status === "NGO_HANDOVER_COMPLETED").length;

  res.json({
    success: true,
    totalStrips,
    totalKg,
    verifiedCount: verified,
    rejectedCount: rejected,
    distributedCount: distributed,
    totalStudents: db.students.length,
    totalClaims: db.claims.length,
    totalFeedback: db.feedback.length,
  });
});

app.get("/api/admin/report", (req, res) => {
  const totalStrips = db.donations.reduce((acc, d) => acc + Number(d.quantity_strips || 1), 0);
  const totalKg = ((totalStrips * 35) / 1000).toFixed(2);

  const report = {
    generated_at: new Date().toISOString(),
    institution: "MedRelief Non-Profit Redistribution Initiative",
    project: "MedRelief - Pure Non-Profit Medicine Redistribution",
    environmental_summary: {
      total_strips_diverted: totalStrips,
      total_kg_medical_waste_diverted: totalKg,
      total_donors_enrolled: db.students.length,
      total_ngo_handover_dispatches: db.claims.length,
    },
    donations_registry: db.donations.map((d) => ({
      id: d.id,
      medicine: d.brand_name || d.drug_name,
      generic_formula: d.drug_name,
      strips: d.quantity_strips,
      expiry: d.expiry_date,
      status: d.status,
      drop_box: d.drop_off_point,
      donor_roll: db.students.find((s) => s.id === d.student_id)?.roll_number || "Unknown",
    })),
    claims_registry: db.claims,
    feedback_summary: db.feedback,
  };

  res.json({ success: true, report });
});

// Admin direct photo and timeline upload
app.post("/api/admin/update-timeline-photo", (req, res) => {
  const { donation_id, photo_url, milestone_status, message } = req.body;
  const item = db.donations.find((d) => d.id === donation_id);
  if (!item) {
    return res.status(404).json({ success: false, error: "Donation not found." });
  }

  if (photo_url) item.photo_url = photo_url;
  if (milestone_status) item.status = milestone_status;
  item.updated_at = new Date().toISOString();

  const timeEvent = {
    id: `time-${Date.now()}`,
    donation_id,
    status: milestone_status || item.status,
    message: message || "Photo proof and custody timeline updated by Administrator.",
    created_at: new Date().toISOString(),
  };

  db.timelines.unshift(timeEvent);
  saveDb(db);
  res.json({ success: true, donation: item, timeline: timeEvent });
});

// SPA fallback for /admin and /
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Endpoint not found" });
  }
  res.sendFile(path.join(__dirname, "index.html"));
});

// Start Server
app.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(`🏥 MedRelief - Node.js Backend Server`);
  console.log(`🌱 Pure Non-Profit Medicine Redistribution`);
  console.log(`🚀 Running at: http://localhost:${PORT}`);
  console.log(`🛡️ Admin Portal at: http://localhost:${PORT}/admin`);
  console.log(`================================================================`);
});

