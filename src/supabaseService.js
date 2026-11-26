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
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const { data: adminRow, error: adminErr } = await client
      .from("admin_users")
      .select("user_id, email, full_name")
      .eq("user_id", data.user.id)
      .maybeSingle();

    if (adminErr || !adminRow) {
      await client.auth.signOut();
      throw new Error("Authenticated user is not registered as an authorized PBSN administrator.");
    }
    return adminRow;
  }

  async function bootstrapFirstAdmin(fullName, email, password) {
    const client = await sb();
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) throw error;
    if (!data.session || !data.user) {
      throw new Error("Account created—please confirm your email in Supabase Auth before signing in.");
    }
    const { error: insErr } = await client.from("admin_users").insert([
      { user_id: data.user.id, email, full_name: fullName }
    ]);
    if (insErr) {
      await client.auth.signOut();
      throw new Error(insErr.message || "First-admin bootstrap failed (an administrator may already exist).");
    }
    return { user_id: data.user.id, email, full_name: fullName };
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

  global.PBSN_SVC = {
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
    updateInventoryRow
  };
})(window);
