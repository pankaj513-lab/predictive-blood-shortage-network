const test = require("node:test");
const assert = require("node:assert/strict");

const V = require("../src/validators.js");

test("escapeHtml neutralizes XSS vectors cleanly", () => {
  assert.equal(
    V.escapeHtml(`<img src=x onerror="alert('xss')"> & test`),
    "&lt;img src=x onerror=&quot;alert(&#39;xss&#39;)&quot;&gt; &amp; test"
  );
  assert.equal(V.escapeHtml(null), "");
  assert.equal(V.escapeHtml(undefined), "");
});

test("isValidEmail and normalizeCode enforce formatting rules", () => {
  assert.equal(V.isValidEmail("doctor@kem.org"), true);
  assert.equal(V.isValidEmail("bad-email"), false);
  assert.equal(V.isValidEmail(""), false);
  assert.equal(V.normalizeCode("  hosp-jh-01 "), "HOSP-JH-01");
});

test("evaluatePasswordStrength classifies Empty, Weak, Fair, Good, and Strong passwords", () => {
  assert.equal(V.evaluatePasswordStrength("").label, "Empty");
  assert.equal(V.evaluatePasswordStrength("abc").label, "Weak");
  assert.equal(V.evaluatePasswordStrength("abc").valid, false);
  assert.equal(V.evaluatePasswordStrength("abcdefgh").label, "Weak");
  assert.equal(V.evaluatePasswordStrength("abcdefgh").valid, false);
  assert.equal(V.evaluatePasswordStrength("Abcdefgh").label, "Fair");
  assert.equal(V.evaluatePasswordStrength("Abcdefgh").valid, true);
  assert.equal(V.evaluatePasswordStrength("Abcdef12").label, "Good");
  assert.equal(V.evaluatePasswordStrength("Pbsn#Strong2026!").label, "Strong");
  assert.equal(V.evaluatePasswordStrength("Pbsn#Strong2026!").pct, 100);
});

test("validateBloodRequestInput rejects invalid units/groups and accepts valid emergency request", () => {
  assert.equal(V.validateBloodRequestInput({}).ok, false);
  assert.equal(
    V.validateBloodRequestInput({
      request_reference: "REQ-JH-1",
      blood_group: "Z+",
      units_required: 3,
      hospital_name: "RIMS Ranchi",
      city: "Ranchi",
      contact_phone: "9876543210"
    }).ok,
    false
  );
  assert.equal(
    V.validateBloodRequestInput({
      request_reference: "REQ-JH-1",
      blood_group: "O-",
      units_required: 150,
      hospital_name: "RIMS Ranchi",
      city: "Ranchi",
      contact_phone: "9876543210"
    }).ok,
    false
  );
  assert.equal(
    V.validateBloodRequestInput({
      request_reference: "REQ-JH-1",
      blood_group: "O-",
      units_required: 4,
      hospital_name: "RIMS Ranchi",
      city: "Ranchi",
      contact_phone: "9876543210"
    }).ok,
    true
  );
});

test("validateDepartmentLoginInput & validateDepartmentBloodRequestInput enforce clinical constraints", () => {
  assert.equal(
    V.validateDepartmentLoginInput({
      hospitalCode: "",
      departmentCode: "DEPT-EMG",
      email: "emg@rims.org",
      password: "secret"
    }).ok,
    false
  );
  assert.equal(
    V.validateDepartmentLoginInput({
      hospitalCode: "JH-RNC-RIMS",
      departmentCode: "DEPT-EMG",
      email: "emg@rims.org",
      password: "Password123!"
    }).ok,
    true
  );

  assert.equal(
    V.validateDepartmentBloodRequestInput({
      blood_group: "O-",
      units_required: 3,
      patient_reference: "PAT-01",
      urgency_level: "Critical",
      required_datetime: "2026-11-26T16:00",
      staff_name: "Dr. Sinha"
    }).ok,
    true
  );
  assert.equal(
    V.validateDepartmentBloodRequestInput({
      blood_group: "O-",
      units_required: 0,
      patient_reference: "PAT-01",
      urgency_level: "Critical",
      required_datetime: "2026-11-26T16:00",
      staff_name: "Dr. Sinha"
    }).ok,
    false
  );
});

test("validateReportPayload validates required fields and status enum", () => {
  assert.equal(
    V.validateReportPayload({
      title: "Hi",
      description: "Desc here",
      content: "Full content text",
      publication_status: "published"
    }).ok,
    false
  );
  assert.equal(
    V.validateReportPayload({
      title: "Jharkhand Forecast Report",
      description: "Weekly regional audit",
      content: "Detailed Jharkhand blood inventory analysis across 24 districts.",
      publication_status: "published"
    }).ok,
    true
  );
});
