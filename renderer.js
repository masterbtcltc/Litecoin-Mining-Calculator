// ----------------------
// CONFIG & CONSTANTS
// ----------------------
const LTC_BLOCK_REWARD = 6.25;
const LTC_BLOCK_TIME_MIN = 2.5;
const DOGE_BLOCK_REWARD = 10000;
const DOGE_BLOCK_TIME_MIN = 1;

const LITESPACE_HASHRATE_URL = "https://litecoinspace.org/api/v1/mining/hashrate/3d";
const COINGECKO_SIMPLE_PRICE =
  "https://api.coingecko.com/api/v3/simple/price?ids=litecoin,dogecoin&vs_currencies=usd";

function formatNumber(num, decimals = 4) {
  if (isNaN(num) || !isFinite(num)) return "-";
  return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function formatUsd(num) {
  if (isNaN(num) || !isFinite(num)) return "-";
  return "$" + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    if (!res.ok) throw new Error("Hashrate API error: " + res.status);
    const data = await res.json();
    const raw = data?.currentHashrate;
    if (typeof raw !== "number" || raw <= 0) throw new Error("Invalid currentHashrate");
    const ltcTh = raw / 1e12;
    return { ltcTh, dogeTh: ltcTh };
  } catch (err) {
    console.error("Hashrate fetch failed:", err);
    return { ltcTh: NaN, dogeTh: NaN };
  }
}

async function fetchPrices() {
  try {
    const res = await fetch(COINGECKO_SIMPLE_PRICE);
    if (!res.ok) throw new Error("Price API error: " + res.status);
    const data = await res.json();
    const ltcUsd = data?.litecoin?.usd;
    const dogeUsd = data?.dogecoin?.usd;
    if (typeof ltcUsd !== "number" || ltcUsd <= 0 || typeof dogeUsd !== "number" || dogeUsd <= 0)
      throw new Error("Invalid prices");
    return { ltcUsd, dogeUsd };
  } catch (err) {
    console.error("Price fetch failed:", err);
    return { ltcUsd: NaN, dogeUsd: NaN };
  }
}

// ----------------------
// UI RENDERING
// ----------------------
let currentHashrates = { ltcTh: NaN, dogeTh: NaN };
let currentPrices = { ltcUsd: NaN, dogeUsd: NaN };

function renderHashrateSummary() {
  const el = document.getElementById("hashrateSummary");
  if (!el) return;
  if (isNaN(currentHashrates.ltcTh)) {
    el.innerHTML = `<p class="error"><strong>Error:</strong> Unable to load hashrate. Reload page.</p>`;
    return;
  }
  const ph = currentHashrates.ltcTh / 1000;
  el.innerHTML = `
    <p><strong>Litecoin Network Hashrate:</strong> ${formatNumber(ph, 2)} PH/s (current)</p>
    <p class="small-note">Current hashrate from litecoinspace.org • Dogecoin is merge-mined on same network</p>
  `;
}

function renderPriceSummary() {
  const el = document.getElementById("priceSummary");
  if (!el) return;
  if (isNaN(currentPrices.ltcUsd) || isNaN(currentPrices.dogeUsd)) {
    el.innerHTML = `<p class="error"><strong>Error:</strong> Unable to load prices. Reload page.</p>`;
    return;
  }
  el.innerHTML = `
    <p><strong>LTC Price:</strong> ${formatUsd(currentPrices.ltcUsd)}</p>
    <p><strong>DOGE Price:</strong> ${formatUsd(currentPrices.dogeUsd)}</p>
  `;
}

// ----------------------
// CALCULATOR
// ----------------------
function calculateRewards(p) {
  const minerTH = p.hashRateGH / 1000;
  const ltcBlocksPerDay = 1440 / LTC_BLOCK_TIME_MIN;
  const dogeBlocksPerDay = 1440 / DOGE_BLOCK_TIME_MIN;
  const ltcDailyReward = LTC_BLOCK_REWARD * ltcBlocksPerDay;
  const dogeDailyReward = DOGE_BLOCK_REWARD * dogeBlocksPerDay;

  const ltcPerThDay = ltcDailyReward / p.ltcNetworkTh;
  const dogePerThDay = dogeDailyReward / p.dogeNetworkTh;

  const grossLtc = minerTH * ltcPerThDay;
  const grossDoge = minerTH * dogePerThDay;
  const feeFactor = 1 - (p.poolFeePercent || 0) / 100;
  const netLtc = grossLtc * feeFactor;
  const netDoge = grossDoge * feeFactor;

  const kWhDay = (p.powerW / 1000) * 24;
  const powerCost = kWhDay * p.energyCostKWh;
  const totalRevenueUsd = netLtc * p.ltcPriceUsd + netDoge * p.dogePriceUsd;
  const netProfitUsd = totalRevenueUsd - powerCost;

  let payoutAmount = p.payoutCoin === "LTC"
    ? totalRevenueUsd / p.ltcPriceUsd
    : totalRevenueUsd / p.dogePriceUsd;

  let breakEvenDays = NaN;
  if (p.minerCostUsd > 0 && netProfitUsd > 0) {
    breakEvenDays = p.minerCostUsd / netProfitUsd;
  }

  return { netLtc, netDoge, powerCost, totalRevenueUsd, netProfitUsd, payoutAmount, breakEvenDays };
}

// ----------------------
// BOOTSTRAP
// ----------------------
async function refreshLiveData() {
  const [hashrates, prices] = await Promise.all([fetchNetworkHashrates(), fetchPrices()]);
  currentHashrates = hashrates;
  currentPrices = prices;
  renderHashrateSummary();
  renderPriceSummary();
}

document.addEventListener("DOMContentLoaded", () => {
  const resultsEl = document.getElementById("results");
  const form = document.getElementById("miningForm");
  refreshLiveData();

  // Preset miner buttons
  document.querySelectorAll(".preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("hashRate").value = btn.dataset.hash;
      document.getElementById("powerUsage").value = btn.dataset.power;
      form.dispatchEvent(new Event("submit"));
    });
  });

  form.addEventListener("submit", e => {
    e.preventDefault();

    const hashRateGH = parseFloat(document.get
