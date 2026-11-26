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
    "Ahmedabad"
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
