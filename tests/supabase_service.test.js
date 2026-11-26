"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const SB_CLIENT = require("../src/supabaseClient.js");
const SVC = require("../src/supabaseService.js");

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(k) {
      return store.has(k) ? store.get(k) : null;
    },
    setItem(k, v) {
      store.set(k, String(v));
    },
    removeItem(k) {
      store.delete(k);
    },
    clear() {
      store.clear();
    },
    _dump() {
      return Object.fromEntries(store.entries());
    },
  };
}

function makeQueryBuilder(resolver) {
  const state = {
    table: "",
    op: "select",
    filters: [],
    payload: null,
    options: null,
    order: null,
    mode: "many",
  };
  const api = {
    select(cols) {
      if (state.op === "select") state.cols = cols;
      else state.returning = cols;
      return api;
    },
    insert(rows) {
      state.op = "insert";
      state.payload = rows;
      return api;
    },
    update(patch) {
      state.op = "update";
      state.payload = patch;
      return api;
    },
    upsert(rows, options) {
      state.op = "upsert";
      state.payload = rows;
      state.options = options;
      return api;
    },
    delete() {
      state.op = "delete";
      return api;
    },
    eq(col, val) {
      state.filters.push({ col, val });
      return api;
    },
    order(col, opts) {
      state.order = { col, opts };
      return api;
    },
    limit(n) {
      state.limit = n;
      return api;
    },
    maybeSingle() {
      state.mode = "maybeSingle";
      return api;
    },
    single() {
      state.mode = "single";
      return api;
    },
    then(resolve, reject) {
      return Promise.resolve().then(() => resolver(state)).then(resolve, reject);
    },
  };
  return api;
}

function setupEnvironment(handlers = {}) {
  SB_CLIENT.resetClientForTests();
  delete globalThis.__PBSN_ENV__;

  const localStorage = createMemoryStorage();
  const sessionStorage = createMemoryStorage();
  const calls = {
    fetch: [],
    queries: [],
    rpcs: [],
    auth: [],
  };

  globalThis.localStorage = localStorage;
  globalThis.sessionStorage = sessionStorage;
  globalThis.location = { origin: "http://localhost:5173" };

  globalThis.fetch = async (url, opts) => {
    calls.fetch.push({ url, opts });
    if (handlers.onFetch) {
      return handlers.onFetch(url, opts);
    }
    if (String(url).endsWith("/api/config")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            VITE_SUPABASE_URL: "https://unit-test.supabase.co",
            VITE_SUPABASE_ANON_KEY: "test_anon_key_value",
          };
        },
      };
    }
    if (String(url).includes("/auth/v1/settings")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { external: { google: handlers.googleEnabled ?? true } };
        },
      };
    }
    throw new Error(`Unexpected fetch URL in test: ${url}`);
  };

  const mockClient = {
    from(table) {
      return makeQueryBuilder((state) => {
        state.table = table;
        calls.queries.push(state);
        if (handlers.onQuery) return handlers.onQuery(state);
        return { data: [], error: null };
      });
    },
    rpc(name, params) {
      calls.rpcs.push({ name, params });
      if (handlers.onRpc) return Promise.resolve(handlers.onRpc(name, params));
      return Promise.resolve({ data: null, error: null });
    },
    auth: {
      async signInWithPassword(args) {
        calls.auth.push({ method: "signInWithPassword", args });
        return handlers.onSignInWithPassword
          ? handlers.onSignInWithPassword(args)
          : { data: { user: { id: "u-1", email: args.email }, session: { access_token: "tok" } }, error: null };
      },
      async signUp(args) {
        calls.auth.push({ method: "signUp", args });
        return handlers.onSignUp
          ? handlers.onSignUp(args)
          : { data: { user: { id: "u-2", email: args.email, identities: [{ id: "id-1" }] }, session: { access_token: "tok" } }, error: null };
      },
      async signInWithOAuth(args) {
        calls.auth.push({ method: "signInWithOAuth", args });
        return handlers.onSignInWithOAuth
          ? handlers.onSignInWithOAuth(args)
          : { data: { url: "https://accounts.google.com/o/oauth2/v2/auth" }, error: null };
      },
      async getSession() {
        calls.auth.push({ method: "getSession" });
        return handlers.onGetSession
          ? handlers.onGetSession()
          : { data: { session: null }, error: null };
      },
      async getUser() {
        calls.auth.push({ method: "getUser" });
        return handlers.onGetUser
          ? handlers.onGetUser()
          : { data: { user: null }, error: null };
      },
      async signOut() {
        calls.auth.push({ method: "signOut" });
        return { error: null };
      },
    },
  };

  globalThis.supabase = {
    createClient() {
      return mockClient;
    },
  };

  return { calls, localStorage, sessionStorage };
}

