/**
 * MedRelief - Main Application Controller
 * Pure Non-Profit Campus Medicine Donation & Redistribution Platform
 */

import { MedReliefStore, CAMPUS_DROP_OFF_POINTS } from "./store.js";
import {
  startCameraStream,
  stopCameraStream,
  captureFrameToDataUrl,
  runTesseractOCR,
  SAMPLE_BLISTER_PACKS,
} from "./ocr.js";

// Global App State
let currentTab = "overview";
let currentStudentId = "stu-1";
let currentUser = null;

export function getCurrentUser() {
  if (currentUser) return currentUser;
  try {
    const saved = localStorage.getItem("mr_current_user");
    if (saved) {
      currentUser = JSON.parse(saved);
      return currentUser;
    }
  } catch (e) {}
  return null;
}
window.getCurrentUser = getCurrentUser;

let selectedDonationForModal = null;
let selectedDonationForReject = null;
let selectedNgoClaimItems = [];
let unreadNotificationsCount = 0;
let ocrCapturedImageUrl = null;
let signatureCanvas = null;
let signatureCtx = null;
let isDrawingSignature = false;
let hasSignatureDrawn = false;

// DOM Elements Cache
const DOM = {};

function initDomCache() {
  DOM.tabButtons = document.querySelectorAll(".nav-tab-btn");
  DOM.tabPanes = document.querySelectorAll(".tab-pane");
  DOM.mobileMenuBtn = document.getElementById("btn-mobile-menu");
  DOM.navTabs = document.getElementById("nav-tabs");
  DOM.btnOpenDrawer = document.getElementById("btn-open-drawer");
  DOM.badgeCount = document.getElementById("badge-count");
  DOM.btnPwaInstall = document.getElementById("btn-pwa-install");

  // Drawer
  DOM.drawerOverlay = document.getElementById("drawer-overlay");
  DOM.drawerPanel = document.getElementById("drawer-panel");
  DOM.btnCloseDrawer = document.getElementById("btn-close-drawer");
  DOM.drawerList = document.getElementById("drawer-list");

  // Modals
  DOM.ocrModal = document.getElementById("modal-ocr");
  DOM.btnCloseOcr = document.getElementById("btn-close-ocr");
  DOM.timelineModal = document.getElementById("modal-timeline");
  DOM.btnCloseTimeline = document.getElementById("btn-close-timeline");
  DOM.rejectModal = document.getElementById("modal-reject");
  DOM.btnCloseReject = document.getElementById("btn-close-reject");
  DOM.ngoClaimModal = document.getElementById("modal-ngo-claim");
  DOM.btnCloseNgoClaim = document.getElementById("btn-close-ngo-claim");

  // Toast container
  DOM.toastContainer = document.getElementById("toast-container");
}

// ==============================================================================
// INITIALIZATION
// ==============================================================================
document.addEventListener("DOMContentLoaded", () => {
  initDomCache();
  setupEventListeners();
  renderAllViews();
  registerPwaServiceWorker();

  // Listen to store updates
  window.addEventListener("medrelief:store_updated", () => {
    renderAllViews();
  });

  // Listen to milestone student notification alerts
  window.addEventListener("medrelief:student_notification", (e) => {
    const entry = e.detail;
    showToastNotification(entry);
    unreadNotificationsCount++;
    if (DOM.badgeCount) {
      DOM.badgeCount.textContent = unreadNotificationsCount;
      DOM.badgeCount.style.display = "flex";
    }
    renderNotificationDrawer();
  });
});

// ==============================================================================
// EVENT LISTENERS SETUP
// ==============================================================================
function setupEventListeners() {
  // Navigation Tabs
  DOM.tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.tab;
      switchTab(target);
      if (DOM.navTabs) DOM.navTabs.classList.remove("mobile-open");
    });
  });

  // Mobile Menu Toggle
  if (DOM.mobileMenuBtn) {
    DOM.mobileMenuBtn.addEventListener("click", () => {
      DOM.navTabs.classList.toggle("mobile-open");
    });
  }

  // Notification Drawer
  if (DOM.btnOpenDrawer) {
    DOM.btnOpenDrawer.addEventListener("click", openNotificationDrawer);
  }
  if (DOM.btnCloseDrawer) {
    DOM.btnCloseDrawer.addEventListener("click", closeNotificationDrawer);
  }
  if (DOM.drawerOverlay) {
    DOM.drawerOverlay.addEventListener("click", closeNotificationDrawer);
  }

  // Modals close buttons
  if (DOM.btnCloseOcr) DOM.btnCloseOcr.addEventListener("click", closeOcrModal);
  if (DOM.btnCloseTimeline) DOM.btnCloseTimeline.addEventListener("click", closeTimelineModal);
  if (DOM.btnCloseReject) DOM.btnCloseReject.addEventListener("click", closeRejectModal);
  if (DOM.btnCloseNgoClaim) DOM.btnCloseNgoClaim.addEventListener("click", closeNgoClaimModal);

  // Student Profile Switching & Edit Form
  const studentSelect = document.getElementById("student-profile-select");
  if (studentSelect) {
    studentSelect.addEventListener("change", (e) => {
      currentStudentId = e.target.value;
      renderStudentView();
    });
  }

  const btnToggleEditStudent = document.getElementById("btn-toggle-edit-student");
  const editStudentCard = document.getElementById("edit-student-card");
  if (btnToggleEditStudent && editStudentCard) {
    btnToggleEditStudent.addEventListener("click", () => {
      editStudentCard.style.display = editStudentCard.style.display === "none" ? "block" : "none";
    });
  }

  const formEditStudent = document.getElementById("form-edit-student");
  if (formEditStudent) {
    formEditStudent.addEventListener("submit", (e) => {
      e.preventDefault();
      const updated = {
        id: currentStudentId,
        full_name: document.getElementById("edit-student-name").value,
        roll_number: document.getElementById("edit-student-roll").value,
        division: document.getElementById("edit-student-div").value,
        phone: document.getElementById("edit-student-phone").value,
        email: document.getElementById("edit-student-email").value,
      };
      MedReliefStore.createStudent(updated);
      editStudentCard.style.display = "none";
      renderStudentView();
      showToast("Profile Updated", "Student registration details saved.");
    });
  }

  // Donation Submission Form
  const formDonation = document.getElementById("form-donation");
  if (formDonation) {
    formDonation.addEventListener("submit", handleDonationSubmit);
  }

  // OCR Triggers in Student Form (Guarded: Login Required)
  const btnTriggerOcr = document.getElementById("btn-trigger-ocr");
  if (btnTriggerOcr) {
    btnTriggerOcr.addEventListener("click", () => {
      const user = getCurrentUser();
      if (!user) {
        showToast("Login Required", "Please log in with your student account to scan blister packs with OCR.");
        if (typeof window.openAuthModal === "function") window.openAuthModal("login");
        return;
      }
      openOcrModal();
    });
  }

  // Camera snap in OCR Modal
  const btnSnapOcr = document.getElementById("btn-snap-ocr");
  if (btnSnapOcr) {
    btnSnapOcr.addEventListener("click", handleOcrSnap);
  }

  // Retake photo in OCR Modal
  const btnRetakeOcr = document.getElementById("btn-retake-ocr");
  if (btnRetakeOcr) {
    btnRetakeOcr.addEventListener("click", handleOcrRetake);
  }

  // File upload in OCR Modal
  const fileOcrInput = document.getElementById("file-ocr-input");
  if (fileOcrInput) {
    fileOcrInput.addEventListener("change", handleOcrFileUpload);
  }

  // Apply OCR to Form
  const btnApplyOcr = document.getElementById("btn-apply-ocr");
  if (btnApplyOcr) {
    btnApplyOcr.addEventListener("click", handleOcrApply);
  }

  // Manual File Upload on Donation Form (Guarded: Login Required)
  const fileManualBlister = document.getElementById("file-manual-blister");
  if (fileManualBlister) {
    fileManualBlister.addEventListener("click", (e) => {
      const user = getCurrentUser();
      if (!user) {
        e.preventDefault();
        showToast("Login Required", "Please log in with your student account before uploading medicine photos.");
        if (typeof window.openAuthModal === "function") window.openAuthModal("login");
        return;
      }
    });

    fileManualBlister.addEventListener("change", (e) => {
      const user = getCurrentUser();
      if (!user) {
        e.target.value = "";
        showToast("Login Required", "Please log in with your student account before uploading medicine photos.");
        if (typeof window.openAuthModal === "function") window.openAuthModal("login");
        return;
      }
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        document.getElementById("form-photo-url").value = event.target.result;
        const preview = document.getElementById("blister-preview-img");
        if (preview) {
          preview.src = event.target.result;
          preview.style.display = "block";
        }
      };
      reader.readAsDataURL(file);
    });
  }

  // Collector filter
  const selectCollectorFilter = document.getElementById("select-collector-filter");
  if (selectCollectorFilter) {
    selectCollectorFilter.addEventListener("change", () => {
      renderCollectorView();
    });
  }

  // Pharmacist batch approve
  const btnBatchApprove = document.getElementById("btn-batch-approve");
  if (btnBatchApprove) {
    btnBatchApprove.addEventListener("click", handleBatchApprove);
  }

  // Pharmacist confirm rejection
  const formReject = document.getElementById("form-reject");
  if (formReject) {
    formReject.addEventListener("submit", handleConfirmReject);
  }

  // NGO Claim Form & Signature
  initSignaturePad();
  const formNgoClaim = document.getElementById("form-ngo-claim");
  if (formNgoClaim) {
    formNgoClaim.addEventListener("submit", handleNgoClaimSubmit);
  }

  const fileNgoProof = document.getElementById("file-ngo-proof");
  if (fileNgoProof) {
    fileNgoProof.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        document.getElementById("ngo-proof-url").value = event.target.result;
        const preview = document.getElementById("ngo-proof-preview");
        if (preview) {
          preview.src = event.target.result;
          preview.style.display = "block";
        }
      };
      reader.readAsDataURL(file);
    });
  }

  const btnSampleProof = document.getElementById("btn-sample-proof");
  if (btnSampleProof) {
    btnSampleProof.addEventListener("click", () => {
      const sampleUrl = "https://images.unsplash.com/photo-1576765608535-5f04d1e3f289?w=600&auto=format&fit=crop&q=80";
      document.getElementById("ngo-proof-url").value = sampleUrl;
      const preview = document.getElementById("ngo-proof-preview");
      if (preview) {
        preview.src = sampleUrl;
        preview.style.display = "block";
      }
    });
  }

  // Admin Reseed Button
  const btnAdminReseed = document.getElementById("btn-admin-reseed");
  if (btnAdminReseed) {
    btnAdminReseed.addEventListener("click", () => {
      if (confirm("Reset database to initial campus demonstration records?")) {
        MedReliefStore.resetDefaults();
        showToast("Database Reseeded", "All campus demonstration records restored.");
      }
    });
  }

  // Admin Copy SQL
  const btnCopySql = document.getElementById("btn-copy-sql");
  if (btnCopySql) {
    btnCopySql.addEventListener("click", () => {
      const sql = document.getElementById("sql-schema-pre")?.innerText || "";
      navigator.clipboard.writeText(sql);
      btnCopySql.textContent = "✓ SQL Copied!";
      setTimeout(() => {
        btnCopySql.textContent = "Copy SQL Schema";
      }, 2500);
    });
  }
}

