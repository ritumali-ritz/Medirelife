/**
 * MedRelief - Reactive Data Store
 * Pure Non-Profit Campus Medicine Donation & Redistribution Platform
 */

const STORAGE_KEYS = {
  DONATIONS: "medrelief_donations_clean",
  STUDENTS: "medrelief_students_clean",
  TIMELINES: "medrelief_timelines_clean",
  CLAIMS: "medrelief_claims_clean",
  NOTIFICATIONS: "medrelief_notifications_clean",
  SETTINGS: "medrelief_settings_clean",
  DROP_BOXES: "medrelief_dropboxes",
};

export const INITIAL_STUDENTS = [];
export const INITIAL_DONATIONS = [];
export const INITIAL_TIMELINES = [];
export const INITIAL_NGO_CLAIMS = [];

export const CAMPUS_DROP_OFF_POINTS = [
  {
    id: "loc-1",
    name: "Campus Central Library Foyer",
    building: "Central Library Building, Ground Floor",
    hours: "08:00 AM - 08:00 PM",
  },
  {
    id: "loc-2",
    name: "Student Health Center Lobby",
    building: "Health & Wellness Pavilion",
    hours: "09:00 AM - 05:00 PM",
  },
  {
    id: "loc-3",
    name: "Main Academic Block A Foyer",
    building: "Academic Complex, North Wing",
    hours: "08:30 AM - 06:30 PM",
  },
  {
    id: "loc-4",
    name: "Student Hostel Complex Hub",
    building: "Residential Quadrangle Gate 2",
    hours: "24 Hours Accessible",
  },
];

// Helper functions for Local Storage
function getFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(fallback));
      return fallback;
    }
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveToStorage(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent("medrelief:store_updated", { detail: { key } }));
  } catch (err) {
    console.error("Storage error:", err);
  }
}

