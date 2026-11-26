/**
 * PBSN — Transparent Demo Prediction Algorithm, Regional Analytics,
 * AI Insights Generator, & FastAPI-Ready Client Contract
 *
 * NOTE: Unless connected to a live FastAPI backend at http://localhost:8000,
 * predictions run locally using a transparent deterministic demo formula
 * (clearly labeled as illustrative demonstration output).
 */
(function (global) {
  "use strict";

  const { BLOOD_GROUPS, RBC_COMPATIBILITY, SEASONAL_FACTORS } = global.PBSN_DATA;

  function haversineKm(a, b) {
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;
    const s =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return Math.round(2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
  }

  function evaluateSlot(bank, group, days, seasonKey) {
    const slot = bank.inventory[group];
    const season = SEASONAL_FACTORS[seasonKey] || SEASONAL_FACTORS.normal;
    const adjDailyUse = slot.dailyUse * season.demandMult;
    const adjReplenish = slot.dailyUse * 0.76 * season.supplyMult;
    const netBurn = Math.max(0.35, adjDailyUse - adjReplenish * 0.55);
    const safetyBuffer = Math.ceil(adjDailyUse * 2.5);
    const daysCover = Math.max(0, Math.round((slot.units / netBurn) * 10) / 10);
    const projectedStock = Math.round(slot.units - netBurn * days);

    let risk = "Low Risk";
    if (daysCover <= 2.5 || slot.units <= safetyBuffer * 0.65) {
      risk = "Critical Risk";
    } else if (daysCover <= 4.5 || projectedStock < safetyBuffer * 0.5) {
      risk = "High Risk";
    } else if (daysCover <= Math.max(7, days * 0.6) || projectedStock < safetyBuffer) {
      risk = "Moderate Risk";
    }

    return {
      bankId: bank.id,
      bankName: bank.name,
      city: bank.city,
      region: bank.region,
      group,
      units: slot.units,
      expiring5d: slot.expiring5d,
      adjDailyUse: Math.round(adjDailyUse * 10) / 10,
      netBurn: Math.round(netBurn * 10) / 10,
      safetyBuffer,
      daysCover,
      projectedStock,
      risk
    };
  }

  function evaluateDashboard(banks, filters) {
    const { group, region, hospitalId, days, seasonKey } = filters;
    const activeGroups = group && group !== "ALL" ? [group] : BLOOD_GROUPS;

    const filteredBanks = banks.filter((b) => {
      if (region && region !== "ALL" && b.region !== region && b.city !== region) return false;
      if (hospitalId && hospitalId !== "ALL" && b.id !== hospitalId) return false;
      return true;
    });

    const bankSummaries = filteredBanks.map((b) => {
      const slots = activeGroups.map((g) => evaluateSlot(b, g, days, seasonKey));
      const totalUnits = slots.reduce((s, x) => s + x.units, 0);
      const totalDemand = slots.reduce((s, x) => s + x.adjDailyUse, 0);
      const totalExpiring = slots.reduce((s, x) => s + x.expiring5d, 0);
      const minCover = slots.length ? Math.min(...slots.map((x) => x.daysCover)) : 0;
      const critCount = slots.filter((x) => x.risk === "Critical Risk").length;
      const highCount = slots.filter((x) => x.risk === "High Risk").length;

      let status = "Low Risk";
      if (critCount > 0) status = "Critical Risk";
      else if (highCount > 0) status = "High Risk";
      else if (slots.some((x) => x.risk === "Moderate Risk")) status = "Moderate Risk";

      return { bank: b, totalUnits, totalDemand, totalExpiring, minCover, critCount, highCount, status, slots };
    });

    const allSlots = bankSummaries.flatMap((s) => s.slots);
    const totalUnits = bankSummaries.reduce((s, b) => s + b.totalUnits, 0);
    const totalDailyDemand = Math.round(bankSummaries.reduce((s, b) => s + b.totalDemand, 0));
    const alerts = allSlots
      .filter((s) => s.risk === "Critical Risk" || s.risk === "High Risk")
      .sort((a, b) => a.daysCover - b.daysCover);

    // Group availability totals
    const groupTotals = BLOOD_GROUPS.map((g) => {
      const gSlots = filteredBanks.map((b) => evaluateSlot(b, g, days, seasonKey));
      const units = gSlots.reduce((s, x) => s + x.units, 0);
      const demand = gSlots.reduce((s, x) => s + x.adjDailyUse, 0);
      const minCover = gSlots.length ? Math.min(...gSlots.map((x) => x.daysCover)) : 0;
      const worstRisk = gSlots.some((x) => x.risk === "Critical Risk")
        ? "Critical Risk"
        : gSlots.some((x) => x.risk === "High Risk")
          ? "High Risk"
          : gSlots.some((x) => x.risk === "Moderate Risk")
            ? "Moderate Risk"
            : "Low Risk";
      return { group: g, units, demand: Math.round(demand * 10) / 10, minCover, risk: worstRisk };
    });

    // Forecast series for chart (7d past + N days future)
    const totalBurn = allSlots.reduce((s, x) => s + x.netBurn, 0);
    const safetyTotal = allSlots.reduce((s, x) => s + x.safetyBuffer, 0);
    const series = [];
    for (let i = -6; i <= days; i++) {
      const wave = Math.sin(i * 0.55) * (totalBurn * 0.14);
      const inv =
        i <= 0
          ? Math.round(totalUnits + totalBurn * 0.4 * Math.abs(i) + wave)
          : Math.max(0, Math.round(totalUnits - totalBurn * i + wave));
      series.push({
        label: i === 0 ? "Today" : i < 0 ? `${i}d` : `+${i}d`,
        inventory: inv,
        demand: Math.round(totalDailyDemand * (1 + Math.cos(i * 0.5) * 0.08)),
        isForecast: i > 0
      });
    }

    return {
      filteredBanks,
      bankSummaries,
      allSlots,
      totalUnits,
      totalDailyDemand,
      alerts,
      groupTotals,
      series,
      safetyTotal
    };
  }

  /**
   * Transparent Demo Prediction Algorithm for Section C (AI Blood Shortage Prediction)
   * Explicitly returns formula assumptions so judges can inspect how risk is computed.
   */
  function runDemoPrediction(params) {
    const { group, region, currentInventory, historicalDailyDemand, expectedDailyDemand, periodDays } = params;
    const inv = Math.max(0, Number(currentInventory) || 0);
    const hist = Math.max(0.5, Number(historicalDailyDemand) || 1);
    const exp = Math.max(0.5, Number(expectedDailyDemand) || hist);
    const days = Math.max(1, Number(periodDays) || 7);

    // Weighted blend (65% expected demand, 35% historical baseline) + rarity factor
    const rarityBoost = group.endsWith("-") ? 1.12 : 1.0;
    const effectiveDailyDemand = (exp * 0.65 + hist * 0.35) * rarityBoost;
    const predictedDemand = Math.round(effectiveDailyDemand * days);
    // Assume baseline routine restock covers ~45% of historical demand without intervention
    const routineRestock = Math.round(hist * 0.45 * days);
    const netProjectedBalance = inv + routineRestock - predictedDemand;
    const dailyNetBurn = Math.max(0.5, effectiveDailyDemand - hist * 0.45);
    const daysToDepletion = Math.round(((inv / dailyNetBurn) * 10)) / 10;

    let riskLevel = "Low Risk";
    let shortagePeriod = "No shortage projected within window";
    let action = `Maintain routine donor scheduling in ${region} and monitor 5-day expiry batches.`;

    if (netProjectedBalance <= 0 || daysToDepletion <= 2.5) {
      riskLevel = "Critical Risk";
      const startDay = Math.max(1, Math.floor(daysToDepletion));
      shortagePeriod = `Day ${startDay} to Day ${days} (Immediate Deficit)`;
      action = `Trigger inter-city ${group} transfer (min ${Math.abs(netProjectedBalance) + 12} units), activate O- universal standby if RBC, and launch emergency donor alert in ${region}.`;
    } else if (netProjectedBalance < predictedDemand * 0.25 || daysToDepletion <= days * 0.65) {
      riskLevel = "High Risk";
      shortagePeriod = `Day ${Math.max(2, Math.floor(daysToDepletion * 0.8))} to Day ${days}`;
      action = `Pre-position ${Math.ceil(predictedDemand * 0.3)} units of ${group} from nearby surplus blood banks and prioritize FEFO transfer routing.`;
    } else if (netProjectedBalance < predictedDemand * 0.5) {
      riskLevel = "Moderate Risk";
      shortagePeriod = `Buffer tightening after Day ${Math.max(3, Math.floor(days * 0.6))}`;
      action = `Schedule targeted ${group} voluntary donor drive in ${region} over the next 72 hours.`;
    }

    const inventoryStatus =
      netProjectedBalance <= 0
        ? `Projected Deficit (${netProjectedBalance} units)`
        : `Projected Surplus (+${netProjectedBalance} units)`;

    return {
      group,
      region,
      periodDays: days,
      predictedDemand,
      routineRestock,
      netProjectedBalance,
      daysToDepletion,
      riskLevel,
      shortagePeriod,
      inventoryStatus,
      suggestedAction: action,
      demoModelNote:
        "Illustrative Demo Formula (weighted historical/expected burn + Rh rarity factor; not a live clinical ML inference)."
    };
  }

  /**
   * Generates dynamic AI Insights & Inter-City Transfer Recommendations
   */
  function generateInsightsAndTransfers(banks, evalResult) {
    const insights = [];
    const sortedGroups = [...evalResult.groupTotals].sort((a, b) => a.minCover - b.minCover);
    const tightestGroup = sortedGroups[0];
    if (tightestGroup) {
      insights.push({
        tag: "DEMAND SURGE SIGNAL",
        title: `Group ${tightestGroup.group} has the lowest regional buffer (${tightestGroup.minCover}d min cover)`,
        detail: `Across monitored centres, ${tightestGroup.group} holds ${tightestGroup.units} units against ${tightestGroup.demand} units/day demand.`,
        severity: tightestGroup.risk
      });
    }

    const stressedBanks = [...evalResult.bankSummaries].sort((a, b) => a.minCover - b.minCover);
    if (stressedBanks[0]) {
      insights.push({
        tag: "INVENTORY PRESSURE",
        title: `${stressedBanks[0].bank.name} (${stressedBanks[0].bank.city}) needs priority replenishment`,
        detail: `Minimum blood-group cover is ${stressedBanks[0].minCover} days with ${stressedBanks[0].critCount} critical slots.`,
        severity: stressedBanks[0].status
      });
    }

    // Build inter-city transfer recommendations
    const transfers = [];
    evalResult.alerts.slice(0, 6).forEach((alert) => {
      const recipient = banks.find((b) => b.id === alert.bankId);
      const compat = RBC_COMPATIBILITY[alert.group] || [alert.group];
      let best = null;
      let bestScore = -Infinity;

      banks.forEach((donor) => {
        if (donor.id === recipient.id) return;
        compat.forEach((donorGroup) => {
          const dSlot = evaluateSlot(donor, donorGroup, 7, "normal");
          const surplus = dSlot.units - dSlot.safetyBuffer * 1.4;
          if (surplus < 6) return;
          const km = haversineKm(donor, recipient);
          const score = surplus * 1.3 + (donorGroup === alert.group ? 30 : 8) + dSlot.expiring5d * 2 - km * 0.04;
          if (score > bestScore) {
            bestScore = score;
            const qty = Math.min(Math.max(4, alert.safetyBuffer - alert.units + 6), Math.floor(surplus * 0.5), 16);
            if (qty >= 4) {
              best = {
                fromId: donor.id,
                fromName: donor.name,
                fromCity: donor.city,
                toId: recipient.id,
                toName: recipient.name,
                toCity: recipient.city,
                donorGroup,
                neededGroup: alert.group,
                qty,
                distanceKm: km,
                urgency: alert.risk
              };
            }
          }
        });
      });

      if (best) transfers.push(best);
    });

    if (transfers[0]) {
      const t = transfers[0];
      insights.push({
        tag: "RECOMMENDED REDISTRIBUTION",
        title: `Route ${t.qty} units of ${t.donorGroup} from ${t.fromCity} → ${t.toCity}`,
        detail: `Connects ${t.fromName} surplus to ${t.toName} (${t.distanceKm} km corridor).`,
        severity: t.urgency
      });
    }

    const surplusBank = [...evalResult.bankSummaries].sort((a, b) => b.minCover - a.minCover)[0];
    if (surplusBank) {
      insights.push({
        tag: "DONATION CAMPAIGN TARGET",
        title: `Focus voluntary drives in ${stressedBanks[0]?.bank.city || "New Delhi"} & ${stressedBanks[1]?.bank.city || "Mumbai"}`,
        detail: `${surplusBank.bank.city} currently maintains healthy ${surplusBank.minCover}d buffers and can serve as a donor reserve hub.`,
        severity: "Low Risk"
      });
    }

    return { insights, transfers };
  }

  /**
   * Modular FastAPI Client (automatically falls back to local Demo Mode if backend is offline)
   */
  const API_BASE = "http://localhost:8000/api";
  async function predictWithOptionalBackend(params) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 900);
      const res = await fetch(`${API_BASE}/predict-shortage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (res.ok) {
        const json = await res.json();
        return { ...json, source: "FastAPI ML Backend" };
      }
    } catch (_) {
      // Backend not running locally — cleanly fall back to transparent demo mode
    }
    return { ...runDemoPrediction(params), source: "Transparent Demo Engine" };
  }

  global.PBSN_ENGINE = {
    haversineKm,
    evaluateSlot,
    evaluateDashboard,
    runDemoPrediction,
    generateInsightsAndTransfers,
    predictWithOptionalBackend
  };
})(window);