// ==============================================================================
// TAB SWITCHING
// ==============================================================================
export function switchTab(tabId) {
  currentTab = tabId;
  DOM.tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  DOM.tabPanes.forEach((pane) => {
    pane.classList.toggle("active", pane.id === `tab-${tabId}`);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
  renderAllViews();
}
window.switchTab = switchTab;

// ==============================================================================
// RENDERING CONTROLLERS
// ==============================================================================
function renderAllViews() {
  renderOverviewView();
  renderStudentView();
  renderCollectorView();
  renderPharmacistView();
  renderNgoView();
  renderAdminView();
  renderNotificationDrawer();
}

// --- 1. OVERVIEW VIEW ---
function renderOverviewView() {
  const donations = MedReliefStore.getDonations();
  const students = MedReliefStore.getStudents();
  const claims = MedReliefStore.getNgoClaims();

  const totalStrips = donations.reduce((sum, d) => sum + Number(d.quantity_strips), 0);
  const totalKg = ((totalStrips * 35) / 1000).toFixed(2);
  const verified = donations.filter((d) => d.status === "PHARMACIST_VERIFIED").length;
  const distributed = donations.filter((d) => d.status === "NGO_HANDOVER_COMPLETED").length;

  const elKg = document.getElementById("stat-kg-diverted");
  const elStrips = document.getElementById("stat-strips-diverted");
  const elVerified = document.getElementById("stat-verified-stock");
  const elClaims = document.getElementById("stat-ngo-claims");
  const elStudents = document.getElementById("stat-active-donors");

  if (elKg) elKg.innerHTML = `${totalKg} <span>kg</span>`;
  if (elStrips) elStrips.textContent = `${totalStrips} strips kept from landfills`;
  if (elVerified) elVerified.textContent = verified;
  if (elClaims) elClaims.textContent = distributed + claims.length;
  if (elStudents) elStudents.textContent = students.length;

  // Render Lockers Grid
  const lockersContainer = document.getElementById("lockers-container");
  if (lockersContainer) {
    const requested = donations.filter((d) => d.status === "REQUESTED");
    const dropBoxes = MedReliefStore.getDropBoxes();
    const icons = ["🏛️","🏥","🏫","🏠","📦","🏢"];
    const gradients = [
      "linear-gradient(135deg,#007380 0%,#00a89c 100%)",
      "linear-gradient(135deg,#3b82f6 0%,#06b6d4 100%)",
      "linear-gradient(135deg,#6EB56F 0%,#059669 100%)",
      "linear-gradient(135deg,#8b5cf6 0%,#6366f1 100%)",
      "linear-gradient(135deg,#f59e0b 0%,#ef4444 100%)",
      "linear-gradient(135deg,#ec4899 0%,#8b5cf6 100%)",
    ];
    lockersContainer.innerHTML = dropBoxes.map((loc, i) => {
      const count = requested.filter((d) => d.drop_off_point === loc.name).length;
      const grad = gradients[i % gradients.length];
      const icon = icons[i % icons.length];
      return `
        <div class="dropbox-card" style="background:${grad};">
          <div class="dropbox-card-icon">${icon}</div>
          <div class="dropbox-card-content">
            <div class="dropbox-card-name">${loc.name}</div>
            <div class="dropbox-card-building">📍 ${loc.building}</div>
            <div class="dropbox-card-footer">
              <span class="dropbox-hours">🕐 ${loc.hours}</span>
              <span class="dropbox-queue ${count > 0 ? 'has-items' : ''}">${count} awaiting</span>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }
}

// --- 2. STUDENT / DONOR VIEW ---
function renderStudentView() {
  const students = MedReliefStore.getStudents();
  const user = getCurrentUser();
  const lockCard = document.getElementById("donor-auth-lock-card");

  if (user) {
    if (lockCard) lockCard.style.display = "none";
    // Check if user is in students list or match by roll
    const matched = students.find((s) => s.id === user.id || s.roll_number === user.roll_number);
    if (matched) {
      currentStudentId = matched.id;
    }
  } else {
    if (lockCard) lockCard.style.display = "flex";
  }

  const currentStudent = MedReliefStore.getStudentById(currentStudentId) || user;

  // Update profile select
  const studentSelect = document.getElementById("student-profile-select");
  if (studentSelect) {
    studentSelect.innerHTML = students
      .map((s) => `<option value="${s.id}" ${s.id === currentStudentId ? "selected" : ""}>${s.full_name} (${s.roll_number})</option>`)
      .join("");
  }

  // Profile Card
  const profileCard = document.getElementById("student-profile-card");
  if (profileCard && currentStudent) {
    const isAuth = !!user;
    profileCard.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 14px;">
          <div style="width: 46px; height: 46px; border-radius: var(--radius-sm); background: ${isAuth ? "var(--accent-50)" : "var(--tint)"}; color: ${isAuth ? "var(--accent-dark)" : "var(--primary)"}; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 800; border: 1px solid ${isAuth ? "var(--accent)" : "rgba(0,115,128,0.2)"};">
            ${isAuth ? "🎓" : "👤"}
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <h3 style="font-size: 16px; font-weight: 800; color: var(--text-dark);">${currentStudent.full_name}</h3>
              <span class="font-mono" style="font-size: 11px; background: #E5E7EB; padding: 2px 8px; border-radius: 4px; font-weight: 700;">${currentStudent.roll_number}</span>
              ${isAuth ? `<span style="background:var(--accent-50);color:var(--accent-dark);border:1px solid var(--accent);font-size:10px;padding:2px 8px;border-radius:999px;font-weight:800;">✓ Active Sign-in</span>` : `<span style="background:#fee2e2;color:#dc2626;border:1px solid #f87171;font-size:10px;padding:2px 8px;border-radius:999px;font-weight:700;">Sign-in Required</span>`}
            </div>
            <p style="font-size: 12px; color: var(--text-muted); margin-top: 3px;">
              ${currentStudent.division} • 📱 ${currentStudent.phone} • ✉️ ${currentStudent.email}
            </p>
          </div>
        </div>
      </div>
    `;

    // Populate edit fields
    const editName = document.getElementById("edit-student-name");
    const editRoll = document.getElementById("edit-student-roll");
    const editDiv = document.getElementById("edit-student-div");
    const editPhone = document.getElementById("edit-student-phone");
    const editEmail = document.getElementById("edit-student-email");
    if (editName) editName.value = currentStudent.full_name;
    if (editRoll) editRoll.value = currentStudent.roll_number;
    if (editDiv) editDiv.value = currentStudent.division;
    if (editPhone) editPhone.value = currentStudent.phone;
    if (editEmail) editEmail.value = currentStudent.email;
  }

  // Populate drop-off points select in donation form
  const dropSelect = document.getElementById("form-drop-point");
  if (dropSelect && dropSelect.children.length === 0) {
    dropSelect.innerHTML = MedReliefStore.getDropBoxes().map(
      (loc) => `<option value="${loc.name}">${loc.name} (${loc.building})</option>`
    ).join("");
  }

  // Render My Donations List
  const donations = MedReliefStore.getDonations();
  const myDonations = donations.filter((d) => d.student_id === currentStudentId);
  const container = document.getElementById("student-donations-list");

  if (container) {
    if (myDonations.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: var(--text-light); border: 2px dashed var(--border-color); border-radius: var(--radius-md);">
          <div style="font-size: 32px; margin-bottom: 8px;">💊</div>
          <h4 style="font-size: 14px; font-weight: 700; color: var(--text-dark);">No Surplus Medicine Donated Yet</h4>
          <p style="font-size: 12px; margin-top: 4px;">Scan your blister pack with web camera or fill the form to register your drop-off.</p>
        </div>
      `;
    } else {
      container.innerHTML = myDonations.map((item) => {
        const statusClass = item.status.toLowerCase();
        return `
          <div class="donation-card" style="margin-bottom: 14px;">
            <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px;">
              <div style="display: flex; align-items: flex-start; gap: 12px;">
                ${item.photo_url ? `<img src="${item.photo_url}" style="width: 50px; height: 50px; border-radius: var(--radius-sm); object-fit: cover; border: 1px solid var(--border-color); flex-shrink: 0;" />` : ""}
                <div>
                  <h4 style="font-size: 14px; font-weight: 800; color: var(--text-dark);">${item.brand_name || item.drug_name}</h4>
                  ${item.brand_name ? `<p style="font-size: 12px; color: var(--primary); font-weight: 600;">${item.drug_name}</p>` : ""}
                  <p style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                    ${item.quantity_strips} strip(s) • Exp: <span class="font-mono">${item.expiry_date}</span>
                  </p>
                </div>
              </div>
              <span class="status-pill ${statusClass}">${item.status.replace(/_/g, " ")}</span>
            </div>

            <!-- Milestone Tracker Component -->
            ${renderMilestoneStepperHtml(item.status)}

            <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; font-size: 11px;">
              <span style="color: var(--text-light); font-family: var(--font-mono);">📍 ${item.drop_off_point}</span>
              <button class="btn-outline" style="padding: 4px 10px; font-size: 11px;" onclick="window.openTimelineModal('${item.id}')">
                View Audit Trail →
              </button>
            </div>
          </div>
        `;
      }).join("");
    }
  }
}

function renderMilestoneStepperHtml(status) {
  const steps = [
    { key: "REQUESTED", label: "Requested", sub: "Pledged" },
    { key: "COLLECTED", label: "Collected", sub: "Retrieved" },
    { key: "PHARMACIST_VERIFIED", label: "Verified", sub: "Audited Safe" },
    { key: "NGO_HANDOVER_COMPLETED", label: "Handover", sub: "Free Aid" },
  ];

  const order = { REQUESTED: 0, COLLECTED: 1, PHARMACIST_VERIFIED: 2, NGO_HANDOVER_COMPLETED: 3, REJECTED: 2 };
  const currentIdx = order[status] ?? 0;
  const isRejected = status === "REJECTED";

  return `
    <div class="milestone-stepper">
      ${steps.map((st, idx) => {
        const isCompleted = !isRejected && idx <= currentIdx;
        const isActive = !isRejected && idx === currentIdx;
        const isRej = isRejected && idx === 2;

        let cls = "";
        let icon = idx + 1;
        if (isRej) {
          cls = "rejected";
          icon = "✕";
        } else if (isCompleted) {
          cls = "completed";
          icon = "✓";
        } else if (isActive) {
          cls = "active";
        }

        return `
          <div class="milestone-step ${cls}">
            <div class="milestone-circle">${icon}</div>
            <div class="milestone-title">${isRej ? "Rejected" : st.label}</div>
            <div class="milestone-desc">${isRej ? "Incineration" : st.sub}</div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

// --- 3. CAMPUS COLLECTOR VIEW ---
function renderCollectorView() {
  const donations = MedReliefStore.getDonations();
  const filterLoc = document.getElementById("select-collector-filter")?.value || "ALL";

  const requested = donations.filter(
    (d) => d.status === "REQUESTED" && (filterLoc === "ALL" || d.drop_off_point === filterLoc)
  );
  const inTransit = donations.filter((d) => d.status === "COLLECTED");

  const queueContainer = document.getElementById("collector-queue-grid");
  const inTransitContainer = document.getElementById("collector-transit-grid");

  if (queueContainer) {
    if (requested.length === 0) {
      queueContainer.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-light);">
          <div style="font-size: 32px; margin-bottom: 8px;">✓</div>
          <h4 style="font-size: 14px; font-weight: 700; color: var(--text-dark);">Drop-Boxes Cleared</h4>
          <p style="font-size: 12px; margin-top: 4px;">No student packages currently awaiting pickup at this location.</p>
        </div>
      `;
    } else {
      queueContainer.innerHTML = requested.map((item) => `
        <div class="donation-card">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span class="font-mono" style="font-size: 10px; font-weight: 700; background: var(--tint); color: var(--primary); padding: 2px 6px; border-radius: 4px;">${item.id}</span>
              <span class="font-mono" style="font-size: 10px; color: var(--text-light);">${new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <h4 style="font-size: 14px; font-weight: 800; color: var(--text-dark);">${item.brand_name || item.drug_name}</h4>
            ${item.brand_name ? `<p style="font-size: 12px; color: var(--primary); font-weight: 600;">${item.drug_name}</p>` : ""}
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">
              <p>📍 <strong>${item.drop_off_point}</strong></p>
              <p>📦 <strong>${item.quantity_strips}</strong> strip(s) • Exp: <span class="font-mono">${item.expiry_date}</span></p>
              ${item.student ? `<p style="font-size: 11px; margin-top: 4px; color: var(--text-light);">Donor: ${item.student.full_name} (${item.student.roll_number})</p>` : ""}
            </div>
          </div>
          <button class="btn-primary" style="margin-top: 14px; width: 100%;" onclick="window.collectSinglePackage('${item.id}')">
            ✓ Pick Up Package
          </button>
        </div>
      `).join("");
    }
  }

  if (inTransitContainer) {
    if (inTransit.length === 0) {
      inTransitContainer.innerHTML = `<div style="grid-column: 1 / -1; font-size: 12px; color: var(--text-light); padding: 12px 0;">No packages currently in transit.</div>`;
    } else {
      inTransitContainer.innerHTML = inTransit.map((item) => `
        <div style="background: #FFFFFF; border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 12px 14px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <strong style="font-size: 13px; color: var(--text-dark);">${item.brand_name || item.drug_name}</strong>
            <p style="font-size: 11px; color: var(--text-muted);">${item.quantity_strips} strip(s) • Picked up by ${item.collector_id || "Volunteer Team"}</p>
          </div>
          <span class="status-pill collected">In Transit</span>
        </div>
      `).join("");
    }
  }
}

// --- 4. PHARMACIST AUDIT VIEW ---
function renderPharmacistView() {
  const donations = MedReliefStore.getDonations();
  const queue = donations.filter((d) => d.status === "COLLECTED" || d.status === "REQUESTED");
  const verified = donations.filter((d) => d.status === "PHARMACIST_VERIFIED");

  const countPending = document.getElementById("pharmacist-pending-count");
  const countApproved = document.getElementById("pharmacist-approved-count");
  if (countPending) countPending.textContent = queue.length;
  if (countApproved) countApproved.textContent = verified.length;

  const tableBody = document.getElementById("pharmacist-queue-tbody");
  if (tableBody) {
    if (queue.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 36px; color: var(--text-light);">
            <div style="font-size: 28px; margin-bottom: 6px;">✓</div>
            <strong>All incoming campus donations have been inspected and audited!</strong>
          </td>
        </tr>
      `;
    } else {
      tableBody.innerHTML = queue.map((item) => {
        // Expiry check
        const exp = new Date(item.expiry_date);
        const daysLeft = Math.ceil((exp.getTime() - new Date().getTime()) / (1000 * 3600 * 24));
        const expiringSoon = daysLeft < 60;

        return `
          <tr>
            <td>
              <input type="checkbox" class="audit-select-check" value="${item.id}" />
            </td>
            <td>
              ${item.photo_url ? `<img src="${item.photo_url}" style="width: 44px; height: 44px; border-radius: 6px; object-fit: cover; border: 1px solid var(--border-color);" />` : `<div style="width: 44px; height: 44px; background: #eee; border-radius: 6px; display: flex; align-items: center; justify-content: center;">💊</div>`}
            </td>
            <td>
              <strong style="color: var(--text-dark);">${item.brand_name || item.drug_name}</strong>
              ${item.brand_name ? `<br><span style="font-size: 11px; color: var(--primary); font-weight: 600;">${item.drug_name}</span>` : ""}
              <div style="font-size: 10px; color: var(--text-light);">ID: ${item.id}</div>
            </td>
            <td><strong>${item.quantity_strips}</strong> strip(s)</td>
            <td>
              <span class="font-mono" style="font-weight: 700; ${expiringSoon ? "color: var(--danger);" : ""}">${item.expiry_date}</span>
              ${expiringSoon ? `<div style="font-size: 10px; color: var(--danger); font-weight: 700;">⚠️ &lt; 60 days (${daysLeft}d left)</div>` : ""}
            </td>
            <td>
              <span style="font-size: 11px; color: var(--accent-dark); font-weight: 700;">✓ Sealed Intact</span>
            </td>
            <td>
              <div style="display: flex; gap: 6px;">
                <button class="btn-accent" style="padding: 6px 12px; font-size: 11px;" onclick="window.approveSingleDonation('${item.id}')">
                  ✓ Approve
                </button>
                <button class="btn-danger" style="padding: 6px 10px; font-size: 11px;" onclick="window.openRejectModal('${item.id}')">
                  ✕ Reject
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join("");
    }
  }

  // Render Verified Stock Pool
  const poolGrid = document.getElementById("pharmacist-verified-grid");
  if (poolGrid) {
    if (verified.length === 0) {
      poolGrid.innerHTML = `<div style="grid-column: 1 / -1; font-size: 12px; color: var(--text-light);">No verified batches in pool yet.</div>`;
    } else {
      poolGrid.innerHTML = verified.map((item) => `
        <div style="background: #FFFFFF; border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <strong style="font-size: 13px; color: var(--text-dark);">${item.brand_name || item.drug_name}</strong>
            <span class="status-pill pharmacist_verified">Verified</span>
          </div>
          <p style="font-size: 11px; color: var(--primary); font-weight: 600;">${item.drug_name}</p>
          <p style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
            ${item.quantity_strips} strip(s) • Exp: <span class="font-mono">${item.expiry_date}</span>
          </p>
          ${item.pharmacist_notes ? `<p style="font-size: 10px; font-style: italic; color: var(--text-muted); margin-top: 6px; background: var(--tint-light); padding: 4px 6px; border-radius: 4px;">Note: ${item.pharmacist_notes}</p>` : ""}
        </div>
      `).join("");
    }
  }
}

// --- 5. NGO DISTRIBUTION VIEW ---
function renderNgoView() {
  const donations = MedReliefStore.getDonations();
  const claims = MedReliefStore.getNgoClaims();
  const verifiedInventory = donations.filter((d) => d.status === "PHARMACIST_VERIFIED");

  const catalogContainer = document.getElementById("ngo-inventory-catalog");
  const claimsArchiveContainer = document.getElementById("ngo-claims-archive");

  if (catalogContainer) {
    if (verifiedInventory.length === 0) {
      catalogContainer.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-light); border: 2px dashed var(--border-color); border-radius: var(--radius-md);">
          <div style="font-size: 32px; margin-bottom: 8px;">✓</div>
          <h4 style="font-size: 14px; font-weight: 700; color: var(--text-dark);">All Verified Batches Allocated</h4>
          <p style="font-size: 12px; margin-top: 4px;">Incoming campus donations are currently undergoing pharmacist clinical inspection.</p>
        </div>
      `;
    } else {
      catalogContainer.innerHTML = verifiedInventory.map((item) => {
        const isSelected = selectedNgoClaimItems.includes(item.id);
        return `
          <div class="donation-card" style="${isSelected ? "border-color: var(--primary); background: var(--tint-light);" : ""}">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <span class="font-mono" style="font-size: 10px; font-weight: 700; background: var(--tint); color: var(--primary); padding: 2px 6px; border-radius: 4px;">${item.id}</span>
                <span class="status-pill pharmacist_verified">Approved Safe</span>
              </div>
              <h4 style="font-size: 14px; font-weight: 800; color: var(--text-dark);">${item.brand_name || item.drug_name}</h4>
              ${item.brand_name ? `<p style="font-size: 12px; color: var(--primary); font-weight: 600;">${item.drug_name}</p>` : ""}
              <div style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">
                <p>📦 <strong>${item.quantity_strips}</strong> strip(s) available</p>
                <p>📅 Valid until: <span class="font-mono font-bold">${item.expiry_date}</span></p>
              </div>
            </div>
            <button class="${isSelected ? "btn-danger" : "btn-primary"}" style="margin-top: 14px; width: 100%;" onclick="window.toggleNgoItemSelection('${item.id}')">
              ${isSelected ? "✕ Remove from Claim Cart" : "+ Add to Free Claim Cart"}
            </button>
          </div>
        `;
      }).join("");
    }
  }

  // Update claim button bar
  const claimBar = document.getElementById("ngo-claim-action-bar");
  const claimCountSpan = document.getElementById("ngo-selected-count");
  if (claimBar && claimCountSpan) {
    if (selectedNgoClaimItems.length > 0) {
      claimBar.style.display = "flex";
      claimCountSpan.textContent = selectedNgoClaimItems.length;
    } else {
      claimBar.style.display = "none";
    }
  }

  // Render Claims Archive
  if (claimsArchiveContainer) {
    if (claims.length === 0) {
      claimsArchiveContainer.innerHTML = `<div style="grid-column: 1 / -1; font-size: 12px; color: var(--text-light); padding: 12px 0;">No dispatches recorded yet.</div>`;
    } else {
      claimsArchiveContainer.innerHTML = claims.map((claim) => `
        <div style="background: #FFFFFF; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 18px; display: flex; gap: 16px; align-items: flex-start;">
          ${claim.proof_photo_url ? `<img src="${claim.proof_photo_url}" style="width: 80px; height: 80px; border-radius: 8px; object-fit: cover; border: 1px solid var(--border-color); flex-shrink: 0;" />` : ""}
          <div style="flex: 1;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong style="font-size: 14px; color: var(--text-dark);">${claim.ngo_name}</strong>
              <span class="status-pill ngo_handover_completed">Handover Completed</span>
            </div>
            <p style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
              Officer: <strong>${claim.representative}</strong> • Camp: ${claim.notes || "Free patient care"}
            </p>
            <div style="margin-top: 8px; display: flex; align-items: center; gap: 12px;">
              ${claim.signature_url ? `<img src="${claim.signature_url}" style="height: 30px; object-fit: contain; border: 1px solid #ddd; padding: 2px 6px; border-radius: 4px; background: #fff;" title="Representative Signature" />` : ""}
              <span class="font-mono" style="font-size: 10px; color: var(--text-light);">Claimed: ${new Date(claim.claimed_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      `).join("");
    }
  }
}

// --- 6. ADMIN "GOD VIEW" VIEW ---
function renderAdminView() {
  const donations = MedReliefStore.getDonations();
  const students = MedReliefStore.getStudents();
  const claims = MedReliefStore.getNgoClaims();
  const timelines = MedReliefStore.getTimelines();

  // Metrics
  const totalStrips = donations.reduce((sum, d) => sum + Number(d.quantity_strips), 0);
  const totalKg = ((totalStrips * 35) / 1000).toFixed(2);
  const verifiedCount = donations.filter((d) => d.status === "PHARMACIST_VERIFIED").length;
  const rejectedCount = donations.filter((d) => d.status === "REJECTED").length;
  const handoverCount = donations.filter((d) => d.status === "NGO_HANDOVER_COMPLETED").length;

  const mKg = document.getElementById("admin-m-kg");
  const mAudit = document.getElementById("admin-m-audit");
  const mClaims = document.getElementById("admin-m-claims");
  const mStudents = document.getElementById("admin-m-students");

  if (mKg) mKg.innerHTML = `${totalKg} <span>kg</span>`;
  if (mAudit) {
    const rate = donations.length > 0 ? Math.round(((verifiedCount + rejectedCount + handoverCount) / donations.length) * 100) : 100;
    mAudit.textContent = `${rate}%`;
  }
  if (mClaims) mClaims.textContent = claims.length;
  if (mStudents) mStudents.textContent = students.length;

  // Central Proof Audit Grid
  const proofGrid = document.getElementById("admin-proof-grid");
  if (proofGrid) {
    proofGrid.innerHTML = claims.map((c) => `
      <div style="background: #F9FAFB; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 16px; margin-bottom: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <h4 style="font-size: 14px; font-weight: 800; color: var(--text-dark);">${c.ngo_name}</h4>
          <span class="font-mono" style="font-size: 11px; color: var(--text-light);">${new Date(c.claimed_at).toLocaleString()}</span>
        </div>
        <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 12px;">Officer: ${c.representative} • Purpose: ${c.notes || "Charitable clinic"}</p>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div>
            <span style="font-size: 10px; text-transform: uppercase; font-weight: 700; color: var(--text-light); display: block; margin-bottom: 4px;">Delivery Proof Photo</span>
            ${c.proof_photo_url ? `<img src="${c.proof_photo_url}" style="width: 100%; height: 120px; object-fit: cover; border-radius: 6px; border: 1px solid var(--border-color);" />` : `<div style="height: 120px; background: #eee; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #888;">No Photo Logged</div>`}
          </div>
          <div>
            <span style="font-size: 10px; text-transform: uppercase; font-weight: 700; color: var(--text-light); display: block; margin-bottom: 4px;">Authorized Signature</span>
            ${c.signature_url ? `<div style="height: 120px; background: #fff; border: 1px solid var(--border-color); border-radius: 6px; display: flex; align-items: center; justify-content: center; padding: 10px;"><img src="${c.signature_url}" style="max-height: 100%; max-width: 100%; object-fit: contain;" /></div>` : `<div style="height: 120px; background: #eee; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #888;">No Signature</div>`}
          </div>
        </div>
      </div>
    `).join("");
  }

  // Notification Audit List
  const notifList = document.getElementById("admin-notif-list");
  if (notifList) {
    notifList.innerHTML = timelines.slice(0, 15).map((t) => `
      <div style="padding: 10px 0; border-bottom: 1px solid var(--border-color); font-size: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <span class="status-pill ${t.status.toLowerCase()}">${t.status}</span>
            <span style="font-weight: 600; color: var(--text-dark); margin-left: 6px;">${t.message}</span>
          </div>
          <span class="font-mono" style="font-size: 10px; color: var(--text-light);">${new Date(t.created_at).toLocaleTimeString()}</span>
        </div>
        <div style="margin-top: 4px; display: flex; gap: 12px; font-size: 11px; color: var(--text-muted);">
          <span>📱 SMS: Delivered to ${t.sms_details?.recipient_phone || "Student"}</span>
          <span>✉️ Email: Confirmation sent</span>
        </div>
      </div>
    `).join("");
  }
}

// --- NOTIFICATION DRAWER RENDERING ---
function renderNotificationDrawer() {
  const timelines = MedReliefStore.getTimelines();
  if (DOM.drawerList) {
    DOM.drawerList.innerHTML = timelines.map((item) => `
      <div style="background: #FFFFFF; border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 12px; margin-bottom: 12px; box-shadow: var(--shadow-sm);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span class="status-pill ${item.status.toLowerCase()}">${item.status}</span>
          <span class="font-mono" style="font-size: 10px; color: var(--text-light);">${new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        <p style="font-size: 12px; font-weight: 600; color: var(--text-dark);">${item.message}</p>
        <div style="margin-top: 8px; background: #F9FAFB; padding: 6px 8px; border-radius: 4px; border: 1px solid #E5E7EB; font-size: 10.5px;">
          <strong style="color: var(--primary);">SMS Preview:</strong> ${item.sms_details?.preview || "Update notification"}
        </div>
      </div>
    `).join("");
  }
}

// ==============================================================================
// MODAL & ACTION HANDLERS
// ==============================================================================

// --- Student Donation Submit ---
function handleDonationSubmit(e) {
  e.preventDefault();

  const user = getCurrentUser();
  if (!user) {
    showToast("Authentication Required", "Please log in with your student account before submitting a medicine donation.");
    if (typeof window.openAuthModal === "function") window.openAuthModal("login");
    return;
  }

  const drugName = document.getElementById("form-drug-name").value.trim();
  const brandName = document.getElementById("form-brand-name").value.trim();
  const quantity = Number(document.getElementById("form-quantity").value);
  const expiry = document.getElementById("form-expiry").value;
  const dropPoint = document.getElementById("form-drop-point").value;
  const photoUrl = document.getElementById("form-photo-url").value;
  const ocrText = document.getElementById("form-ocr-text").value;

  if (!drugName || !expiry || quantity < 1) {
    alert("Please fill in generic formulation, quantity, and valid expiry date.");
    return;
  }

  if (!photoUrl) {
    showToast("Verification Photo Required", "Please select or scan a blister pack picture for pharmacist clinical safety inspection.");
    return;
  }

  // Validate expiry date (> 30 days)
  const expDate = new Date(expiry);
  const diffDays = Math.ceil((expDate.getTime() - new Date().getTime()) / (1000 * 3600 * 24));
  if (diffDays <= 0) {
    alert("Medicine is already expired. Expired drugs must be safely disposed of in campus hazardous containers.");
    return;
  }

  const created = MedReliefStore.createDonation({
    student_id: user.id || currentStudentId,
    drug_name: drugName,
    brand_name: brandName || null,
    quantity_strips: quantity,
    expiry_date: expiry,
    drop_off_point: dropPoint,
    photo_url: photoUrl,
    ocr_raw_text: ocrText || null,
    seal_condition: "SEALED_INTACT",
  });

  // Reset form
  e.target.reset();
  document.getElementById("form-photo-url").value = "";
  document.getElementById("form-ocr-text").value = "";
  const preview = document.getElementById("blister-preview-img");
  if (preview) preview.style.display = "none";

  showToast("Donation Registered!", `Pledge for ${created.brand_name || created.drug_name} submitted. SMS confirmation dispatched.`);
  renderStudentView();
}

// --- OCR Camera Modal ---
export function openOcrModal() {
  if (DOM.ocrModal) DOM.ocrModal.classList.add("active");
  const video = document.getElementById("ocr-video");
  const preview = document.getElementById("ocr-captured-preview");
  const btnSnap = document.getElementById("btn-snap-ocr");
  const btnRetake = document.getElementById("btn-retake-ocr");
  const btnApply = document.getElementById("btn-apply-ocr");
  const progressBox = document.getElementById("ocr-progress-box");
  const resultCard = document.getElementById("ocr-result-card");

  if (preview) preview.style.display = "none";
  if (video) video.style.display = "block";
  if (btnSnap) btnSnap.style.display = "inline-flex";
  if (btnRetake) btnRetake.style.display = "none";
  if (btnApply) btnApply.style.display = "none";
  if (progressBox) progressBox.style.display = "none";
  if (resultCard) resultCard.style.display = "none";

  if (video) {
    startCameraStream(video).then((res) => {
      if (!res.success) {
        document.getElementById("ocr-camera-error").textContent = res.error;
        document.getElementById("ocr-camera-error").style.display = "block";
      } else {
        document.getElementById("ocr-camera-error").style.display = "none";
      }
    });
  }

  renderOcrSampleButtons();
}
window.openOcrModal = openOcrModal;

function closeOcrModal() {
  stopCameraStream();
  if (DOM.ocrModal) DOM.ocrModal.classList.remove("active");
}

function renderOcrSampleButtons() {
  const container = document.getElementById("ocr-samples-container");
  if (!container) return;
  container.innerHTML = SAMPLE_BLISTER_PACKS.map((s, idx) => `
    <button type="button" class="btn-outline" style="font-size: 11px; padding: 4px 8px;" onclick="window.useOcrSample(${idx})">
      💊 ${s.name}
    </button>
  `).join("");
}

export function useOcrSample(index) {
  const sample = SAMPLE_BLISTER_PACKS[index];
  if (!sample) return;
  stopCameraStream();

  const video = document.getElementById("ocr-video");
  const preview = document.getElementById("ocr-captured-preview");
  const btnSnap = document.getElementById("btn-snap-ocr");
  const btnRetake = document.getElementById("btn-retake-ocr");

  if (video) video.style.display = "none";
  if (preview) {
    preview.src = sample.url;
    preview.style.display = "block";
  }
  if (btnSnap) btnSnap.style.display = "none";
  if (btnRetake) btnRetake.style.display = "inline-flex";

  ocrCapturedImageUrl = sample.url;
  executeOcr(sample.url, sample.simulatedText);
}
window.useOcrSample = useOcrSample;

function handleOcrSnap() {
  const video = document.getElementById("ocr-video");
  const canvas = document.getElementById("ocr-canvas");
  const preview = document.getElementById("ocr-captured-preview");
  const btnSnap = document.getElementById("btn-snap-ocr");
  const btnRetake = document.getElementById("btn-retake-ocr");

  if (!video || !canvas) return;
  const dataUrl = captureFrameToDataUrl(video, canvas);
  ocrCapturedImageUrl = dataUrl;
  stopCameraStream();

  video.style.display = "none";
  if (preview) {
    preview.src = dataUrl;
    preview.style.display = "block";
  }
  if (btnSnap) btnSnap.style.display = "none";
  if (btnRetake) btnRetake.style.display = "inline-flex";

  executeOcr(dataUrl);
}

function handleOcrRetake() {
  ocrCapturedImageUrl = null;
  openOcrModal();
}

function handleOcrFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    stopCameraStream();
    const dataUrl = event.target.result;
    ocrCapturedImageUrl = dataUrl;
    const video = document.getElementById("ocr-video");
    const preview = document.getElementById("ocr-captured-preview");
    if (video) video.style.display = "none";
    if (preview) {
      preview.src = dataUrl;
      preview.style.display = "block";
    }
    executeOcr(dataUrl);
  };
  reader.readAsDataURL(file);
}

let lastOcrResult = null;

async function executeOcr(imageSource, fallbackText) {
  const progressBox = document.getElementById("ocr-progress-box");
  const progressMsg = document.getElementById("ocr-progress-msg");
  const progressBar = document.getElementById("ocr-progress-bar");
  const resultCard = document.getElementById("ocr-result-card");
  const btnApply = document.getElementById("btn-apply-ocr");

  if (progressBox) progressBox.style.display = "block";
  if (resultCard) resultCard.style.display = "none";

  const result = await runTesseractOCR(imageSource, (pct, msg) => {
    if (progressBar) progressBar.style.width = `${pct}%`;
    if (progressMsg) progressMsg.textContent = msg;
  });

  if (fallbackText && (!result.rawText || result.confidence < 25)) {
    result.rawText = fallbackText;
  }

  lastOcrResult = result;

  if (progressBox) progressBox.style.display = "none";
  if (resultCard) {
    resultCard.style.display = "block";
    document.getElementById("ocr-res-brand").textContent = result.brandName;
    document.getElementById("ocr-res-generic").textContent = result.drugName;
    document.getElementById("ocr-res-expiry").textContent = result.expiryDate;
    document.getElementById("ocr-res-qty").textContent = `${result.quantityStrips} strip(s)`;
    document.getElementById("ocr-res-raw").textContent = result.rawText;
  }
  if (btnApply) btnApply.style.display = "inline-flex";
}

function handleOcrApply() {
  if (!lastOcrResult) return;
  document.getElementById("form-drug-name").value = lastOcrResult.drugName;
  document.getElementById("form-brand-name").value = lastOcrResult.brandName;
  document.getElementById("form-quantity").value = lastOcrResult.quantityStrips;
  document.getElementById("form-expiry").value = lastOcrResult.expiryDate;
  document.getElementById("form-ocr-text").value = lastOcrResult.rawText;

  if (ocrCapturedImageUrl) {
    document.getElementById("form-photo-url").value = ocrCapturedImageUrl;
    const preview = document.getElementById("blister-preview-img");
    if (preview) {
      preview.src = ocrCapturedImageUrl;
      preview.style.display = "block";
    }
  }

  closeOcrModal();
  showToast("OCR Data Applied", "Blister pack fields successfully pre-filled.");
}

// --- Collector Single Action ---
export function collectSinglePackage(id) {
  const donation = MedReliefStore.getDonationById(id);
  if (!donation) return;
  MedReliefStore.updateDonationStatus(id, "COLLECTED", { collector_id: "CAMPUS_VOLUNTEER_NORTH" });
  showToast("Package Collected", `${donation.brand_name || donation.drug_name} retrieved from ${donation.drop_off_point}.`);
  renderCollectorView();
}
window.collectSinglePackage = collectSinglePackage;

// --- Pharmacist Actions ---
export function approveSingleDonation(id) {
  const donation = MedReliefStore.getDonationById(id);
  if (!donation) return;
  MedReliefStore.updateDonationStatus(id, "PHARMACIST_VERIFIED", {
    pharmacist_notes: "Blister seal intact. Expiry safe (>60 days). Stored in climate bin.",
    seal_condition: "SEALED_INTACT",
  });
  showToast("Medicine Approved!", `${donation.brand_name || donation.drug_name} certified safe for non-profit pool.`);
  renderPharmacistView();
}
window.approveSingleDonation = approveSingleDonation;

function handleBatchApprove() {
  const checks = document.querySelectorAll(".audit-select-check:checked");
  if (checks.length === 0) {
    alert("Please select at least one item from the audit queue.");
    return;
  }
  checks.forEach((chk) => {
    MedReliefStore.updateDonationStatus(chk.value, "PHARMACIST_VERIFIED", {
      pharmacist_notes: "Batch approved by Dr. S.K. Mehta. Quality check verified.",
      seal_condition: "SEALED_INTACT",
    });
  });
  showToast("Batch Approved", `${checks.length} medicine package(s) verified safe.`);
  renderPharmacistView();
}

export function openRejectModal(id) {
  selectedDonationForReject = MedReliefStore.getDonationById(id);
  if (!selectedDonationForReject) return;
  if (DOM.rejectModal) {
    DOM.rejectModal.classList.add("active");
    document.getElementById("reject-item-name").textContent = `${selectedDonationForReject.brand_name || selectedDonationForReject.drug_name} (${selectedDonationForReject.quantity_strips} strips)`;
  }
}
window.openRejectModal = openRejectModal;

function closeRejectModal() {
  selectedDonationForReject = null;
  if (DOM.rejectModal) DOM.rejectModal.classList.remove("active");
}

function handleConfirmReject(e) {
  e.preventDefault();
  if (!selectedDonationForReject) return;
  const reason = document.getElementById("reject-reason-text").value.trim();
  if (!reason) {
    alert("Please provide the clinical rejection reason.");
    return;
  }

  MedReliefStore.updateDonationStatus(selectedDonationForReject.id, "REJECTED", {
    rejection_reason: reason,
    pharmacist_notes: "Clinical safety check failed. Routed to Campus Hazardous Waste Incinerator.",
    seal_condition: "PARTIALLY_OPEN",
  });

  closeRejectModal();
  showToast("Package Rejected", `${selectedDonationForReject.brand_name || selectedDonationForReject.drug_name} logged for safe medical disposal.`);
  renderPharmacistView();
}

// --- NGO Actions ---
export function toggleNgoItemSelection(id) {
  if (selectedNgoClaimItems.includes(id)) {
    selectedNgoClaimItems = selectedNgoClaimItems.filter((i) => i !== id);
  } else {
    selectedNgoClaimItems.push(id);
  }
  renderNgoView();
}
window.toggleNgoItemSelection = toggleNgoItemSelection;

export function openNgoClaimModal() {
  if (selectedNgoClaimItems.length === 0) return;
  if (DOM.ngoClaimModal) {
    DOM.ngoClaimModal.classList.add("active");
    const summaryList = document.getElementById("ngo-claim-summary-list");
    const donations = MedReliefStore.getDonations();
    const items = donations.filter((d) => selectedNgoClaimItems.includes(d.id));

    if (summaryList) {
      summaryList.innerHTML = items.map((i) => `
        <li style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
          <span>• ${i.brand_name || i.drug_name}</span>
          <span class="font-mono"><strong>${i.quantity_strips}</strong> strip(s)</span>
        </li>
      `).join("");
    }
    clearSignature();
  }
}
window.openNgoClaimModal = openNgoClaimModal;

function closeNgoClaimModal() {
  if (DOM.ngoClaimModal) DOM.ngoClaimModal.classList.remove("active");
}

function handleNgoClaimSubmit(e) {
  e.preventDefault();
  const ngoName = document.getElementById("ngo-name-select").value;
  const representative = document.getElementById("ngo-rep-name").value.trim();
  const notes = document.getElementById("ngo-purpose-notes").value.trim();
  const proofUrl = document.getElementById("ngo-proof-url").value;

  if (!proofUrl) {
    alert("Physical handover photo proof is strictly required by campus regulations.");
    return;
  }

  if (!hasSignatureDrawn) {
    alert("Please provide the authorized NGO representative signature on the signature pad.");
    return;
  }

  const sigDataUrl = signatureCanvas.toDataURL("image/png");

  MedReliefStore.createNgoClaim({
    ngo_name: ngoName,
    representative,
    proof_photo_url: proofUrl,
    signature_url: sigDataUrl,
    notes,
    donation_ids: selectedNgoClaimItems,
  });

  selectedNgoClaimItems = [];
  closeNgoClaimModal();
  showToast("Distribution Complete!", `Medication handed over to ${ngoName} for free charitable distribution.`);
  renderNgoView();
}

// --- Digital Signature Canvas ---
function initSignaturePad() {
  signatureCanvas = document.getElementById("signature-canvas");
  if (!signatureCanvas) return;
  signatureCtx = signatureCanvas.getContext("2d");
  signatureCtx.lineWidth = 2.5;
  signatureCtx.lineCap = "round";
  signatureCtx.lineJoin = "round";
  signatureCtx.strokeStyle = "#007380"; // Brand Teal

  const startDraw = (e) => {
    isDrawingSignature = true;
    hasSignatureDrawn = true;
    const pos = getCanvasPos(e);
    signatureCtx.beginPath();
    signatureCtx.moveTo(pos.x, pos.y);
  };

  const draw = (e) => {
    if (!isDrawingSignature) return;
    e.preventDefault();
    const pos = getCanvasPos(e);
    signatureCtx.lineTo(pos.x, pos.y);
    signatureCtx.stroke();
    document.getElementById("signature-placeholder").style.display = "none";
  };

  const stopDraw = () => {
    isDrawingSignature = false;
  };

  signatureCanvas.addEventListener("mousedown", startDraw);
  signatureCanvas.addEventListener("mousemove", draw);
  signatureCanvas.addEventListener("mouseup", stopDraw);
  signatureCanvas.addEventListener("mouseleave", stopDraw);

  signatureCanvas.addEventListener("touchstart", startDraw);
  signatureCanvas.addEventListener("touchmove", draw);
  signatureCanvas.addEventListener("touchend", stopDraw);

  const btnClear = document.getElementById("btn-clear-signature");
  if (btnClear) {
    btnClear.addEventListener("click", clearSignature);
  }
}

function clearSignature() {
  if (!signatureCanvas || !signatureCtx) return;
  signatureCtx.clearRect(0, 0, signatureCanvas.width, signatureCanvas.height);
  hasSignatureDrawn = false;
  const placeholder = document.getElementById("signature-placeholder");
  if (placeholder) placeholder.style.display = "flex";
}

function getCanvasPos(e) {
  const rect = signatureCanvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: (clientX - rect.left) * (signatureCanvas.width / rect.width),
    y: (clientY - rect.top) * (signatureCanvas.height / rect.height),
  };
}

// --- Timeline Modal ---
export function openTimelineModal(id) {
  selectedDonationForModal = MedReliefStore.getDonationById(id);
  if (!selectedDonationForModal) return;

  const timelines = MedReliefStore.getTimelines(id);
  const container = document.getElementById("timeline-modal-body");
  if (container) {
    container.innerHTML = `
      <div style="margin-bottom: 16px;">
        <h4 style="font-size: 16px; font-weight: 800; color: var(--text-dark);">${selectedDonationForModal.brand_name || selectedDonationForModal.drug_name}</h4>
        <p style="font-size: 12px; color: var(--text-muted);">Tracking ID: <span class="font-mono">${selectedDonationForModal.id}</span> • Strips: ${selectedDonationForModal.quantity_strips}</p>
      </div>

      <!-- Milestone Stepper -->
      ${renderMilestoneStepperHtml(selectedDonationForModal.status)}

      <h5 style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: var(--text-muted); margin: 20px 0 10px;">
        Chronological Notification & Custody Log
      </h5>

      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${timelines.map((t) => `
          <div style="background: #F9FAFB; border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <span class="status-pill ${t.status.toLowerCase()}">${t.status}</span>
              <span class="font-mono" style="font-size: 10px; color: var(--text-light);">${new Date(t.created_at).toLocaleString()}</span>
            </div>
            <p style="font-size: 12px; color: var(--text-dark); font-weight: 600;">${t.message}</p>
            <div style="margin-top: 6px; font-size: 11px; color: var(--text-muted); display: flex; gap: 12px;">
              <span>📱 SMS: Delivered (${t.sms_details?.recipient_phone || "Student"})</span>
              <span>✉️ Email: Confirmation sent</span>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  if (DOM.timelineModal) DOM.timelineModal.classList.add("active");
}
window.openTimelineModal = openTimelineModal;

function closeTimelineModal() {
  if (DOM.timelineModal) DOM.timelineModal.classList.remove("active");
}

// --- Notification Drawer ---
function openNotificationDrawer() {
  if (DOM.drawerOverlay) DOM.drawerOverlay.classList.add("active");
  if (DOM.drawerPanel) DOM.drawerPanel.classList.add("active");
  unreadNotificationsCount = 0;
  if (DOM.badgeCount) DOM.badgeCount.style.display = "none";
}

function closeNotificationDrawer() {
  if (DOM.drawerOverlay) DOM.drawerOverlay.classList.remove("active");
  if (DOM.drawerPanel) DOM.drawerPanel.classList.remove("active");
}

// --- Toast Notifications ---
function showToastNotification(entry) {
  if (!DOM.toastContainer) return;
  const toast = document.createElement("div");
  toast.className = "toast-item";
  toast.innerHTML = `
    <div class="toast-title">
      <span>🔔 Student Milestone Alert</span>
      <span class="font-mono" style="font-size: 9px; color: var(--text-light);">Just now</span>
    </div>
    <div style="font-size: 12px; font-weight: 700; color: var(--text-dark); margin-top: 2px;">${entry.status}</div>
    <div class="toast-msg">${entry.message}</div>
  `;
  DOM.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

function showToast(title, message) {
  if (!DOM.toastContainer) return;
  const toast = document.createElement("div");
  toast.className = "toast-item";
  toast.innerHTML = `
    <div class="toast-title">
      <span>✓ ${title}</span>
    </div>
    <div style="font-size: 12px; color: var(--text-dark); margin-top: 4px;">${message}</div>
  `;
  DOM.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// --- PWA Service Worker ---
function registerPwaServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    if (DOM.btnPwaInstall) {
      DOM.btnPwaInstall.style.display = "inline-flex";
      DOM.btnPwaInstall.addEventListener("click", () => {
        e.prompt();
      });
    }
  });
}



// ==============================================================================
// SPLASH SCREEN (3-second MedRelief Intro)
// ==============================================================================
(function initSplash() {
  const splash = document.getElementById("splash-screen");
  if (!splash) return;

  // Show only once per session
  if (sessionStorage.getItem("mr_splash_shown")) {
    splash.style.display = "none";
    return;
  }

  const bar = document.getElementById("splash-progress-bar");
  if (bar) {
    requestAnimationFrame(() => { bar.style.width = "100%"; });
  }

  // Smooth auto-dismiss after 3s
  const timer = setTimeout(() => {
    window.hideSplash();
  }, 3000);
  window._splashTimer = timer;
})();

window.hideSplash = function() {
  if (window._splashTimer) clearTimeout(window._splashTimer);
  const splash = document.getElementById("splash-screen");
  if (!splash) return;
  splash.classList.add("fade-out");
  setTimeout(() => { splash.style.display = "none"; }, 650);
  sessionStorage.setItem("mr_splash_shown", "1");
};

// ==============================================================================
// STORIES OF HOPE SLIDER
// ==============================================================================
let currentStory = 0;
const totalStories = 4;
let storyAutoTimer = null;

window.gotoStory = function(index) {
  const prev = document.getElementById(`story-${currentStory}`);
  const next = document.getElementById(`story-${index}`);
  if (prev) { prev.style.display = "none"; prev.classList.remove("active-story"); }
  if (next) { next.style.display = "grid"; next.classList.add("active-story"); }

  document.querySelectorAll(".story-dot").forEach((dot, i) => {
    dot.classList.toggle("active", i === index);
  });
  currentStory = index;
};

function startStoryAutoPlay() {
  if (storyAutoTimer) clearInterval(storyAutoTimer);
  storyAutoTimer = setInterval(() => {
    const next = (currentStory + 1) % totalStories;
    window.gotoStory(next);
  }, 5000);
}
startStoryAutoPlay();

// ==============================================================================
// FAQ ACCORDION
// ==============================================================================
window.toggleFaq = function(headerEl) {
  const item = headerEl.closest(".faq-item");
  const isOpen = item.classList.contains("open");
  // Close all first
  document.querySelectorAll(".faq-item.open").forEach(i => {
    i.classList.remove("open");
    const btn = i.querySelector(".faq-toggle-btn");
    if (btn) btn.textContent = "+";
  });
  if (!isOpen) {
    item.classList.add("open");
    const btn = item.querySelector(".faq-toggle-btn");
    if (btn) btn.textContent = "−";
  }
};

// ==============================================================================
// AUTH MODAL (Login / Register)
// ==============================================================================
currentUser = getCurrentUser();

function updateHeaderAuthUI() {
  const user = getCurrentUser();
  currentUser = user;
  const badge = document.getElementById("user-auth-badge");
  const loginBtn = document.getElementById("btn-auth-open");
  const lockCard = document.getElementById("donor-auth-lock-card");

  if (user) {
    if (badge) {
      badge.style.display = "flex";
      badge.innerHTML = `<span>&#127891;</span> ${user.full_name.split(" ")[0]} <button onclick="window.logoutUser()" style="background:none;border:none;color:var(--accent-dark);font-size:11px;cursor:pointer;font-weight:700;margin-left:4px;">Logout</button>`;
    }
    if (loginBtn) loginBtn.style.display = "none";
    if (lockCard) lockCard.style.display = "none";
  } else {
    if (badge) badge.style.display = "none";
    if (loginBtn) loginBtn.style.display = "inline-flex";
    if (lockCard) lockCard.style.display = "flex";
  }
}

window.openAuthModal = function(mode) {
  const modal = document.getElementById("modal-auth");
  if (modal) modal.classList.add("active");
  window.switchAuthTab(mode || "login");
};

window.switchAuthTab = function(mode) {
  const loginForm = document.getElementById("form-login");
  const regForm = document.getElementById("form-register");
  const loginBtn = document.getElementById("tab-login-btn");
  const regBtn = document.getElementById("tab-register-btn");
  const title = document.getElementById("auth-modal-title");
  if (mode === "login") {
    if (loginForm) loginForm.style.display = "block";
    if (regForm) regForm.style.display = "none";
    if (loginBtn) loginBtn.classList.add("active");
    if (regBtn) regBtn.classList.remove("active");
    if (title) title.innerHTML = "&#127891; Student Login";
  } else {
    if (loginForm) loginForm.style.display = "none";
    if (regForm) regForm.style.display = "block";
    if (loginBtn) loginBtn.classList.remove("active");
    if (regBtn) regBtn.classList.add("active");
    if (title) title.innerHTML = "&#128100; Student Registration";
  }
};

window.logoutUser = function() {
  currentUser = null;
  localStorage.removeItem("mr_current_user");
  updateHeaderAuthUI();
  renderStudentView();
  showToast("Signed Out", "You have logged out. Please sign in to donate.");
};

// Wire up login form
document.addEventListener("DOMContentLoaded", () => {
  updateHeaderAuthUI();

  const formLogin = document.getElementById("form-login");
  if (formLogin) {
    formLogin.addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = document.getElementById("login-username").value.trim();
      const password = document.getElementById("login-password").value;
      const errEl = document.getElementById("login-error");
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (data.success) {
          currentUser = data.user;
          localStorage.setItem("mr_current_user", JSON.stringify(data.user));
          document.getElementById("modal-auth").classList.remove("active");
          updateHeaderAuthUI();
          renderStudentView();
          if (errEl) errEl.style.display = "none";
          // Show toast
          const toastC = document.getElementById("toast-container");
          if (toastC) {
            const t = document.createElement("div");
            t.className = "toast-item";
            t.innerHTML = `<div class="toast-title">&#10003; Welcome back, ${data.user.full_name.split(" ")[0]}!</div><div style="font-size:12px;color:var(--text-dark);margin-top:4px;">You are now logged in as a registered campus donor.</div>`;
            toastC.appendChild(t);
            setTimeout(() => t.remove(), 4000);
          }
        } else {
          if (errEl) { errEl.textContent = data.error; errEl.style.display = "block"; }
        }
      } catch(err) {
        if (errEl) { errEl.textContent = "Login failed. Is the server running?"; errEl.style.display = "block"; }
      }
    });
  }

  const formRegister = document.getElementById("form-register");
  if (formRegister) {
    formRegister.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errEl = document.getElementById("reg-error");
      const body = {
        full_name: document.getElementById("reg-name").value.trim(),
        roll_number: document.getElementById("reg-roll").value.trim(),
        division: document.getElementById("reg-division").value.trim(),
        phone: document.getElementById("reg-phone").value.trim(),
        email: document.getElementById("reg-email").value.trim(),
        password: document.getElementById("reg-password").value,
      };
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.success) {
          currentUser = data.student;
          localStorage.setItem("mr_current_user", JSON.stringify(data.student));
          document.getElementById("modal-auth").classList.remove("active");
          updateHeaderAuthUI();
          renderStudentView();
          if (errEl) errEl.style.display = "none";
          const toastC = document.getElementById("toast-container");
          if (toastC) {
            const t = document.createElement("div");
            t.className = "toast-item";
            t.innerHTML = `<div class="toast-title">&#10003; Registration Successful!</div><div style="font-size:12px;color:var(--text-dark);margin-top:4px;">Welcome, ${data.student.full_name}! A welcome email has been dispatched.</div>`;
            toastC.appendChild(t);
            setTimeout(() => t.remove(), 5000);
          }
        } else {
          if (errEl) { errEl.textContent = data.error; errEl.style.display = "block"; }
        }
      } catch(err) {
        if (errEl) { errEl.textContent = "Registration failed. Is the server running?"; errEl.style.display = "block"; }
      }
    });
  }

  // Feedback Form
  const formFeedback = document.getElementById("form-feedback");
  if (formFeedback) {
    // Star Rating Interaction
    const starBtns = document.querySelectorAll(".star-btn");
    const ratingInput = document.getElementById("fb-rating");
    starBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        const val = Number(btn.dataset.val);
        if (ratingInput) ratingInput.value = val;
        starBtns.forEach((s, i) => s.classList.toggle("active", i < val));
      });
    });

    formFeedback.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = {
        name: document.getElementById("fb-name").value.trim(),
        roll_number: document.getElementById("fb-roll").value.trim() || "Campus Visitor",
        rating: Number(document.getElementById("fb-rating").value),
        category: document.getElementById("fb-category").value,
        message: document.getElementById("fb-message").value.trim(),
      };
      if (currentUser) { body.email = currentUser.email; }
      try {
        const res = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.success) {
          formFeedback.reset();
          document.getElementById("fb-rating").value = "5";
          starBtns.forEach((s, i) => s.classList.toggle("active", i < 4));
          loadFeedbackWall();
          const toastC = document.getElementById("toast-container");
          if (toastC) {
            const t = document.createElement("div");
            t.className = "toast-item";
            t.innerHTML = `<div class="toast-title">&#10003; Thank you for your feedback!</div>`;
            toastC.appendChild(t);
            setTimeout(() => t.remove(), 3000);
          }
        }
      } catch(err) {
        // Fall through – demo mode
        loadFeedbackWall();
      }
    });
  }

  // Load dynamic feedback wall
  loadFeedbackWall();

  // Load team slider
  renderTeamSlider();

  // NGO Suggestion on Drug Name input
  const drugInput = document.getElementById("form-drug-name");
  const brandInput = document.getElementById("form-brand-name");
  if (drugInput) {
    let ngoSuggestTimer = null;
    const triggerSuggest = () => {
      clearTimeout(ngoSuggestTimer);
      const query = drugInput.value.trim() || brandInput?.value.trim() || "";
      if (!query) {
        const box = document.getElementById("ngo-suggestion-box");
        if (box) box.style.display = "none";
        return;
      }
      ngoSuggestTimer = setTimeout(() => fetchNgoSuggestion(query), 350);
    };
    drugInput.addEventListener("input", triggerSuggest);
    if (brandInput) brandInput.addEventListener("input", triggerSuggest);
  }

  // About page impact stats sync
  syncAboutStats();
});