export const MedReliefStore = {
  getStudents() {
    return getFromStorage(STORAGE_KEYS.STUDENTS, INITIAL_STUDENTS);
  },

  getStudentById(id) {
    const students = this.getStudents();
    return students.find((s) => s.id === id) || null;
  },

  createStudent(student) {
    const students = this.getStudents();
    const existingIndex = students.findIndex((s) => s.roll_number === student.roll_number);
    if (existingIndex >= 0) {
      students[existingIndex] = { ...students[existingIndex], ...student };
      saveToStorage(STORAGE_KEYS.STUDENTS, students);
      return students[existingIndex];
    }
    const newStudent = {
      ...student,
      id: `stu-${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    students.unshift(newStudent);
    saveToStorage(STORAGE_KEYS.STUDENTS, students);
    return newStudent;
  },

  getDonations() {
    const donations = getFromStorage(STORAGE_KEYS.DONATIONS, INITIAL_DONATIONS);
    const students = this.getStudents();
    return donations.map((d) => ({
      ...d,
      student: students.find((s) => s.id === d.student_id) || null,
    }));
  },

  getDonationById(id) {
    return this.getDonations().find((d) => d.id === id);
  },

  createDonation(data) {
    const donations = getFromStorage(STORAGE_KEYS.DONATIONS, INITIAL_DONATIONS);
    const newDonation = {
      ...data,
      id: `don-${Date.now().toString().slice(-4)}`,
      status: data.status || "REQUESTED",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    donations.unshift(newDonation);
    saveToStorage(STORAGE_KEYS.DONATIONS, donations);

    // Auto create timeline milestone
    const student = this.getStudentById(newDonation.student_id);
    this.addTimeline({
      donation_id: newDonation.id,
      status: "REQUESTED",
      message: `Surplus medicine drop-off registered at ${newDonation.drop_off_point}. Awaiting campus pickup.`,
      sms_sent: true,
      email_sent: true,
      sms_details: {
        recipient_phone: student?.phone || "+91 90000 00000",
        preview: `MedRelief: Your pledge for ${newDonation.brand_name || newDonation.drug_name} (${newDonation.quantity_strips} strips) was registered! Drop at ${newDonation.drop_off_point}.`,
        timestamp: new Date().toISOString(),
      },
      email_details: {
        recipient_email: student?.email || "student@campus.edu",
        subject: `MedRelief - Donation Confirmation: ${newDonation.brand_name || newDonation.drug_name}`,
        preview: `Thank you for contributing to campus circular medicine redistribution. Tracking ID: ${newDonation.id}.`,
        timestamp: new Date().toISOString(),
      },
    });

    return newDonation;
  },

  updateDonationStatus(id, newStatus, meta = {}) {
    const donations = getFromStorage(STORAGE_KEYS.DONATIONS, INITIAL_DONATIONS);
    let target = null;
    const updated = donations.map((d) => {
      if (d.id === id) {
        target = {
          ...d,
          status: newStatus,
          updated_at: new Date().toISOString(),
          ...(meta.collector_id && { collector_id: meta.collector_id, collected_at: new Date().toISOString() }),
          ...(meta.pharmacist_notes && { pharmacist_notes: meta.pharmacist_notes, verified_at: new Date().toISOString() }),
          ...(meta.rejection_reason && { rejection_reason: meta.rejection_reason, verified_at: new Date().toISOString() }),
          ...(meta.seal_condition && { seal_condition: meta.seal_condition }),
        };
        return target;
      }
      return d;
    });

    saveToStorage(STORAGE_KEYS.DONATIONS, updated);

    if (target) {
      let msg = `Donation updated to ${newStatus}`;
      if (newStatus === "COLLECTED") {
        msg = `Package retrieved from ${target.drop_off_point || "drop-box"} by Campus Collector Crew. In transit to Pharmacy Audit Desk.`;
      } else if (newStatus === "PHARMACIST_VERIFIED") {
        msg = `Inspected & Approved by Licensed Pharmacist Dr. S. K. Mehta. Seals intact, expiry safe. Added to non-profit pool.`;
      } else if (newStatus === "REJECTED") {
        msg = `Audited by Pharmacist: Package flagged for campus medical waste disposal. Reason: ${meta.rejection_reason || "Safety check failed"}`;
      } else if (newStatus === "NGO_HANDOVER_COMPLETED") {
        msg = `Handed over to verified partner NGO for free charitable distribution. Handover photo proof and digital signature logged.`;
      }

      const student = this.getStudentById(target.student_id);
      this.addTimeline({
        donation_id: id,
        status: newStatus,
        message: msg,
        sms_sent: true,
        email_sent: true,
        sms_details: {
          recipient_phone: student?.phone || "+91 90000 00000",
          preview: `MedRelief Update: Your medicine (${target.brand_name || target.drug_name}) is now [${newStatus}].`,
          timestamp: new Date().toISOString(),
        },
        email_details: {
          recipient_email: student?.email || "student@campus.edu",
          subject: `MedRelief Milestone: ${newStatus} (${target.brand_name || target.drug_name})`,
          preview: msg,
          timestamp: new Date().toISOString(),
        },
      });
    }

    return target;
  },

  getTimelines(donationId) {
    const timelines = getFromStorage(STORAGE_KEYS.TIMELINES, INITIAL_TIMELINES);
    if (donationId) {
      return timelines
        .filter((t) => t.donation_id === donationId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    return timelines.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },

  addTimeline(entry) {
    const timelines = getFromStorage(STORAGE_KEYS.TIMELINES, INITIAL_TIMELINES);
    const newEntry = {
      ...entry,
      id: `time-${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    timelines.unshift(newEntry);
    saveToStorage(STORAGE_KEYS.TIMELINES, timelines);

    window.dispatchEvent(
      new CustomEvent("medrelief:student_notification", {
        detail: newEntry,
      })
    );

    return newEntry;
  },

  getNgoClaims() {
    return getFromStorage(STORAGE_KEYS.CLAIMS, INITIAL_NGO_CLAIMS);
  },

  createNgoClaim(data) {
    const claims = getFromStorage(STORAGE_KEYS.CLAIMS, INITIAL_NGO_CLAIMS);
    const newClaim = {
      ...data,
      id: `claim-${Date.now().toString().slice(-4)}`,
      claimed_at: new Date().toISOString(),
      status: "HANDOVER_COMPLETED",
    };
    claims.unshift(newClaim);
    saveToStorage(STORAGE_KEYS.CLAIMS, claims);

    if (Array.isArray(data.items)) {
      data.items.forEach((donationId) => {
        this.updateDonationStatus(donationId, "NGO_HANDOVER_COMPLETED", {
          claim_id: newClaim.id,
          ngo_name: data.ngo_name,
        });
      });
    }

    return newClaim;
  },

  getNotificationCount() {
    return this.getTimelines().length;
  },

  getSettings() {
    return getFromStorage(STORAGE_KEYS.SETTINGS, {
      sms_simulation_enabled: true,
      email_simulation_enabled: true,
      realtime_stream_active: true,
      tesseract_worker_status: "READY",
      pharmacist_audit_threshold_days: 60,
    });
  },

  updateSettings(newSettings) {
    saveToStorage(STORAGE_KEYS.SETTINGS, newSettings);
    return newSettings;
  },

  getDropBoxes() {
    return getFromStorage(STORAGE_KEYS.DROP_BOXES, CAMPUS_DROP_OFF_POINTS);
  },

  saveDropBoxes(boxes) {
    saveToStorage(STORAGE_KEYS.DROP_BOXES, boxes);
    return boxes;
  },

  addDropBox(box) {
    const boxes = this.getDropBoxes();
    const newBox = { ...box, id: `loc-${Date.now()}` };
    boxes.push(newBox);
    saveToStorage(STORAGE_KEYS.DROP_BOXES, boxes);
    return newBox;
  },

  updateDropBox(id, updates) {
    const boxes = this.getDropBoxes();
    const idx = boxes.findIndex((b) => b.id === id);
    if (idx >= 0) {
      boxes[idx] = { ...boxes[idx], ...updates };
      saveToStorage(STORAGE_KEYS.DROP_BOXES, boxes);
    }
    return boxes;
  },

  deleteDropBox(id) {
    const boxes = this.getDropBoxes().filter((b) => b.id !== id);
    saveToStorage(STORAGE_KEYS.DROP_BOXES, boxes);
    return boxes;
  },
};
