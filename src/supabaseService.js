/**
 * PBSN — Reusable Supabase Data, Auth & Storage Services
 * Connects all public forms, AI prediction storage, inventory, and Admin Panel
 * directly to Supabase PostgreSQL, Supabase Auth, and Supabase Storage.
 */
(function (global) {
  "use strict";

  async function sb() {
    return global.PBSN_SUPABASE.getSupabase();
  }

  // ── 1. Public Data Retrieval ─────────────────────────────────────────────
  async function fetchBloodBanks() {
    const client = await sb();
    const { data, error } = await client.from("blood_banks").select("*").order("city", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function fetchBloodInventory() {
    const client = await sb();
    const { data, error } = await client.from("blood_inventory").select("*").order("city", { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function fetchPublishedReports() {
    const client = await sb();
    const { data, error } = await client
      .from("reports")
      .select("*")
      .eq("publication_status", "published")
      .order("report_date", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  // ── 2. Public Form Submissions (Strict DB Confirmation) ──────────────────
  async function submitBloodRequest(payload) {
    const client = await sb();
    const { error } = await client.from("blood_requests").insert([
      {
        request_reference: payload.request_reference,
        patient_reference: payload.patient_reference || payload.request_reference,
        blood_group: payload.blood_group,
        units_required: Number(payload.units_required),
        hospital_name: payload.hospital_name,
        hospital_address: payload.hospital_address || null,
        city: payload.city,
        state: payload.state || null,
        contact_name: payload.contact_name || "Hospital Desk",
        contact_phone: payload.contact_phone,
        urgency_level: payload.urgency_level,
        request_status: "Pending"
      }
    ]);
    if (error) throw error;
    return { ok: true };
  }

  async function submitDonorInquiry(payload) {
    const client = await sb();
    const { error } = await client.from("donor_inquiries").insert([
      {
        donor_name: payload.donor_name,
        blood_group: payload.blood_group,
        city: payload.city,
        state: payload.state || null,
        phone: payload.phone || null,
        email: payload.email || null,
        availability_status: payload.availability_status,
        consent_to_contact: Boolean(payload.consent_to_contact)
      }
    ]);
    if (error) throw error;
    return { ok: true };
  }

  async function submitContactInquiry(payload) {
    const client = await sb();
    const { error } = await client.from("contact_inquiries").insert([
      {
        name: payload.name,
        email: payload.email,
        phone: payload.phone || null,
        subject: payload.subject,
        message: payload.message,
        inquiry_status: "New"
      }
    ]);
    if (error) throw error;
    return { ok: true };
  }

  // ── 3. AI Prediction Storage ─────────────────────────────────────────────
  async function savePredictionResult(pred) {
    const client = await sb();
    const { error } = await client.from("shortage_predictions").insert([
      {
        blood_group: pred.group,
        region: pred.region,
        predicted_demand: Math.round(pred.predictedDemand),
        available_inventory: Math.round(pred.availableInventory),
        shortage_risk: pred.riskLevel,
        forecast_period: `${pred.periodDays} Days`,
        prediction_result: {
          daysToDepletion: pred.daysToDepletion,
          shortagePeriod: pred.shortagePeriod,
          inventoryStatus: pred.inventoryStatus,
          suggestedAction: pred.suggestedAction,
          isTrainedMLModel: Boolean(pred.isTrainedMLModel),
          disclaimer: pred.demoModelNote
        },
        model_version: pred.isTrainedMLModel ? "ml-model-v1" : "demo-heuristic-v1"
      }
    ]);
    if (error) throw error;
    return { ok: true };
  }

  // ── 4. Supabase Auth & Admin Verification ────────────────────────────────
  async function signInAdmin(email, password) {
    const client = await sb();
    const cleanEmail = String(email || "").trim().toLowerCase();
    const { data, error } = await client.auth.signInWithPassword({ email: cleanEmail, password });
    if (error) {
      if (/email not confirmed/i.test(error.message || "")) {
        throw new Error(
          "Email not confirmed in Supabase Auth. Please confirm this account's email link or confirm it in Supabase Dashboard before signing in."
        );
      }
      throw error;
    }

    const { data: adminRow, error: adminErr } = await client
      .from("admin_users")
      .select("user_id, email, full_name")
      .eq("user_id", data.user.id)
      .maybeSingle();

    if (adminRow) return adminRow;

    // If email confirmation delayed post-signup bootstrap and no admins exist yet, attempt first-admin registration now.
    const metaName =
      (data.user.user_metadata && data.user.user_metadata.full_name) || "PBSN Administrator";
    const { data: bootstrapped, error: bootErr } = await client
      .from("admin_users")
      .insert([{ user_id: data.user.id, email: data.user.email || cleanEmail, full_name: metaName }])
      .select("user_id, email, full_name")
      .maybeSingle();

    if (!bootErr && bootstrapped) {
      return bootstrapped;
    }

    if (adminErr || !adminRow) {
      await client.auth.signOut();
      throw new Error("Authenticated user is not registered as an authorized PBSN administrator.");
    }
    return adminRow;
  }

  async function bootstrapFirstAdmin(fullName, email, password) {
    const client = await sb();
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanName = String(fullName || "").trim() || "PBSN Administrator";
    const { data, error } = await client.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { full_name: cleanName } }
    });
    if (error) {
      const msg = error.message || "";
      if (/rate limit/i.test(msg) || error.code === "over_email_send_rate_limit" || error.status === 429) {
        throw new Error(
          "Supabase email rate limit reached (default SMTP limits confirmation emails to 2/hour). Sign in above with an existing confirmed admin account, or disable 'Confirm email' / add Custom SMTP in Supabase Dashboard → Authentication → Providers → Email."
        );
      }
      if (/already registered/i.test(msg)) {
        throw new Error("This email is already registered. Please sign in using the Admin Login form above.");
      }
      throw error;
    }
    if (!data.session || !data.user) {
      throw new Error(
        "Account created! Please confirm the verification email sent to " +
          cleanEmail +
          ", then sign in using the Admin Login form above."
      );
    }
    const { error: insErr } = await client.from("admin_users").insert([
      { user_id: data.user.id, email: cleanEmail, full_name: cleanName }
    ]);
    if (insErr) {
      await client.auth.signOut();
      throw new Error(insErr.message || "First-admin bootstrap failed (an administrator may already exist).");
    }
    return { user_id: data.user.id, email: cleanEmail, full_name: cleanName };
  }

  async function getAdminSession() {
    const client = await sb();
    const { data: sessData } = await client.auth.getSession();
    if (!sessData || !sessData.session) return null;
    const uid = sessData.session.user.id;
    const { data: adminRow, error } = await client
      .from("admin_users")
      .select("user_id, email, full_name")
      .eq("user_id", uid)
      .maybeSingle();
    if (error || !adminRow) return null;
    return adminRow;
  }

  async function signOutAdmin() {
    const client = await sb();
    await client.auth.signOut();
  }

  // ── 5. Admin Management Services (Reports, Storage, Inquiries, Inventory) ─
  async function fetchAdminReports() {
    const client = await sb();
    const { data, error } = await client.from("reports").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function createReport(payload) {
    const client = await sb();
    const { data: sess } = await client.auth.getSession();
    const uid = sess?.session?.user?.id || null;
    const { data, error } = await client
      .from("reports")
      .insert([{ ...payload, created_by: uid }])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function updateReport(id, payload) {
    const client = await sb();
    const { data, error } = await client
      .from("reports")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function deleteReport(id) {
    const client = await sb();
    const { error } = await client.from("reports").delete().eq("id", id);
    if (error) throw error;
  }

  async function uploadStorageFile(bucket, file) {
    const client = await sb();
    const clean = file.name.replace(/[^A-Za-z0-9._-]+/g, "_");
    const path = `${Date.now()}_${clean}`;
    const { error } = await client.storage.from(bucket).upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || "application/octet-stream"
    });
    if (error) throw error;
    return {
      bucket,
      file_path: path,
      file_type: file.type || clean.split(".").pop(),
      file_size: file.size,
      publicUrl: bucket === "pbsn-images" ? client.storage.from(bucket).getPublicUrl(path).data.publicUrl : null
    };
  }

  async function downloadReportStorageFile(filePath, filename) {
    const client = await sb();
    const { data, error } = await client.storage.from("pbsn-reports").download(filePath);
    if (error) throw error;
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || filePath.split("/").pop();
    a.click();
    URL.revokeObjectURL(url);
  }

  async function fetchAdminInquiriesAndRequests() {
    const client = await sb();
    const [reqs, donors, contacts] = await Promise.all([
      client.from("blood_requests").select("*").order("created_at", { ascending: false }),
      client.from("donor_inquiries").select("*").order("created_at", { ascending: false }),
      client.from("contact_inquiries").select("*").order("created_at", { ascending: false })
    ]);
    if (reqs.error) throw reqs.error;
    if (donors.error) throw donors.error;
    if (contacts.error) throw contacts.error;
    return {
      bloodRequests: reqs.data || [],
      donorInquiries: donors.data || [],
      contactInquiries: contacts.data || []
    };
  }

  async function updateBloodRequestStatus(id, status) {
    const client = await sb();
    const { error } = await client
      .from("blood_requests")
      .update({ request_status: status, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  }

  async function updateInventoryRow(id, availableUnits, reservedUnits) {
    const client = await sb();
    const { error } = await client
      .from("blood_inventory")
      .update({
        available_units: Number(availableUnits),
        reserved_units: Number(reservedUnits),
        last_updated: new Date().toISOString()
      })
      .eq("id", id);
    if (error) throw error;
  }

  // ── 6. Hospital Department Portal & Multi-Tenant Admin Services ─────────
  const STANDARD_DEPARTMENTS = [
    { department_code: "DEPT-EMG", department_name: "Emergency Department", default_role: "department_staff" },
    { department_code: "DEPT-ICU", department_name: "Intensive Care Unit (ICU)", default_role: "department_staff" },
    { department_code: "DEPT-BBK", department_name: "Blood Bank Department", default_role: "blood_bank_officer" },
    { department_code: "DEPT-SRG", department_name: "Surgery Department", default_role: "department_staff" },
    { department_code: "DEPT-ONC", department_name: "Oncology Department", default_role: "department_staff" },
    { department_code: "DEPT-MAT", department_name: "Maternity Department", default_role: "department_staff" },
    { department_code: "DEPT-MED", department_name: "General Medicine", default_role: "department_staff" },
    { department_code: "DEPT-ADM", department_name: "Hospital Administration", default_role: "hospital_admin" }
  ];

  function translateSupabaseAuthError(error, context = "login") {
    const msg = (error && error.message) || "";
    if (/email not confirmed/i.test(msg)) {
      return new Error(
        "Email not confirmed in Supabase Auth. Confirm the verification link (or ask your PBSN administrator to confirm the account)."
      );
    }
    if (/rate limit/i.test(msg) || error?.code === "over_email_send_rate_limit" || error?.status === 429) {
      return new Error(
        "Supabase Auth email rate limit exceeded (default SMTP limits 2 emails/hour). Sign in directly if already confirmed, or ask an admin to disable 'Confirm email' / configure Custom SMTP."
      );
    }
    if (/email_address_not_authorized/i.test(msg) || /not authorized/i.test(msg)) {
      return new Error(
        "Built-in Supabase SMTP only delivers confirmation emails to workspace team members. Disable 'Confirm email' or configure Custom SMTP in Supabase Auth."
      );
    }
    if (context === "activate" && /already registered/i.test(msg)) {
      return new Error("This official email already has a password in Supabase Auth. Please use the Sign In tab above.");
    }
    return error instanceof Error ? error : new Error(msg || "Authentication error.");
  }

  function applyRememberPreference(rememberMe, { hospitalCode, departmentCode, email }) {
    if (rememberMe) {
      localStorage.setItem(
        "pbsn_dept_remember",
        JSON.stringify({ hospitalCode, departmentCode, email })
      );
      localStorage.removeItem("pbsn_dept_ephemeral_flag");
      sessionStorage.removeItem("pbsn_dept_ephemeral");
    } else {
      localStorage.removeItem("pbsn_dept_remember");
      localStorage.setItem("pbsn_dept_ephemeral_flag", "1");
      sessionStorage.setItem("pbsn_dept_ephemeral", "1");
    }
  }

  function getRememberedDepartmentFields() {
    try {
      const raw = localStorage.getItem("pbsn_dept_remember");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async function signInDepartmentUser({ hospitalCode, departmentCode, email, password, rememberMe }) {
    const client = await sb();
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanHosp = String(hospitalCode || "").trim().toUpperCase();
    const cleanDept = String(departmentCode || "").trim().toUpperCase();

    const { error: authErr } = await client.auth.signInWithPassword({ email: cleanEmail, password });
    if (authErr) throw translateSupabaseAuthError(authErr, "login");

    const { data: profile, error: rpcErr } = await client.rpc("verify_department_login", {
      p_hospital_code: cleanHosp,
      p_department_code: cleanDept
    });

    if (rpcErr || !profile) {
      await client.auth.signOut();
      throw new Error((rpcErr && rpcErr.message) || "Hospital or Department access verification failed.");
    }

    applyRememberPreference(Boolean(rememberMe), {
      hospitalCode: profile.hospital_code,
      departmentCode: profile.department_code,
      email: cleanEmail
    });

    return profile;
  }

  async function activateDepartmentInvite({ hospitalCode, departmentCode, email, password }) {
    const client = await sb();
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanHosp = String(hospitalCode || "").trim().toUpperCase();
    const cleanDept = String(departmentCode || "").trim().toUpperCase();

    const { data, error } = await client.auth.signUp({ email: cleanEmail, password });
    if (error) throw translateSupabaseAuthError(error, "activate");

    if (!data.session || !data.user) {
      throw new Error(
        "Credentials created! Confirm the email link sent to " +
          cleanEmail +
          " (or have an admin confirm in Supabase Auth), then sign in with your Hospital ID & Department ID."
      );
    }

    const { data: profile, error: rpcErr } = await client.rpc("verify_department_login", {
      p_hospital_code: cleanHosp,
      p_department_code: cleanDept
    });

    if (rpcErr || !profile) {
      await client.auth.signOut();
      throw new Error(
        (rpcErr && rpcErr.message) ||
          "This email/hospital/department combination has not been invited by an administrator yet."
      );
    }

    applyRememberPreference(true, {
      hospitalCode: profile.hospital_code,
      departmentCode: profile.department_code,
      email: cleanEmail
    });
    return profile;
  }

  async function requestDepartmentPasswordReset(email) {
    const client = await sb();
    const cleanEmail = String(email || "").trim().toLowerCase();
    const redirectTo = window.location.origin + "/hospital-login.html";
    const { error } = await client.auth.resetPasswordForEmail(cleanEmail, { redirectTo });
    if (error) throw translateSupabaseAuthError(error, "reset");
    return { ok: true };
  }

  async function updateDepartmentPassword(newPassword) {
    const client = await sb();
    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) throw translateSupabaseAuthError(error, "reset");
    return { ok: true };
  }

  async function getDepartmentSession() {
    if (
      localStorage.getItem("pbsn_dept_ephemeral_flag") === "1" &&
      !sessionStorage.getItem("pbsn_dept_ephemeral")
    ) {
      try {
        const client = await sb();
        await client.auth.signOut();
      } catch {}
      localStorage.removeItem("pbsn_dept_ephemeral_flag");
      return null;
    }

    const client = await sb();
    const { data: sessData } = await client.auth.getSession();
    if (!sessData || !sessData.session) return null;

    const uid = sessData.session.user.id;
    const { data, error } = await client
      .from("department_users")
      .select(
        `
        id, auth_user_id, hospital_id, department_id, full_name, official_email, role, is_active, created_at,
        hospitals ( id, hospital_name, hospital_code, address, city, state ),
        hospital_departments ( id, department_name, department_code )
      `
      )
      .eq("auth_user_id", uid)
      .eq("is_active", true)
      .maybeSingle();

    if (error || !data || !data.hospitals || !data.hospital_departments) return null;
    return {
      ...data,
      hospital_name: data.hospitals.hospital_name,
      hospital_code: data.hospitals.hospital_code,
      city: data.hospitals.city,
      state: data.hospitals.state,
      department_name: data.hospital_departments.department_name,
      department_code: data.hospital_departments.department_code
    };
  }

  async function signOutDepartment() {
    localStorage.removeItem("pbsn_dept_ephemeral_flag");
    sessionStorage.removeItem("pbsn_dept_ephemeral");
    const client = await sb();
    await client.auth.signOut();
  }

  async function fetchDepartmentDashboardData(profile) {
    const client = await sb();
    const isHospAdmin =
      profile.role === "hospital_admin" || profile.department_code === "DEPT-ADM";

    const calls = [
      client
        .from("department_blood_requests")
        .select(
          `
          id, hospital_id, department_id, requested_by, staff_name, patient_reference,
          blood_group, units_required, urgency_level, required_datetime, request_status,
          notes, created_at, updated_at,
          hospital_departments ( department_name, department_code ),
          hospitals ( hospital_name, hospital_code, city )
        `
        )
        .eq("hospital_id", profile.hospital_id)
        .order("created_at", { ascending: false }),
      client.from("blood_inventory").select("*").order("city", { ascending: true }),
      client
        .from("shortage_predictions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(12)
    ];

    if (isHospAdmin) {
      calls.push(
        client
          .from("hospital_departments")
          .select("*")
          .eq("hospital_id", profile.hospital_id)
          .order("department_name", { ascending: true }),
        client
          .from("department_users")
          .select("id, auth_user_id, hospital_id, department_id, full_name, official_email, role, is_active, created_at")
          .eq("hospital_id", profile.hospital_id)
          .order("created_at", { ascending: false })
      );
    }

    const results = await Promise.all(calls);
    const [reqRes, invRes, alertRes, deptRes, userRes] = results;

    if (reqRes.error) throw reqRes.error;
    if (invRes.error) throw invRes.error;

    return {
      requests: reqRes.data || [],
      inventory: invRes.data || [],
      alerts: (alertRes && !alertRes.error ? alertRes.data : []) || [],
      departments: (deptRes && !deptRes.error ? deptRes.data : []) || [],
      users: (userRes && !userRes.error ? userRes.data : []) || []
    };
  }

  async function submitDepartmentBloodRequest(profile, payload) {
    const client = await sb();
    const { data, error } = await client
      .from("department_blood_requests")
      .insert([
        {
          hospital_id: profile.hospital_id,
          department_id: profile.department_id,
          requested_by: profile.auth_user_id,
          staff_name: String(payload.staff_name || "").trim(),
          patient_reference: String(payload.patient_reference || "").trim(),
          blood_group: payload.blood_group,
          units_required: Number(payload.units_required),
          urgency_level: payload.urgency_level,
          required_datetime: payload.required_datetime,
          request_status: "Pending",
          notes: String(payload.notes || "").trim()
        }
      ])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function updateDepartmentBloodRequestStatus(requestId, status, notes) {
    const client = await sb();
    const patch = {
      request_status: status,
      updated_at: new Date().toISOString()
    };
    if (typeof notes === "string") {
      patch.notes = notes.trim();
    }
    const { data, error } = await client
      .from("department_blood_requests")
      .update(patch)
      .eq("id", requestId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function updateDepartmentUserAsHospAdmin(id, patch) {
    const client = await sb();
    const { data, error } = await client
      .from("department_users")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function createDepartmentAsHospAdmin(hospitalId, { department_name, department_code }) {
    const client = await sb();
    const { data, error } = await client
      .from("hospital_departments")
      .insert([
        {
          hospital_id: hospitalId,
          department_name: String(department_name || "").trim(),
          department_code: String(department_code || "").trim().toUpperCase()
        }
      ])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // ── 7. Main PBSN Admin Hospital & Department Management Services ────────
  async function fetchAdminHospitalOverview() {
    const client = await sb();
    const [hospitalsRes, deptsRes, usersRes, deptReqsRes] = await Promise.all([
      client.from("hospitals").select("*").order("created_at", { ascending: false }),
      client.from("hospital_departments").select("*").order("department_name", { ascending: true }),
      client
        .from("department_users")
        .select(
          `
          id, auth_user_id, hospital_id, department_id, full_name, official_email, role, is_active, created_at,
          hospitals ( hospital_name, hospital_code, city ),
          hospital_departments ( department_name, department_code )
        `
        )
        .order("created_at", { ascending: false }),
      client
        .from("department_blood_requests")
        .select(
          `
          id, hospital_id, department_id, requested_by, staff_name, patient_reference,
          blood_group, units_required, urgency_level, required_datetime, request_status,
          notes, created_at, updated_at,
          hospitals ( hospital_name, hospital_code, city ),
          hospital_departments ( department_name, department_code )
        `
        )
        .order("created_at", { ascending: false })
    ]);

    if (hospitalsRes.error) throw hospitalsRes.error;
    if (deptsRes.error) throw deptsRes.error;
    if (usersRes.error) throw usersRes.error;
    if (deptReqsRes.error) throw deptReqsRes.error;

    return {
      hospitals: hospitalsRes.data || [],
      departments: deptsRes.data || [],
      departmentUsers: usersRes.data || [],
      departmentRequests: deptReqsRes.data || []
    };
  }

  async function createHospital(payload) {
    const client = await sb();
    const { data, error } = await client
      .from("hospitals")
      .insert([
        {
          hospital_name: String(payload.hospital_name || "").trim(),
          hospital_code: String(payload.hospital_code || "").trim().toUpperCase(),
          address: String(payload.address || "").trim() || null,
          city: String(payload.city || "").trim(),
          state: String(payload.state || "").trim() || null
        }
      ])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function createHospitalDepartment(payload) {
    const client = await sb();
    const { data, error } = await client
      .from("hospital_departments")
      .insert([
        {
          hospital_id: payload.hospital_id,
          department_name: String(payload.department_name || "").trim(),
          department_code: String(payload.department_code || "").trim().toUpperCase()
        }
      ])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function provisionStandardDepartments(hospitalId) {
    const client = await sb();
    const rows = STANDARD_DEPARTMENTS.map((d) => ({
      hospital_id: hospitalId,
      department_name: d.department_name,
      department_code: d.department_code
    }));
    const { data, error } = await client
      .from("hospital_departments")
      .upsert(rows, { onConflict: "hospital_id,department_code", ignoreDuplicates: true })
      .select();
    if (error) throw error;
    return data || [];
  }

  async function inviteDepartmentUser(payload) {
    const client = await sb();
    const { data, error } = await client
      .from("department_users")
      .insert([
        {
          hospital_id: payload.hospital_id,
          department_id: payload.department_id,
          full_name: String(payload.full_name || "").trim(),
          official_email: String(payload.official_email || "").trim().toLowerCase(),
          role: payload.role || "department_staff",
          is_active: payload.is_active !== false,
          auth_user_id: null
        }
      ])
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function updateDepartmentUserAdmin(id, patch) {
    const client = await sb();
    const { data, error } = await client
      .from("department_users")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  // ── 8. General User Authentication (Google OAuth + Email/Password) ─────
  async function getAuthProviderSettings() {
    const cfg = await global.PBSN_SUPABASE.loadConfig();
    const res = await fetch(`${cfg.VITE_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: cfg.VITE_SUPABASE_ANON_KEY }
    });
    if (!res.ok) return null;
    return res.json();
  }

  async function signInWithGoogle() {
    const client = await sb();
    try {
      const settings = await getAuthProviderSettings();
      if (settings && settings.external && settings.external.google === false) {
        throw new Error(
          "Google OAuth provider is not yet enabled on Supabase project rbsnllfqmfjkxhbtzoqb. Enable Authentication -> Providers -> Google with your Google Cloud Client ID & Secret to complete OAuth sign-in."
        );
      }
    } catch (checkErr) {
      if (/not yet enabled/i.test(checkErr.message || "")) throw checkErr;
    }

    const redirectTo = window.location.origin + "/user-dashboard.html";
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          access_type: "offline",
          prompt: "select_account"
        }
      }
    });
    if (error) throw translateSupabaseAuthError(error, "google");
    return data;
  }

  async function signUpUser({ fullName, email, password }) {
    const client = await sb();
    const cleanName = String(fullName || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();
    const redirectTo = window.location.origin + "/user-dashboard.html";

    const { data, error } = await client.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: { full_name: cleanName }
      }
    });
    if (error) throw translateSupabaseAuthError(error, "activate");

    // Supabase prevents account enumeration by returning empty identities for existing confirmed emails
    if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error(
        "An account with this email address already exists. Please use the Login tab or Forgot Password."
      );
    }

    return {
      user: data.user,
      session: data.session,
      needsVerification: !data.session
    };
  }

  async function signInUser({ email, password }) {
    const client = await sb();
    const cleanEmail = String(email || "").trim().toLowerCase();
    const { data, error } = await client.auth.signInWithPassword({ email: cleanEmail, password });
    if (error) throw translateSupabaseAuthError(error, "login");
    const profile = await ensureOwnUserProfile(client, data.user);
    return { user: data.user, session: data.session, profile };
  }

  async function ensureOwnUserProfile(client, user) {
    if (!user) return null;
    const { data: existing } = await client
      .from("user_profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    if (existing) return existing;

    const meta = user.user_metadata || {};
    const appMeta = user.app_metadata || {};
    const fallbackName =
      (meta.full_name || meta.name || (user.email ? user.email.split("@")[0] : "PBSN User")).trim();
    const avatarUrl = meta.avatar_url || meta.picture || null;
    const provider = appMeta.provider || "email";

    const { data: created } = await client
      .from("user_profiles")
      .upsert(
        [
          {
            id: user.id,
            full_name: fallbackName,
            email: (user.email || "").toLowerCase(),
            avatar_url: avatarUrl,
            auth_provider: provider,
            last_sign_in_at: new Date().toISOString()
          }
        ],
        { onConflict: "id" }
      )
      .select()
      .single();
    return created || {
      id: user.id,
      full_name: fallbackName,
      email: user.email,
      avatar_url: avatarUrl,
      auth_provider: provider
    };
  }

  async function getUserSessionProfile() {
    const client = await sb();
    const { data: sessData } = await client.auth.getSession();
    if (!sessData || !sessData.session || !sessData.session.user) return null;
    const { data: userRes } = await client.auth.getUser();
    const user = (userRes && userRes.user) || sessData.session.user;
    const profile = await ensureOwnUserProfile(client, user);
    return { user, session: sessData.session, profile };
  }

  async function updateUserProfileDetails({ full_name }) {
    const client = await sb();
    const { data: sessData } = await client.auth.getSession();
    if (!sessData || !sessData.session) throw new Error("Authentication required.");
    const uid = sessData.session.user.id;
    const cleanName = String(full_name || "").trim();
    if (cleanName.length < 2) throw new Error("Full name must be at least 2 characters.");

    await client.auth.updateUser({ data: { full_name: cleanName } });
    const { data, error } = await client
      .from("user_profiles")
      .update({ full_name: cleanName, updated_at: new Date().toISOString() })
      .eq("id", uid)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function requestUserPasswordReset(email) {
    const client = await sb();
    const cleanEmail = String(email || "").trim().toLowerCase();
    const redirectTo = window.location.origin + "/auth.html?mode=reset";
    const { error } = await client.auth.resetPasswordForEmail(cleanEmail, { redirectTo });
    if (error) throw translateSupabaseAuthError(error, "reset");
    return { ok: true };
  }

  async function updateUserPassword(newPassword) {
    const client = await sb();
    const { error } = await client.auth.updateUser({ password: newPassword });
    if (error) throw translateSupabaseAuthError(error, "reset");
    return { ok: true };
  }

  async function signOutUser() {
    const client = await sb();
    await client.auth.signOut();
  }

  global.PBSN_SVC = {
    STANDARD_DEPARTMENTS,
    fetchBloodBanks,
    fetchBloodInventory,
    fetchPublishedReports,
    submitBloodRequest,
    submitDonorInquiry,
    submitContactInquiry,
    savePredictionResult,
    signInAdmin,
    bootstrapFirstAdmin,
    getAdminSession,
    signOutAdmin,
    fetchAdminReports,
    createReport,
    updateReport,
    deleteReport,
    uploadStorageFile,
    downloadReportStorageFile,
    fetchAdminInquiriesAndRequests,
    updateBloodRequestStatus,
    updateInventoryRow,
    getRememberedDepartmentFields,
    signInDepartmentUser,
    activateDepartmentInvite,
    requestDepartmentPasswordReset,
    updateDepartmentPassword,
    getDepartmentSession,
    signOutDepartment,
    fetchDepartmentDashboardData,
    submitDepartmentBloodRequest,
    updateDepartmentBloodRequestStatus,
    updateDepartmentUserAsHospAdmin,
    createDepartmentAsHospAdmin,
    fetchAdminHospitalOverview,
    createHospital,
    createHospitalDepartment,
    provisionStandardDepartments,
    inviteDepartmentUser,
    updateDepartmentUserAdmin,
    getAuthProviderSettings,
    signInWithGoogle,
    signUpUser,
    signInUser,
    getUserSessionProfile,
    updateUserProfileDetails,
    requestUserPasswordReset,
    updateUserPassword,
    signOutUser
  };
})(window);