async function loadFeedbackWall() {
  const wall = document.getElementById("feedback-wall");
  if (!wall) return;
  try {
    const res = await fetch("/api/feedback");
    const data = await res.json();
    if (data.success && data.feedback && data.feedback.length > 0) {
      renderFeedbackCards(data.feedback);
      return;
    }
  } catch(e) {}
  renderFeedbackCards([]);
}

function renderFeedbackCards(feedbackList) {
  const wall = document.getElementById("feedback-wall");
  if (!wall) return;
  if (!feedbackList || feedbackList.length === 0) {
    wall.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 36px 20px; color: var(--text-muted); background: rgba(255,255,255,0.7); border: 1.5px dashed var(--border-color); border-radius: var(--radius-md);">
        <div style="font-size: 28px; margin-bottom: 6px;">💬</div>
        <h4 style="font-size: 14px; font-weight: 700; color: var(--text-dark);">No Community Reviews Yet</h4>
        <p style="font-size: 12px; margin-top: 4px;">Be the first to share your experience with the MedRelief platform using the form above!</p>
      </div>
    `;
    return;
  }
  const stars = (n) => "★".repeat(Number(n || 5)) + "☆".repeat(5 - Number(n || 5));
  const themes = ["theme-warm", "theme-blue", "theme-green", "theme-purple"];
  const watermarks = ["🎓", "💊", "🌱", "🛡️"];

  wall.innerHTML = feedbackList.map((f, idx) => {
    const theme = themes[idx % themes.length];
    const wm = watermarks[idx % watermarks.length];
    const initials = (f.name || "Student").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
    const avatarUrl = f.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(f.name || 'User')}&backgroundColor=007380,6EB56F,3b82f6`;

    return `
      <div class="feedback-card-modern ${theme}">
        <div class="fb-quote-icon">“</div>
        <div class="fb-watermark-icon">${wm}</div>
        <div class="fb-body-text">
          ${f.message}
          <div class="fb-stars-row">${stars(f.rating)}</div>
        </div>
        <div class="fb-user-row">
          <img class="fb-avatar" src="${avatarUrl}" alt="${f.name}" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\\'fb-avatar\\'>${initials}</div>';" />
          <div class="fb-user-details">
            <h5>${f.name}</h5>
            <p>${f.roll_number ? `Roll: ${f.roll_number}` : 'Campus Donor'} • ${f.category || 'General'}</p>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

async function fetchNgoSuggestion(query) {
  const box = document.getElementById("ngo-suggestion-box");
  const nameEl = document.getElementById("ngo-suggest-name");
  const focusEl = document.getElementById("ngo-suggest-focus");
  if (!box) return;
  try {
    const res = await fetch(`/api/ngo/suggest?drug=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (data.success && data.suggestedNgo) {
      if (nameEl) nameEl.textContent = data.suggestedNgo;
      const matched = data.allSuggestions?.[0];
      if (focusEl && matched) focusEl.textContent = matched.focus || "Charitable healthcare";
      box.style.display = "block";
    }
  } catch(e) {
    if (nameEl) nameEl.textContent = "Red Cross Mobile Health Wing";
    if (focusEl) focusEl.textContent = "Mobile Health Camps & Emergency Village Outreach";
    box.style.display = "block";
  }
}