test("supabaseClient.loadConfig caches config, rejects missing values, and resets cleanly", async () => {
  const { calls } = setupEnvironment();
  const cfg1 = await SB_CLIENT.loadConfig();
  const cfg2 = await SB_CLIENT.loadConfig();
  assert.equal(cfg1.VITE_SUPABASE_URL, "https://unit-test.supabase.co");
  assert.equal(cfg1.VITE_SUPABASE_ANON_KEY, "test_anon_key_value");
  assert.equal(cfg2, cfg1);
  assert.equal(calls.fetch.length, 1);

  setupEnvironment({
    onFetch: async () => ({
      ok: true,
      status: 200,
      async json() {
        return { VITE_SUPABASE_URL: "", VITE_SUPABASE_ANON_KEY: "" };
      },
    }),
  });
  await assert.rejects(
    () => SB_CLIENT.loadConfig(),
    /VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing/
  );
});

test("fetchBloodBanks and submitBloodRequest send normalized payloads", async () => {
  const { calls } = setupEnvironment({
    onQuery(state) {
      if (state.table === "blood_banks" && state.op === "select") {
        return { data: [{ id: "b1", city: "Ranchi" }], error: null };
      }
      if (state.table === "blood_requests" && state.op === "insert") {
        return { data: state.payload, error: null };
      }
      return { data: null, error: null };
    },
  });

  const banks = await SVC.fetchBloodBanks();
  assert.equal(banks.length, 1);
  assert.equal(banks[0].city, "Ranchi");

  const res = await SVC.submitBloodRequest({
    request_reference: "REQ-101",
    blood_group: "O-",
    units_required: "4",
    hospital_name: "RIMS Ranchi",
    city: "Ranchi",
    contact_phone: "9876543210",
    urgency_level: "Critical",
  });
  assert.deepEqual(res, { ok: true });
  const insertCall = calls.queries.find((q) => q.table === "blood_requests");
  assert.equal(insertCall.payload[0].units_required, 4);
  assert.equal(insertCall.payload[0].request_status, "Pending");
});

test("signInAdmin rejects unauthorized accounts after signing out", async () => {
  const { calls } = setupEnvironment({
    onQuery(state) {
      if (state.table === "admin_users" && state.op === "select") {
        return { data: null, error: null };
      }
      if (state.table === "admin_users" && state.op === "insert") {
        return { data: null, error: { message: "RLS denied" } };
      }
      return { data: null, error: null };
    },
  });

  await assert.rejects(
    () => SVC.signInAdmin("User@Example.com", "Pbsn#Test2026"),
    /not registered as an authorized PBSN administrator/
  );
  assert.ok(calls.auth.some((c) => c.method === "signOut"));
});

test("bootstrapFirstAdmin translates email rate limit and duplicate user errors cleanly", async () => {
  setupEnvironment({
    onSignUp: async () => ({
      data: { user: null, session: null },
      error: { message: "Email rate limit exceeded", code: "over_email_send_rate_limit", status: 429 },
    }),
  });
  await assert.rejects(
    () => SVC.bootstrapFirstAdmin("Admin", "admin@pbsn.org", "Pbsn#Strong2026!"),
    /email rate limit reached/i
  );

  setupEnvironment({
    onSignUp: async () => ({
      data: { user: null, session: null },
      error: { message: "User already registered" },
    }),
  });
  await assert.rejects(
    () => SVC.bootstrapFirstAdmin("Admin", "admin@pbsn.org", "Pbsn#Strong2026!"),
    /already registered/i
  );
});

