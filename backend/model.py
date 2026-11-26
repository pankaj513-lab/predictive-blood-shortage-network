import math
import numpy as np


def predict_shortage_risk(params: dict) -> dict:
    """
    Transparent shortage risk estimator (Pandas/NumPy/Scikit-learn compatible interface).
    Replace this baseline estimator with a trained regional GradientBoosting/ARIMA model
    once historical hospital transfusion CSV datasets are connected.
    """
    group = params["group"]
    region = params["region"]
    inv = float(params["currentInventory"])
    hist = float(params["historicalDailyDemand"])
    exp = float(params["expectedDailyDemand"])
    days = int(params["periodDays"])

    rarity_boost = 1.12 if group.endswith("-") else 1.0
    effective_daily = float(np.average([exp, hist], weights=[0.65, 0.35])) * rarity_boost
    predicted_demand = int(round(effective_daily * days))
    routine_restock = int(round(hist * 0.45 * days))
    net_balance = int(round(inv + routine_restock - predicted_demand))
    daily_burn = max(0.5, effective_daily - hist * 0.45)
    days_to_depletion = round(inv / daily_burn, 1)

    if net_balance <= 0 or days_to_depletion <= 2.5:
        risk = "Critical Risk"
        period = f"Day {max(1, math.floor(days_to_depletion))} to Day {days} (Immediate Deficit)"
        action = f"Trigger inter-city {group} transfer and launch urgent donor alert in {region}."
    elif net_balance < predicted_demand * 0.25 or days_to_depletion <= days * 0.65:
        risk = "High Risk"
        period = f"Day {max(2, math.floor(days_to_depletion * 0.8))} to Day {days}"
        action = f"Pre-position {math.ceil(predicted_demand * 0.3)} units of {group} via regional blood bank network."
    elif net_balance < predicted_demand * 0.5:
        risk = "Moderate Risk"
        period = f"Buffer tightening after Day {max(3, math.floor(days * 0.6))}"
        action = f"Schedule targeted {group} voluntary donor camp in {region}."
    else:
        risk = "Low Risk"
        period = "No shortage projected within window"
        action = f"Maintain routine monitoring and FEFO inventory rotation in {region}."

    status = (
        f"Projected Deficit ({net_balance} units)"
        if net_balance <= 0
        else f"Projected Surplus (+{net_balance} units)"
    )

    return {
        "group": group,
        "region": region,
        "periodDays": days,
        "predictedDemand": predicted_demand,
        "routineRestock": routine_restock,
        "netProjectedBalance": net_balance,
        "daysToDepletion": days_to_depletion,
        "riskLevel": risk,
        "shortagePeriod": period,
        "inventoryStatus": status,
        "suggestedAction": action,
        "demoModelNote": "FastAPI baseline mathematical predictor (ready for Scikit-learn model swap).",
    }