// ==============================================================================
// TEAM SLIDER
// ==============================================================================
const TEAM_MEMBERS = [
  { emoji: "👩‍💻", name: "Prof. Dr. Anjali Desai", role: "Faculty Mentor", dept: "Academic Faculty Mentor" },
  { emoji: "💊", name: "Dr. S. K. Mehta", role: "Chief Pharmacist Auditor", dept: "Licensed Reg. #MH-PH-88231" },
  { emoji: "🧑‍🎓", name: "Aarav Sharma", role: "Platform Lead Developer", dept: "Lead Full-Stack Tech" },
  { emoji: "👩‍🎓", name: "Priya Nair", role: "NGO Coordination & Outreach", dept: "Student Welfare Lead" },
  { emoji: "🧑‍🎓", name: "Rohan Kulkarni", role: "Campus Collector Coordinator", dept: "Campus Logistics Lead" },
  { emoji: "👩‍⚕️", name: "Dr. Ramya Pillai", role: "Medical Advisor", dept: "Clinical Health Sciences Advisor" },
  { emoji: "🏥", name: "Dr. Matthew Joseph", role: "Red Cross NGO Liaison", dept: "Red Cross Mobile Health Wing" },
  { emoji: "🧑‍💻", name: "Ananya Deshmukh", role: "UI/UX Design Lead", dept: "Design Systems Lead" },
];

