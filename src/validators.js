/**
 * PBSN — Shared Pure Validation & Security Helpers
 * Dual-exported for both Browser (<script defer>) and Node.js unit testing.
 */
(function (global) {
  "use strict";

  const VALID_BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
  const VALID_URGENCIES = ["Critical", "High", "Scheduled", "Recurring", "Routine"];
  const VALID_DEPT_STATUSES = ["Pending", "Under Review", "Approved", "Fulfilled", "Rejected"];

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
  }

  function normalizeCode(code) {
    return String(code || "").trim().toUpperCase();
  }

  function evaluatePasswordStrength(pw) {
    const val = String(pw || "");
    if (!val) return { score: 0, pct: 0, label: "Empty", valid: false };
    let score = 0;
    if (val.length >= 8) score++;
    if (val.length >= 12) score++;
    if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;

    let label = "Weak";
    let pct = 25;
    if (score === 2) {
      label = "Fair";
      pct = 50;
    } else if (score === 3 || score === 4) {
      label = "Good";
      pct = 78;
    } else if (score >= 5) {
      label = "Strong";
      pct = 100;
    }

    return {
      score,
      pct,
      label,
      valid: val.length >= 8 && score >= 2
    };
  }

  function validateBloodRequestInput(payload) {
    const p = payload || {};
    const units = Number(p.units_required);
    if (!String(p.request_reference || "").trim() || String(p.request_reference).trim().length < 2) {
      return { ok: false, error: "Request reference is required (min 2 chars)." };
    }
    if (!VALID_BLOOD_GROUPS.includes(p.blood_group)) {
      return { ok: false, error: "Invalid blood group." };
    }
    if (!Number.isInteger(units) || units < 1 || units > 100) {
      return { ok: false, error: "Units required must be an integer between 1 and 100." };
    }
    if (String(p.hospital_name || "").trim().length < 2 || String(p.city || "").trim().length < 2) {
      return { ok: false, error: "Hospital name and city are required." };
    }
    if (String(p.contact_phone || "").trim().length < 5) {
      return { ok: false, error: "Valid contact phone/desk is required." };
    }
    return { ok: true };
  }

  function validateDepartmentLoginInput({ hospitalCode, departmentCode, email, password }) {
    if (!normalizeCode(hospitalCode)) {
      return { ok: false, error: "Hospital ID is required." };
    }
    if (!normalizeCode(departmentCode)) {
      return { ok: false, error: "Department ID is required." };
    }
    if (!isValidEmail(email)) {
      return { ok: false, error: "Valid official email address is required." };
    }
    if (!String(password || "")) {
      return { ok: false, error: "Password is required." };
    }
    return { ok: true };
  }

  function validateDepartmentBloodRequestInput(payload) {
    const p = payload || {};
    const units = Number(p.units_required);
    if (!VALID_BLOOD_GROUPS.includes(p.blood_group)) {
      return { ok: false, error: "Select a valid blood group." };
    }
    if (!Number.isInteger(units) || units < 1 || units > 100) {
      return { ok: false, error: "Units required must be between 1 and 100." };
    }
    if (String(p.patient_reference || "").trim().length < 2) {
      return { ok: false, error: "Patient Reference ID (min 2 chars) is required." };
    }
    if (!VALID_URGENCIES.includes(p.urgency_level)) {
      return { ok: false, error: "Select a valid medical urgency level." };
    }
    if (!p.required_datetime || Number.isNaN(Date.parse(p.required_datetime))) {
      return { ok: false, error: "Valid required date and time is required." };
    }
    if (String(p.staff_name || "").trim().length < 2) {
      return { ok: false, error: "Doctor or authorized staff name is required." };
    }
    return { ok: true };
  }

  function validateReportPayload(payload) {
    const p = payload || {};
    if (String(p.title || "").trim().length < 3) {
      return { ok: false, error: "Report title must be at least 3 characters." };
    }
    if (String(p.description || "").trim().length < 5) {
      return { ok: false, error: "Short description must be at least 5 characters." };
    }
    if (String(p.content || "").trim().length < 10) {
      return { ok: false, error: "Report content must be at least 10 characters." };
    }
    if (!["draft", "published"].includes(p.publication_status)) {
      return { ok: false, error: "Report status must be draft or published." };
    }
    return { ok: true };
  }

  const api = {
    VALID_BLOOD_GROUPS,
    VALID_URGENCIES,
    VALID_DEPT_STATUSES,
    escapeHtml,
    isValidEmail,
    normalizeCode,
    evaluatePasswordStrength,
    validateBloodRequestInput,
    validateDepartmentLoginInput,
    validateDepartmentBloodRequestInput,
    validateReportPayload
  };

  global.PBSN_VALIDATORS = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
