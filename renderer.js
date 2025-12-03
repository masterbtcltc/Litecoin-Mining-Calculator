// ----------------------
// CONFIG & CONSTANTS
// ----------------------
const LTC_BLOCK_REWARD = 6.25; // LTC per block
const LTC_BLOCK_TIME_MIN = 2.5; // minutes
const DOGE_BLOCK_REWARD = 10000; // DOGE per block
const DOGE_BLOCK_TIME_MIN = 1; // minutes

// API endpoints
const LITESPACE_HASHRATE_URL = "https://litecoinspace.org/api/v1/mining/hashrate/3d";
const COINGECKO_SIMPLE_PRICE =
  "https://api.coingecko.com/api/v3/simple/price?ids=litecoin,dogecoin&vs_currencies=usd";

function formatNumber(num, decimals = 4) {
  if (isNaN(num) || !isFinite(num)) return "-";
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatUsd(num) {
  if (isNaN(num) || !isFinite(num)) return "-";
  return "$" + num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatBreakEvenYears(days) {
  if (days < 30) return "< 1 month";
  if (days < 365) return formatNumber(days / 30.42, 1) + " months";
  return formatNumber(days / 365.25, 2) + " years";
}

// ----------------------
// LIVE DATA FETCHERS
// ----------------------
async function fetchNetworkHashrates() {
  try {
    const res = await fetch(LITESPACE_HASHRATE_URL);
    if (!res.ok) throw new Error("LitecoinSpace response not ok: " + res.status);
    const data = await res.json();
    const raw = data?.currentHashrate;
    if (typeof raw !== "number" || raw <= 0) {
      throw new Error("Invalid or missing currentHashrate from LitecoinSpace");
    }
    const ltcTh = raw / 1e12;
    const dogeTh = ltcTh;
    return { ltcTh, dogeTh };
  } catch (err) {
    console.error("Error fetching hashrates:", err);
    return { ltcTh: NaN, dogeTh: NaN };
  }
}

async function fetchPrices() {
  try {
    const res = await fetch(COINGECKO_SIMPLE_PRICE);
    if (!res.ok) throw new Error("Price response not ok: " + res.status);
    const data = await res.json();
    const ltcUsd = data?.litecoin?.usd;
    const dogeUsd = data?.dogecoin?.usd;
    if (typeof ltcUsd !== "number" || ltcUsd <= 0 || typeof dogeUsd !== "number" || dogeUsd <= 0) {
      throw new Error("Invalid price data");
    }
    return { ltcUsd, dogeUsd };
  } catch (err) {
    console.error("Error fetching prices:", err);
    return { ltcUsd: NaN, dogeUsd: NaN };
  }
}

// ----------------------
// UI RENDERING
// ----------------------
let currentHashrates = { ltcTh: NaN, dogeTh: NaN };
let currentPrices = { ltcUsd: NaN, dogeUsd: NaN };

function renderHashrateSummary() {
  const { ltcTh } = currentHashrates;
  const el = document.getElementById("hashrateSummary");
  if (!el) return;
  if (isNaN(ltcTh)) {
    el.innerHTML = `<p class="error"><strong>Error:</strong> Unable to load network hashrate data. Please reload.</p>`;
    return;
  }
  const ltcPh = ltcTh / 1000;
  el.innerHTML = `
    <p><strong>Litecoin Network Hashrate:</strong> ${formatNumber(ltcPh, 2)} PH/s (current)</p>
    <p class="small-note">
      Current hashrate from litecoinspace.org API. Dogecoin is merge-mined on the same Scrypt network.
    </p>
  `;
}

function renderPriceSummary() {
  const { ltcUsd, dogeUsd } = currentPrices;
  const el = document.getElementById("priceSummary");
  if (!el) return;
  if (isNaN(ltcUsd) || isNaN(dogeUsd)) {
    el.innerHTML = `<p class="error"><strong>Error:</strong> Unable to load price data. Please reload.</p>`;
    return;
  }
  el.innerHTML = `
    <p><strong>LTC Price:</strong> ${formatUsd(ltcUsd)}</p>
    <p><strong>DOGE Price:</strong> ${formatUsd(dogeUsd)}</p>
  `;
}

// ----------------------
// MINING CALCULATOR
// ----------------------
function calculateRewards(params) {
  const {
    hashRateGH,
    powerW,
    poolFeePercent,
    energyCostKWh,
    minerCostUsd,
    ltcPriceUsd,
    dogePriceUsd,
    payoutCoin,
    ltcNetworkTh,
    dogeNetworkTh
  } = params;

  const minerHashTH = hashRateGH / 1000;

  const ltcBlocksPerDay = 1440 / LTC_BLOCK_TIME_MIN;
  const dogeBlocksPerDay = 1440 / DOGE_BLOCK_TIME_MIN;

  const ltcDailyNetworkReward = LTC_BLOCK_REWARD * ltcBlocksPerDay;
  const dogeDailyNetworkReward = DOGE_BLOCK_REWARD * dogeBlocksPerDay;

  const ltcPerThPerDay = ltcDailyNetworkReward / ltcNetworkTh;
  const dogePerThPerDay = dogeDailyNetworkReward / dogeNetworkTh;

  const grossLtcPerDay = minerHashTH * ltcPerThPerDay;
  const grossDogePerDay = minerHashTH * dogePerThPerDay;

  const feeFactor = 1 - (poolFeePercent || 0) / 100;
  const netLtcPerDay = grossLtcPerDay * feeFactor;
  const netDogePerDay = grossDogePerDay * feeFactor;

  const kW = powerW / 1000;
  const kWhPerDay = kW * 24;
  const powerCostPerDayUsd = kWhPerDay * energyCostKWh;

  const ltcRevenueUsd = netLtcPerDay * ltcPriceUsd;
  const dogeRevenueUsd = netDogePerDay * dogePriceUsd;
  const totalRevenueUsd = ltcRevenueUsd + dogeRevenueUsd;
  const netProfitUsd = totalRevenueUsd - powerCostPerDayUsd;

  let payoutAmount = NaN;
  if (payoutCoin === "LTC") {
    payoutAmount = totalRevenueUsd / ltcPriceUsd;
  } else if (payoutCoin === "DOGE") {
    payoutAmount = totalRevenueUsd / dogePriceUsd;
  }

  let breakEvenDays = NaN;
  if (minerCostUsd > 0 && netProfitUsd > 0) {
    breakEvenDays = minerCostUsd / netProfitUsd;
  }

  return {
    netLtcPerDay,
    netDogePerDay,
    powerCostPerDayUsd,
    totalRevenueUsd,
    netProfitUsd,
    payoutAmount,
    payoutCoin,
    breakEvenDays,
    minerCostUsd
  };
}

// ----------------------
// BOOTSTRAP
// ----------------------
async function refreshLiveData() {
  const [hashrates, prices] = await Promise.all([
    fetchNetworkHashrates(),
    fetchPrices()
  ]);
  currentHashrates = hashrates;
  currentPrices = prices;
  renderHashrateSummary();
  renderPriceSummary();
}

document.addEventListener("DOMContentLoaded", () => {
  const resultsEl = document.getElementById("results");
  const form = document.getElementById("miningForm");

  refreshLiveData();

  if (!form || !resultsEl) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const hashRateGH = parseFloat(document.getElementById("hashRate").value || "0");
    const powerW = parseFloat(document.getElementById("powerUsage").value || "0");
    const poolFeePercent = parseFloat(document.getElementById("poolFee").value || "0");
    const energyCostKWh = parseFloat(document.getElementById("energyCost").value || "0");
    const minerCostUsd = parseFloat(document.getElementById("minerCost").value || "0");
    const payoutCoin = document.getElementById("payoutCoin").value;

    if (!hashRateGH || !powerW) {
      resultsEl.innerHTML = '<p class="error">Please enter at least hash rate and power usage.</p>';
      return;
    }

    const { ltcTh, dogeTh } = currentHashrates;
    const { ltcUsd, dogeUsd } = currentPrices;

    if (isNaN(ltcTh) || isNaN(dogeTh)) {
      resultsEl.innerHTML = '<p class="error">Network hashrate data not available. Please reload.</p>';
      return;
    }
    if (isNaN(ltcUsd) || isNaN(dogeUsd)) {
      resultsEl.innerHTML = '<p class="error">Price data not available. Please reload.</p>';
      return;
    }

    const res = calculateRewards({
      hashRateGH,
      powerW,
      poolFeePercent,
      energyCostKWh,
      minerCostUsd,
      ltcPriceUsd: ltcUsd,
      dogePriceUsd: dogeUsd,
      payoutCoin,
      ltcNetworkTh: ltcTh,
      dogeNetworkTh: dogeTh
    });

    const {
      netLtcPerDay,
      netDogePerDay,
      powerCostPerDayUsd,
      totalRevenueUsd,
      netProfitUsd,
      payoutAmount,
      payoutCoin: coin,
      breakEvenDays,
      minerCostUsd: cost
    } = res;

    let html = `
      <p><strong>Estimated Daily Rewards (after pool fee):</strong></p>
      <p>Litecoin: ${formatNumber(netLtcPerDay, 6)} LTC / day</p>
      <p>Dogecoin: ${formatNumber(netDogePerDay, 2)} DOGE / day</p>
      <p><strong>Power Cost:</strong> ${formatUsd(powerCostPerDayUsd)} per day</p>
      <p><strong>Estimated Revenue:</strong> ${formatUsd(totalRevenueUsd)} per day</p>
      <p><strong>Estimated Net Profit:</strong> ${formatUsd(netProfitUsd)} per day</p>
      <hr class="divider" />
      <p><strong>Equivalent Daily Payout in ${coin}:</strong></p>
      <p>${formatNumber(payoutAmount, coin === "LTC" ? 6 : 2)} ${coin} / day</p>
      <p class="muted">All rewards converted at current prices • ≈ ${formatUsd(totalRevenueUsd)} USD / day</p>
    `;

    if (cost > 0) {
      if (netProfitUsd > 0) {
        html += `
          <hr class="divider" style="margin: 14px 0;" />
          <p><strong>Break-even Time:</strong> ${formatBreakEvenYears(breakEvenDays)}</p>
          <p class="small-note">Based on $${formatNumber(cost, 0)} hardware cost</p>
        `;
      } else {
        html += `
          <hr class="divider" style="margin: 14px 0;" />
          <p class="error"><strong>Not profitable at current rates</strong----------------------------------------</p>
          <p class="small-note">Daily net: ${formatUsd(netProfitUsd)}. Break-even not possible.</p>
        `;
      }
    }

    resultsEl.innerHTML = html;
  });
});