let teamOffset = 0;
const teamVisibleCount = () => window.innerWidth < 640 ? 1 : window.innerWidth < 1024 ? 2 : 3;

function renderTeamSlider() {
  const track = document.getElementById("team-cards-track");
  if (!track) return;
  track.innerHTML = TEAM_MEMBERS.map(m => `
    <div class="team-worker-card">
      <div class="team-avatar-wrap">${m.emoji}</div>
      <div class="team-worker-name">${m.name}</div>
      <div class="team-worker-role">${m.role}</div>
      <div class="team-worker-dept">${m.dept}</div>
    </div>
  `).join("");
}

window.slideTeam = function(dir) {
  const track = document.getElementById("team-cards-track");
  if (!track) return;
  const visible = teamVisibleCount();
  const maxOffset = Math.max(0, TEAM_MEMBERS.length - visible);
  teamOffset = Math.max(0, Math.min(maxOffset, teamOffset + dir));
  const cardWidth = track.querySelector(".team-worker-card")?.offsetWidth || 240;
  const gap = 16;
  track.style.transform = `translateX(-${teamOffset * (cardWidth + gap)}px)`;
};

// Auto-slide team every 3s
setInterval(() => {
  if (document.getElementById("tab-about")?.classList.contains("active")) {
    const visible = teamVisibleCount();
    const max = Math.max(0, TEAM_MEMBERS.length - visible);
    teamOffset = teamOffset >= max ? 0 : teamOffset + 1;
    const track = document.getElementById("team-cards-track");
    if (track) {
      const cardWidth = track.querySelector(".team-worker-card")?.offsetWidth || 240;
      track.style.transform = `translateX(-${teamOffset * (cardWidth + 16)}px)`;
    }
  }
}, 3000);

