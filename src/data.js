/**
 * PBSN — Predictive Blood Shortage Network
 * Realistic Demo Dataset featuring real Indian cities, real major hospitals/blood centres,
 * accurate geographic coordinates, ABO/Rh inventories, and fictional demo donor profiles.
 * CLEARLY LABELED AS DEMO DATA FOR HACKATHON PRESENTATION.
 */
(function (global) {
  "use strict";

  const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

  const RBC_COMPATIBILITY = {
    "O-": ["O-"],
    "O+": ["O-", "O+"],
    "A-": ["O-", "A-"],
    "A+": ["O-", "O+", "A-", "A+"],
    "B-": ["O-", "B-"],
    "B+": ["O-", "O+", "B-", "B+"],
    "AB-": ["O-", "A-", "B-", "AB-"],
    "AB+": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"]
  };

  const CITIES = [
    "New Delhi",
    "Mumbai",
    "Bengaluru",
    "Chennai",
    "Hyderabad",
    "Pune",
    "Kolkata",
    "Ahmedabad",
    "Ranchi",
    "Jamshedpur (East Singhbhum)",
    "Dhanbad",
    "Bokaro",
    "Deoghar",
    "Hazaribagh",
    "Medininagar (Palamu)",
    "Dumka",
    "Seraikela Kharsawan",
    "Giridih",
    "Garhwa",
    "Latehar",
    "Chatra",
    "Koderma",
    "Ramgarh",
    "Gumla",
    "Simdega",
    "Lohardaga",
    "Khunti",
    "Chaibasa (West Singhbhum)",
    "Godda",
    "Sahibganj",
    "Pakur",
    "Jamtara"
  ];

  // Real major hospital names & cities with exact lat/lng for Leaflet map integration
  // Note: Inventory figures, phone numbers, and burn rates are simulated demo data.
  const INITIAL_BANKS = [
    {
      id: "aiims-delhi",
      name: "AIIMS Main Blood Bank",
      city: "New Delhi",
      region: "North India",
      role: "Apex Trauma & Teaching Hub",
      lat: 28.5672,
      lng: 77.2100,
      capacity: 950,
      lastUpdated: "4 mins ago",
      contact: "+91-11-2659-XXXX (Demo Desk)",
      inventory: {
        "A+": { units: 142, dailyUse: 15.2, expiring5d: 18 },
        "A-": { units: 26, dailyUse: 3.4, expiring5d: 5 },
        "B+": { units: 164, dailyUse: 17.5, expiring5d: 22 },
        "B-": { units: 19, dailyUse: 3.1, expiring5d: 4 },
        "AB+": { units: 52, dailyUse: 5.4, expiring5d: 7 },
        "AB-": { units: 11, dailyUse: 2.0, expiring5d: 2 },
        "O+": { units: 185, dailyUse: 20.1, expiring5d: 24 },
        "O-": { units: 14, dailyUse: 6.8, expiring5d: 3 }
      }
    },
    {
      id: "kem-mumbai",
      name: "KEM Hospital Blood Centre",
      city: "Mumbai",
      region: "West India",
      role: "Tertiary Care & Emergency",
      lat: 19.0022,
      lng: 72.8419,
      capacity: 820,
      lastUpdated: "7 mins ago",
      contact: "+91-22-2410-XXXX (Demo Desk)",
      inventory: {
        "A+": { units: 118, dailyUse: 13.0, expiring5d: 14 },
        "A-": { units: 18, dailyUse: 2.9, expiring5d: 4 },
        "B+": { units: 132, dailyUse: 14.8, expiring5d: 19 },
        "B-": { units: 11, dailyUse: 2.8, expiring5d: 2 },
        "AB+": { units: 44, dailyUse: 4.5, expiring5d: 6 },
        "AB-": { units: 8, dailyUse: 1.7, expiring5d: 1 },
        "O+": { units: 152, dailyUse: 18.2, expiring5d: 21 },
        "O-": { units: 10, dailyUse: 5.9, expiring5d: 2 }
      }
    },
    {
      id: "manipal-blr",
      name: "Manipal Hospital Blood Bank",
      city: "Bengaluru",
      region: "South India",
      role: "Multi-Specialty & Transplant",
      lat: 12.9584,
      lng: 77.6489,
      capacity: 640,
      lastUpdated: "2 mins ago",
      contact: "+91-80-2502-XXXX (Demo Desk)",
      inventory: {
        "A+": { units: 108, dailyUse: 8.6, expiring5d: 16 },
        "A-": { units: 29, dailyUse: 2.1, expiring5d: 6 },
        "B+": { units: 124, dailyUse: 9.2, expiring5d: 20 },
        "B-": { units: 24, dailyUse: 1.8, expiring5d: 5 },
        "AB+": { units: 48, dailyUse: 3.1, expiring5d: 8 },
        "AB-": { units: 19, dailyUse: 1.1, expiring5d: 4 },
        "O+": { units: 146, dailyUse: 10.5, expiring5d: 25 },
        "O-": { units: 38, dailyUse: 3.1, expiring5d: 9 }
      }
    },
    {
      id: "apollo-chn",
      name: "Apollo Hospitals Blood Centre",
      city: "Chennai",
      region: "South India",
      role: "Cardiac & Critical Care",
      lat: 13.0631,
      lng: 80.2516,
      capacity: 700,
      lastUpdated: "5 mins ago",
      contact: "+91-44-2829-XXXX (Demo Desk)",
      inventory: {
        "A+": { units: 96, dailyUse: 9.4, expiring5d: 12 },
        "A-": { units: 21, dailyUse: 2.4, expiring5d: 4 },
        "B+": { units: 110, dailyUse: 10.6, expiring5d: 15 },
        "B-": { units: 16, dailyUse: 2.2, expiring5d: 3 },
        "AB+": { units: 39, dailyUse: 3.6, expiring5d: 6 },
        "AB-": { units: 12, dailyUse: 1.4, expiring5d: 2 },
        "O+": { units: 138, dailyUse: 12.2, expiring5d: 17 },
        "O-": { units: 26, dailyUse: 3.5, expiring5d: 6 }
      }
    },
    {
      id: "nims-hyd",
      name: "NIMS Blood Bank (Panjagutta)",
      city: "Hyderabad",
      region: "South India",
      role: "Trauma & Oncology Hub",
      lat: 17.4225,
      lng: 78.4520,
      capacity: 610,
      lastUpdated: "9 mins ago",
      contact: "+91-40-2348-XXXX (Demo Desk)",
      inventory: {
        "A+": { units: 84, dailyUse: 9.8, expiring5d: 11 },
        "A-": { units: 15, dailyUse: 2.5, expiring5d: 3 },
        "B+": { units: 78, dailyUse: 11.4, expiring5d: 14 },
        "B-": { units: 9, dailyUse: 2.3, expiring5d: 1 },
        "AB+": { units: 33, dailyUse: 3.8, expiring5d: 5 },
        "AB-": { units: 7, dailyUse: 1.5, expiring5d: 1 },
        "O+": { units: 112, dailyUse: 13.5, expiring5d: 16 },
        "O-": { units: 11, dailyUse: 4.4, expiring5d: 2 }
      }
    },
    {
      id: "ruby-pune",
      name: "Ruby Hall Clinic Blood Centre",
      city: "Pune",
      region: "West India",
      role: "Emergency & Donor Reserve",
      lat: 18.5335,
      lng: 73.8774,
      capacity: 520,
      lastUpdated: "3 mins ago",
      contact: "+91-20-6645-XXXX (Demo Desk)",
      inventory: {
        "A+": { units: 92, dailyUse: 6.5, expiring5d: 14 },
        "A-": { units: 26, dailyUse: 1.6, expiring5d: 6 },
        "B+": { units: 106, dailyUse: 7.2, expiring5d: 17 },
        "B-": { units: 22, dailyUse: 1.5, expiring5d: 5 },
        "AB+": { units: 41, dailyUse: 2.3, expiring5d: 7 },
        "AB-": { units: 16, dailyUse: 0.9, expiring5d: 3 },
        "O+": { units: 128, dailyUse: 8.4, expiring5d: 21 },
        "O-": { units: 34, dailyUse: 2.4, expiring5d: 8 }
      }
    },
    {
      id: "sskm-kol",
      name: "SSKM / IPGMER Blood Bank",
      city: "Kolkata",
      region: "East India",
      role: "Regional Referral Centre",
      lat: 22.5393,
      lng: 88.3426,
      capacity: 680,
      lastUpdated: "11 mins ago",
      contact: "+91-33-2204-XXXX (Demo Desk)",
      inventory: {
        "A+": { units: 88, dailyUse: 9.2, expiring5d: 10 },
        "A-": { units: 14, dailyUse: 2.4, expiring5d: 2 },
        "B+": { units: 94, dailyUse: 11.8, expiring5d: 13 },
        "B-": { units: 10, dailyUse: 2.2, expiring5d: 2 },
        "AB+": { units: 36, dailyUse: 3.4, expiring5d: 4 },
        "AB-": { units: 6, dailyUse: 1.3, expiring5d: 1 },
        "O+": { units: 104, dailyUse: 12.6, expiring5d: 12 },
        "O-": { units: 13, dailyUse: 4.1, expiring5d: 2 }
      }
    },
    {
      id: "civil-ahm",
      name: "Civil Hospital Blood Bank",
      city: "Ahmedabad",
      region: "West India",
      role: "State Reserve & Trauma",
      lat: 23.0525,
      lng: 72.6029,
      capacity: 590,
      lastUpdated: "6 mins ago",
      contact: "+91-79-2268-XXXX (Demo Desk)",
      inventory: {
        "A+": { units: 98, dailyUse: 7.4, expiring5d: 13 },
        "A-": { units: 23, dailyUse: 1.8, expiring5d: 5 },
        "B+": { units: 114, dailyUse: 8.6, expiring5d: 16 },
        "B-": { units: 18, dailyUse: 1.7, expiring5d: 4 },
        "AB+": { units: 42, dailyUse: 2.7, expiring5d: 6 },
        "AB-": { units: 14, dailyUse: 1.0, expiring5d: 3 },
        "O+": { units: 132, dailyUse: 9.5, expiring5d: 18 },
        "O-": { units: 29, dailyUse: 2.8, expiring5d: 7 }
      }
    }
  ];

  // Add all 24 Districts of Jharkhand and their major District / Medical College Hospitals
  function makeJharkhandInventory(tier, seed) {
    const mult = tier === "medical" ? 1.55 : 0.72;
    const lowMode = seed % 4 === 1;
    const base = {
      "A+": [52, 5.2, 8],
      "A-": [12, 1.4, 2],
      "B+": [64, 6.1, 10],
      "B-": [10, 1.3, 2],
      "AB+": [24, 2.1, 4],
      "AB-": [7, 0.8, 1],
      "O+": [78, 7.2, 12],
      "O-": [lowMode ? 5 : 14, lowMode ? 2.6 : 1.7, 2]
    };
    const inv = {};
    BLOOD_GROUPS.forEach((g) => {
      const [u, d, e] = base[g];
      inv[g] = {
        units: Math.max(3, Math.round(u * mult * (lowMode && g === "O-" ? 0.65 : 1))),
        dailyUse: Math.round(d * mult * 10) / 10,
        expiring5d: Math.max(1, Math.round(e * mult))
      };
    });
    return inv;
  }

  const JHARKHAND_HOSPITALS = [
    { id: "jh-rnc-rims", name: "RIMS Blood Bank & Tertiary Hospital", city: "Ranchi", role: "Apex Medical College (Jharkhand)", lat: 23.3905, lng: 85.3490, tier: "medical" },
    { id: "jh-rnc-sadar", name: "Sadar Hospital, Ranchi", city: "Ranchi", role: "District Hospital (Ranchi)", lat: 23.3728, lng: 85.3315, tier: "district" },
    { id: "jh-jam-mgm", name: "MGM Medical College & Hospital", city: "Jamshedpur (East Singhbhum)", role: "Govt Medical College (East Singhbhum)", lat: 22.8046, lng: 86.2029, tier: "medical" },
    { id: "jh-jam-tmh", name: "Tata Main Hospital (TMH) Blood Centre", city: "Jamshedpur (East Singhbhum)", role: "Multi-Specialty Referral (East Singhbhum)", lat: 22.7925, lng: 86.1842, tier: "medical" },
    { id: "jh-jam-sadar", name: "Sadar Hospital, Khasmahal (Jamshedpur)", city: "Jamshedpur (East Singhbhum)", role: "District Hospital (East Singhbhum)", lat: 22.7685, lng: 86.2045, tier: "district" },
    { id: "jh-dhn-snmmch", name: "SNMMCH Medical College & Hospital", city: "Dhanbad", role: "Govt Medical College (Dhanbad)", lat: 23.8163, lng: 86.4494, tier: "medical" },
    { id: "jh-dhn-sadar", name: "Sadar Hospital, Dhanbad", city: "Dhanbad", role: "District Hospital (Dhanbad)", lat: 23.7995, lng: 86.4304, tier: "district" },
    { id: "jh-bok-bgh", name: "Bokaro General Hospital (SAIL)", city: "Bokaro", role: "Tertiary Steel Plant Hub (Bokaro)", lat: 23.6693, lng: 86.1511, tier: "medical" },
    { id: "jh-bok-sadar", name: "Sadar Hospital, Bokaro (Chas)", city: "Bokaro", role: "District Hospital (Bokaro)", lat: 23.6362, lng: 86.1712, tier: "district" },
    { id: "jh-dgh-aiims", name: "AIIMS Deoghar Blood Centre", city: "Deoghar", role: "Apex Central Institute (Deoghar)", lat: 24.4447, lng: 86.6435, tier: "medical" },
    { id: "jh-dgh-sadar", name: "Sadar Hospital, Deoghar", city: "Deoghar", role: "District Hospital (Deoghar)", lat: 24.4828, lng: 86.6958, tier: "district" },
    { id: "jh-hzb-sbmch", name: "Sheikh Bhikhari Medical College Hospital", city: "Hazaribagh", role: "Govt Medical College (Hazaribagh)", lat: 23.9925, lng: 85.3637, tier: "medical" },
    { id: "jh-hzb-sadar", name: "Sadar Hospital, Hazaribagh", city: "Hazaribagh", role: "District Hospital (Hazaribagh)", lat: 23.9966, lng: 85.3690, tier: "district" },
    { id: "jh-plm-mmch", name: "Medinirai Medical College & Hospital", city: "Medininagar (Palamu)", role: "Govt Medical College (Palamu)", lat: 24.0419, lng: 84.0725, tier: "medical" },
    { id: "jh-plm-sadar", name: "Sadar Hospital, Medininagar", city: "Medininagar (Palamu)", role: "District Hospital (Palamu)", lat: 24.0358, lng: 84.0665, tier: "district" },
    { id: "jh-dmk-pjmch", name: "Phulo Jhano Medical College Hospital", city: "Dumka", role: "Govt Medical College (Dumka)", lat: 24.2815, lng: 87.2580, tier: "medical" },
    { id: "jh-dmk-sadar", name: "Sadar Hospital, Dumka", city: "Dumka", role: "District Hospital (Dumka)", lat: 24.2679, lng: 87.2485, tier: "district" },
    { id: "jh-skl-nsmch", name: "Netaji Subhas Medical College & Hospital", city: "Seraikela Kharsawan", role: "Medical College (Adityapur)", lat: 22.7870, lng: 86.1430, tier: "medical" },
    { id: "jh-skl-sadar", name: "Sadar Hospital, Seraikela", city: "Seraikela Kharsawan", role: "District Hospital (Seraikela Kharsawan)", lat: 22.7000, lng: 85.9500, tier: "district" },
    { id: "jh-grd-sadar", name: "Sadar Hospital, Giridih", city: "Giridih", role: "District Hospital (Giridih)", lat: 24.1854, lng: 86.3054, tier: "district" },
    { id: "jh-grw-sadar", name: "Sadar Hospital, Garhwa", city: "Garhwa", role: "District Hospital (Garhwa)", lat: 24.1604, lng: 83.8058, tier: "district" },
    { id: "jh-lth-sadar", name: "Sadar Hospital, Latehar", city: "Latehar", role: "District Hospital (Latehar)", lat: 23.7441, lng: 84.4998, tier: "district" },
    { id: "jh-cht-sadar", name: "Sadar Hospital, Chatra", city: "Chatra", role: "District Hospital (Chatra)", lat: 24.2055, lng: 84.8706, tier: "district" },
    { id: "jh-kdm-sadar", name: "Sadar Hospital, Koderma", city: "Koderma", role: "District Hospital (Koderma)", lat: 24.4676, lng: 85.5936, tier: "district" },
    { id: "jh-rmg-sadar", name: "Sadar Hospital, Ramgarh", city: "Ramgarh", role: "District Hospital (Ramgarh)", lat: 23.6302, lng: 85.5194, tier: "district" },
    { id: "jh-gml-sadar", name: "Sadar Hospital, Gumla", city: "Gumla", role: "District Hospital (Gumla)", lat: 23.0442, lng: 84.5425, tier: "district" },
    { id: "jh-smd-sadar", name: "Sadar Hospital, Simdega", city: "Simdega", role: "District Hospital (Simdega)", lat: 22.6177, lng: 84.5020, tier: "district" },
    { id: "jh-lhd-sadar", name: "Sadar Hospital, Lohardaga", city: "Lohardaga", role: "District Hospital (Lohardaga)", lat: 23.4334, lng: 84.6805, tier: "district" },
    { id: "jh-kht-sadar", name: "Sadar Hospital, Khunti", city: "Khunti", role: "District Hospital (Khunti)", lat: 23.0772, lng: 85.2784, tier: "district" },
    { id: "jh-wsh-sadar", name: "Sadar Hospital, Chaibasa", city: "Chaibasa (West Singhbhum)", role: "District Hospital (West Singhbhum)", lat: 22.5515, lng: 85.8020, tier: "district" },
    { id: "jh-gdd-sadar", name: "Sadar Hospital, Godda", city: "Godda", role: "District Hospital (Godda)", lat: 24.8286, lng: 87.2131, tier: "district" },
    { id: "jh-sbg-sadar", name: "Sadar Hospital, Sahibganj", city: "Sahibganj", role: "District Hospital (Sahibganj)", lat: 25.2435, lng: 87.6416, tier: "district" },
    { id: "jh-pkr-sadar", name: "Sadar Hospital, Pakur", city: "Pakur", role: "District Hospital (Pakur)", lat: 24.6335, lng: 87.8492, tier: "district" },
    { id: "jh-jmt-sadar", name: "Sadar Hospital, Jamtara", city: "Jamtara", role: "District Hospital (Jamtara)", lat: 23.9628, lng: 86.8037, tier: "district" }
  ];

  JHARKHAND_HOSPITALS.forEach((h, idx) => {
    INITIAL_BANKS.push({
      id: h.id,
      name: h.name,
      city: h.city,
      region: "Jharkhand",
      role: h.role,
      lat: h.lat,
      lng: h.lng,
      capacity: h.tier === "medical" ? 560 : 280,
      lastUpdated: `${3 + (idx % 12)} mins ago`,
      contact: `+91-651-249-${String(1000 + idx).slice(0, 4)} (Demo Desk)`,
      inventory: makeJharkhandInventory(h.tier, idx)
    });
  });

  // Fictional demo donor profiles (consent-aware privacy)
  const INITIAL_DONORS = [
    { id: "D-101", alias: "Aarav M.", group: "O-", city: "New Delhi", available: true, preference: "SMS & Portal Alert", consentPublic: true, lastDonated: "105 days ago" },
    { id: "D-102", alias: "Priya S.", group: "B+", city: "Mumbai", available: true, preference: "Hospital Portal Only", consentPublic: false, lastDonated: "120 days ago" },
    { id: "D-103", alias: "Rohan K.", group: "O+", city: "Bengaluru", available: true, preference: "Verified Call / SMS", consentPublic: true, lastDonated: "96 days ago" },
    { id: "D-104", alias: "Ananya R.", group: "AB-", city: "Chennai", available: true, preference: "Hospital Portal Only", consentPublic: false, lastDonated: "140 days ago" },
    { id: "D-105", alias: "Vikram T.", group: "A-", city: "Hyderabad", available: false, preference: "SMS Only", consentPublic: false, lastDonated: "32 days ago" },
    { id: "D-106", alias: "Neha P.", group: "O-", city: "Pune", available: true, preference: "Verified Call / SMS", consentPublic: true, lastDonated: "112 days ago" },
    { id: "D-107", alias: "Siddharth B.", group: "B-", city: "Kolkata", available: true, preference: "SMS & Portal Alert", consentPublic: true, lastDonated: "99 days ago" },
    { id: "D-108", alias: "Kavya D.", group: "A+", city: "Ahmedabad", available: true, preference: "Hospital Portal Only", consentPublic: false, lastDonated: "130 days ago" }
  ];

  // Initial emergency requests (anonymized reference IDs, no patient PII)
  const INITIAL_REQUESTS = [
    {
      refId: "REQ-DEL-804",
      group: "O-",
      units: 6,
      hospital: "AIIMS Main Blood Bank",
      city: "New Delhi",
      urgency: "Critical Emergency",
      status: "Pending Dispatch",
      createdAt: "14 mins ago"
    },
    {
      refId: "REQ-MUM-519",
      group: "AB-",
      units: 4,
      hospital: "KEM Hospital Blood Centre",
      city: "Mumbai",
      urgency: "Urgent",
      status: "Matched via Pune",
      createdAt: "38 mins ago"
    },
    {
      refId: "REQ-HYD-272",
      group: "B-",
      units: 5,
      hospital: "NIMS Blood Bank (Panjagutta)",
      city: "Hyderabad",
      urgency: "Urgent",
      status: "Pending Dispatch",
      createdAt: "1 hr ago"
    }
  ];

  const SEASONAL_FACTORS = {
    normal: { label: "Normal Season", supplyMult: 1.0, demandMult: 1.0 },
    monsoon: { label: "Monsoon / Dengue Surge", supplyMult: 0.80, demandMult: 1.24 },
    summer: { label: "Summer / Vacation Dip", supplyMult: 0.74, demandMult: 1.12 }
  };

  global.PBSN_DATA = {
    BLOOD_GROUPS,
    RBC_COMPATIBILITY,
    CITIES,
    INITIAL_BANKS,
    INITIAL_DONORS,
    INITIAL_REQUESTS,
    SEASONAL_FACTORS
  };
})(window);