test("signUpUser detects existing accounts via empty identities array and marks verification needed", async () => {
  setupEnvironment({
    onSignUp: async () => ({
      data: { user: { id: "u-dup", identities: [] }, session: null },
      error: null,
    }),
  });
  await assert.rejects(
    () => SVC.signUpUser({ fullName: "Dr. Rao", email: "rao@pbsn.org", password: "Pbsn#Strong2026!" }),
    /already exists/i
  );

  setupEnvironment({
    onSignUp: async () => ({
      data: { user: { id: "u-new", identities: [{ id: "id-1" }] }, session: null },
      error: null,
    }),
  });
  const created = await SVC.signUpUser({
    fullName: "Dr. Rao",
    email: "  Rao@PBSN.ORG ",
    password: "Pbsn#Strong2026!",
  });
  assert.equal(created.needsVerification, true);
  assert.equal(created.user.id, "u-new");
});

test("signInWithGoogle enforces Google provider check and invokes OAuth redirect flow", async () => {
  setupEnvironment({ googleEnabled: false });
  await assert.rejects(
    () => SVC.signInWithGoogle(),
    /Google OAuth provider is not yet enabled/i
  );

  const { calls } = setupEnvironment({ googleEnabled: true });
  const oauth = await SVC.signInWithGoogle();
  assert.match(oauth.url, /accounts\.google\.com/);
  const oauthCall = calls.auth.find((c) => c.method === "signInWithOAuth");
  assert.equal(oauthCall.args.provider, "google");
  assert.equal(oauthCall.args.options.redirectTo, "http://localhost:5173/user-dashboard.html");
});

test("signInDepartmentUser normalizes codes and getDepartmentSession enforces ephemeral sessions", async () => {
  const { calls, localStorage, sessionStorage } = setupEnvironment({
    onRpc(name, params) {
      assert.equal(name, "verify_department_login");
      assert.equal(params.p_hospital_code, "RIMS-RNC");
      assert.equal(params.p_department_code, "ICU");
      return {
        data: {
          hospital_code: "RIMS-RNC",
          department_code: "ICU",
          hospital_name: "RIMS Ranchi",
          department_name: "Intensive Care Unit (ICU)",
        },
        error: null,
      };
    },
  });

  // Remember Me = false -> sets ephemeral flags across both stores
  await SVC.signInDepartmentUser({
    hospitalCode: " rims-rnc ",
    departmentCode: " icu ",
    email: "icu@rims.org",
    password: "Pbsn#Dept2026!",
    rememberMe: false,
  });
  assert.equal(localStorage.getItem("pbsn_dept_ephemeral_flag"), "1");
  assert.equal(sessionStorage.getItem("pbsn_dept_ephemeral"), "1");

  // Simulate closing browser tab (sessionStorage cleared while localStorage retains flag)
  sessionStorage.clear();
  const expiredSession = await SVC.getDepartmentSession();
  assert.equal(expiredSession, null);
  assert.equal(localStorage.getItem("pbsn_dept_ephemeral_flag"), null);
  assert.ok(calls.auth.some((c) => c.method === "signOut"));
});

test("provisionStandardDepartments upserts all 8 clinical departments and status updates validate fields", async () => {
  const { calls } = setupEnvironment({
    onQuery(state) {
      if (state.table === "hospital_departments" && state.op === "upsert") {
        return { data: state.payload, error: null };
      }
      if (state.table === "department_blood_requests" && state.op === "update") {
        return { data: { id: "req-1", ...state.payload }, error: null };
      }
      return { data: [], error: null };
    },
  });

  const depts = await SVC.provisionStandardDepartments("hosp-123");
  assert.equal(depts.length, 8);
  assert.equal(SVC.STANDARD_DEPARTMENTS.length, 8);
  const upsertCall = calls.queries.find((q) => q.table === "hospital_departments");
  assert.equal(upsertCall.options.onConflict, "hospital_id,department_code");

  const updated = await SVC.updateDepartmentBloodRequestStatus("req-1", "Approved", "  Units allocated from Lab 2  ");
  assert.equal(updated.request_status, "Approved");
  assert.equal(updated.notes, "Units allocated from Lab 2");
  assert.ok(updated.updated_at);
});
