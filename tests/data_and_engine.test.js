const test = require("node:test");
const assert = require("node:assert/strict");

const DATA = require("../src/data.js");
const ENGINE = require("../src/engine.js");

test("PBSN_DATA defines all 8 ABO/Rh blood groups and valid compatibility", () => {
  assert.equal(DATA.BLOOD_GROUPS.length, 8);
  assert.deepEqual(DATA.RBC_COMPATIBILITY["O-"], ["O-"]);
  assert.deepEqual(DATA.RBC_COMPATIBILITY["AB+"], [
    "O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"
  ]);
  for (const g of DATA.BLOOD_GROUPS) {
    assert.ok(Array.isArray(DATA.RBC_COMPATIBILITY[g]));
    assert.ok(DATA.RBC_COMPATIBILITY[g].includes(g));
  }
});

test("PBSN_DATA covers all 8 metro hubs plus all 24 Jharkhand districts (34 Jharkhand hospitals)", () => {
  assert.equal(DATA.CITIES.length, 32);
  assert.equal(DATA.INITIAL_BANKS.length, 42);

  const jhBanks = DATA.INITIAL_BANKS.filter((b) => b.region === "Jharkhand");
  assert.equal(jhBanks.length, 34);

  const uniqueJhDistricts = new Set(jhBanks.map((b) => b.city));
  assert.equal(uniqueJhDistricts.size, 24);

  for (const bank of DATA.INITIAL_BANKS) {
    assert.ok(bank.lat > 7 && bank.lat < 36, `lat in India range for ${bank.id}`);
    assert.ok(bank.lng > 67 && bank.lng < 97, `lng in India range for ${bank.id}`);
    for (const g of DATA.BLOOD_GROUPS) {
      assert.ok(bank.inventory[g].units >= 0);
      assert.ok(bank.inventory[g].dailyUse > 0);
    }
  }
});

test("haversineKm calculates zero self-distance, symmetry, and realistic India distances", () => {
  const ranchi = { lat: 23.3905, lng: 85.3490 };
  const dhanbad = { lat: 23.8163, lng: 86.4494 };
  assert.equal(ENGINE.haversineKm(ranchi, ranchi), 0);
  const d1 = ENGINE.haversineKm(ranchi, dhanbad);
  const d2 = ENGINE.haversineKm(dhanbad, ranchi);
  assert.equal(d1, d2);
  assert.ok(d1 >= 100 && d1 <= 150, `Ranchi-Dhanbad distance ${d1} km`);
});

test("evaluateSlot adjusts demand/supply for monsoon and classifies risk tiers", () => {
  const bank = DATA.INITIAL_BANKS[0];
  const normalSlot = ENGINE.evaluateSlot(bank, "O-", 7, "normal");
  const monsoonSlot = ENGINE.evaluateSlot(bank, "O-", 7, "monsoon");
  assert.ok(monsoonSlot.adjDailyUse > normalSlot.adjDailyUse);
  assert.ok(monsoonSlot.netBurn >= normalSlot.netBurn);
  assert.ok(["Critical Risk", "High Risk", "Moderate Risk", "Low Risk"].includes(monsoonSlot.risk));
});

test("evaluateDashboard filters Jharkhand region (34 hubs) and specific Ranchi hub (2 hubs)", () => {
  const jhEval = ENGINE.evaluateDashboard(DATA.INITIAL_BANKS, {
    group: "ALL",
    region: "Jharkhand",
    hospitalId: "ALL",
    days: 7,
    seasonKey: "normal"
  });
  assert.equal(jhEval.filteredBanks.length, 34);
  assert.equal(jhEval.series.length, 14); // -6..+7 days

  const ranchiEval = ENGINE.evaluateDashboard(DATA.INITIAL_BANKS, {
    group: "O-",
    region: "Ranchi",
    hospitalId: "ALL",
    days: 14,
    seasonKey: "normal"
  });
  assert.equal(ranchiEval.filteredBanks.length, 2);
  assert.equal(ranchiEval.series.length, 21); // -6..+14 days
});

test("runDemoPrediction handles Critical, High, Moderate, and Low risk scenarios + Rh rarity boost", () => {
  const critical = ENGINE.runDemoPrediction({
    group: "O-",
    region: "Ranchi",
    currentInventory: 5,
    historicalDailyDemand: 8,
    expectedDailyDemand: 10,
    periodDays: 7
  });
  assert.equal(critical.riskLevel, "Critical Risk");
  assert.ok(critical.netProjectedBalance <= 0);
  assert.match(critical.inventoryStatus, /Projected Deficit/);

  const low = ENGINE.runDemoPrediction({
    group: "O+",
    region: "Mumbai",
    currentInventory: 300,
    historicalDailyDemand: 5,
    expectedDailyDemand: 5,
    periodDays: 7
  });
  assert.equal(low.riskLevel, "Low Risk");
  assert.match(low.inventoryStatus, /Projected Surplus/);

  const neg = ENGINE.runDemoPrediction({
    group: "O-",
    region: "Dhanbad",
    currentInventory: 40,
    historicalDailyDemand: 6,
    expectedDailyDemand: 6,
    periodDays: 7
  });
  const pos = ENGINE.runDemoPrediction({
    group: "O+",
    region: "Dhanbad",
    currentInventory: 40,
    historicalDailyDemand: 6,
    expectedDailyDemand: 6,
    periodDays: 7
  });
  assert.ok(neg.predictedDemand > pos.predictedDemand, "Negative Rh factor increases predicted demand");
});

test("generateInsightsAndTransfers produces compatible transfer routes with bounded quantities", () => {
  const evalRes = ENGINE.evaluateDashboard(DATA.INITIAL_BANKS, {
    group: "ALL",
    region: "Jharkhand",
    hospitalId: "ALL",
    days: 7,
    seasonKey: "normal"
  });
  const pack = ENGINE.generateInsightsAndTransfers(DATA.INITIAL_BANKS, evalRes);
  assert.ok(pack.insights.length >= 3);
  assert.ok(pack.transfers.length >= 1);
  for (const t of pack.transfers) {
    assert.notEqual(t.fromId, t.toId);
    assert.ok(t.qty >= 4 && t.qty <= 16);
    assert.ok(DATA.RBC_COMPATIBILITY[t.neededGroup].includes(t.donorGroup));
  }
});

test("predictWithOptionalBackend falls back cleanly to Transparent Demo Engine when offline/non-localhost", async () => {
  const res = await ENGINE.predictWithOptionalBackend({
    group: "A+",
    region: "Bokaro",
    currentInventory: 18,
    historicalDailyDemand: 6.5,
    expectedDailyDemand: 9,
    periodDays: 7
  });
  assert.equal(res.source, "Transparent Demo Engine");
  assert.equal(res.group, "A+");
  assert.equal(res.riskLevel, "Critical Risk");
});