// ==============================================================================
// ABOUT PAGE IMPACT STATS SYNC
// ==============================================================================
async function syncAboutStats() {
  try {
    const res = await fetch("/api/admin/metrics");
    const data = await res.json();
    if (!data.success) return;
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl("about-stat-strips", data.totalStrips);
    setEl("about-stat-kg", data.totalKg);
    setEl("about-stat-donors", data.totalStudents);
    setEl("about-stat-ngo", data.totalClaims);
  } catch(e) {}
}

// ==============================================================================
// ABOUT PAGE INITIATIVE & TIMELINE SCROLL ANIMATIONS
// ==============================================================================
function initAboutAnimations() {
  const cards = document.querySelectorAll(".initiative-card");
  cards.forEach((card, idx) => {
    setTimeout(() => {
      card.classList.add("in-view");
    }, 80 + idx * 100);
  });

  const timelineItems = document.querySelectorAll(".about-timeline-item");
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
        }
      });
    }, { threshold: 0.15 });

    timelineItems.forEach(item => observer.observe(item));
  } else {
    timelineItems.forEach(item => item.classList.add("in-view"));
  }
}
window.initAboutAnimations = initAboutAnimations;

// Re-sync about stats when About tab opens
const origSwitchTab = window.switchTab;
window.switchTab = function(tabId) {
  origSwitchTab(tabId);
  if (tabId === "about") {
    syncAboutStats();
    renderTeamSlider();
    initAboutAnimations();
  } else if (tabId === "student") {
    renderStudentView();
    updateHeaderAuthUI();
  }
};
