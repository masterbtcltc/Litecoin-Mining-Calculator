// ----------------------
// CONFIG & CONSTANTS
// ----------------------

// Block rewards and block times
const LTC_BLOCK_REWARD = 6.25;          // LTC per block
const LTC_BLOCK_TIME_MIN = 2.5;         // minutes

const DOGE_BLOCK_REWARD = 10000;        // DOGE per block
const DOGE_BLOCK_TIME_MIN = 1;          // minutes

// Fallback static hashrates in TH/s (if API fails)
const FALLBACK_LTC_HASHRATE_TH = 3300;
const FALLBACK_DOGE_HASHRATE_TH = 800;

// API endpoints
const SOCHAIN_LTC_INFO_URL = "https://chain.so/api/v3/get_info/LTC";
const SOCHAIN_DOGE_INFO_URL = "https://chain.so/api/v3/get_info/DOGE";
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

// ----------------------
// LIVE DATA FETCHERS
// ----------------------

async function fetchNetworkHashrates() {
  let ltcTh = FALLBACK_LTC_HASHRATE_TH;
  let dogeTh = FALLBACK_DOGE_HASHRATE_TH;

  try {
    const [ltcRes, dogeRes] = await Promise.all([
      fetch(SOCHAIN_LTC_INFO_URL),
      fetch(SOCHAIN_DOGE_INFO_URL)
    ]);

    if (ltcRes.ok) {
      const data = await ltcRes.json();
      const hps = data?.data?.hashrate;
      if (typeof hps === "number" && hps > 0) {
        ltcTh = hps / 1e12; // H/s -> TH/s
      }
    }

    if (dogeRes.ok) {
      const data = await dogeRes.json();
      const hps = data?.data?.hashrate;
      if (typeof hps === "number" && hps > 0) {
        dogeTh = hps / 1e12;
      }
    }
  } catch (err) {
    console.warn("Error fetching hashrates, using fallback values:", err);
  }

  return { ltcTh, dogeTh };
}

async function fetchPrices() {
  let ltcUsd = NaN;
  let dogeUsd = NaN;

  try {
    const res = await fetch(COINGECKO_SIMPLE_PRICE);
    if (res.ok) {
      const data = await res.json();
      ltcUsd = data?.litecoin?.usd ?? NaN;
      dogeUsd = data?.dogecoin?.usd ?? NaN;
    }
  } catch (err) {
    console.warn("Error fetching prices:", err);
  }

  return { ltcUsd, dogeUsd };
}

// ----------------------
// UI RENDERING
// ----------------------

let currentHashrates = {
  ltcTh: FALLBACK_LTC_HASHRATE_TH,
  dogeTh: FALLBACK_DOGE_HASHRATE_TH
};

let currentPrices = {
  ltcUsd: NaN,
  dogeUsd: NaN
};

function renderHashrateSummary() {
  const { ltcTh, dogeTh } = currentHashrates;
  const el = document.getElementById("hashrateSummary");
  if (!el) return;

  el.innerHTML = `
    <p><strong>Litecoin Hashrate:</strong> ${formatNumber(ltcTh, 2)} TH/s</p>
    <p><strong>Dogecoin (merge-mined) Hashrate:</strong> ${formatNumber(
      dogeTh,
      2
    )} TH/s</p>
    <p class="small-note">
      Dogecoin shares the same Scrypt miners as Litecoin via merge mining.
    </p>
  `;
}

function renderPriceSummary() {
  const { ltcUsd, dogeUsd } = currentPrices;
  const el = document.getElementById("priceSummary");
  if (!el) return;

  el.innerHTML = `
    <p><strong>LTC Price:</strong> ${
      isNaN(ltcUsd) ? "-" : formatUsd(ltcUsd)
    }</p>
    <p><strong>DOGE Price:</strong> ${
      isNaN(dogeUsd) ? "-" : formatUsd(dogeUsd)
    }</p>
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
    ltcPriceUsd,
    dogePriceUsd,
    payoutCoin,
    ltcNetworkTh,
    dogeNetworkTh
  } = params;

  const minerHashTH = hashRateGH / 1000;

  // Blocks per day
  const ltcBlocksPerDay = 1440 / LTC_BLOCK_TIME_MIN;
  const dogeBlocksPerDay = 1440 / DOGE_BLOCK_TIME_MIN;

  // Network daily rewards
  const ltcDailyNetworkReward = LTC_BLOCK_REWARD * ltcBlocksPerDay;
  const dogeDailyNetworkReward = DOGE_BLOCK_REWARD * dogeBlocksPerDay;

  // Rewards per TH/s per day
  const ltcPerThPerDay = ltcDailyNetworkReward / ltcNetworkTh;
  const dogePerThPerDay = dogeDailyNetworkReward / dogeNetworkTh;

  // Miner rewards before fee
  const grossLtcPerDay = minerHashTH * ltcPerThPerDay;
  const grossDogePerDay = minerHashTH * dogePerThPerDay;

  const feeFactor = 1 - (poolFeePercent || 0) / 100;

  const netLtcPerDay = grossLtcPerDay * feeFactor;
  const netDogePerDay = grossDogePerDay * feeFactor;

  // Power cost
  const kW = powerW / 1000;
  const kWhPerDay = kW * 24;
  const powerCostPerDayUsd = kWhPerDay * energyCostKWh;

  // Revenue in USD from each coin
  const ltcRevenueUsd = netLtcPerDay * ltcPriceUsd;
  const dogeRevenueUsd = netDogePerDay * dogePriceUsd;
  const totalRevenueUsd = ltcRevenueUsd + dogeRevenueUsd;
  const netProfitUsd = totalRevenueUsd - powerCostPerDayUsd;

  // Combined payout in selected coin:
  // - If LTC payout: sell DOGE for USD, buy LTC
  // - If DOGE payout: sell LTC for USD, buy DOGE
  let payoutAmount = NaN;
  if (payoutCoin === "LTC") {
    payoutAmount = totalRevenueUsd / ltcPriceUsd;
  } else if (payoutCoin === "DOGE") {
    payoutAmount = totalRevenueUsd / dogePriceUsd;
  }

  return {
    netLtcPerDay,
    netDogePerDay,
    powerCostPerDayUsd,
    totalRevenueUsd,
    netProfitUsd,
    payoutAmount
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
  const refreshBtn = document.getElementById("refreshAll");

  refreshLiveData(); // initial load

  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      refreshLiveData();
    });
  }

  if (!form || !resultsEl) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const hashRateGH = parseFloat(
      document.getElementById("hashRate").value || "0"
    );
    const powerW = parseFloat(
      document.getElementById("powerUsage").value || "0"
    );
    const poolFeePercent = parseFloat(
      document.getElementById("poolFee").value || "0"
    );
    const energyCostKWh = parseFloat(
      document.getElementById("energyCost").value || "0"
    );

    const payoutCoin = document.getElementById("payoutCoin").value;

    if (!hashRateGH || !powerW) {
      resultsEl.innerHTML =
        "<p>Please enter at least hash rate and power usage.</p>";
      return;
    }

    const { ltcUsd, dogeUsd } = currentPrices;

    if (isNaN(ltcUsd) || isNaN(dogeUsd)) {
      resultsEl.innerHTML =
        "<p>Price feed not available yet. Please hit “Refresh now” and try again.</p>";
      return;
    }

    const res = calculateRewards({
      hashRateGH,
      powerW,
      poolFeePercent,
      energyCostKWh,
      ltcPriceUsd: ltcUsd,
      dogePriceUsd: dogeUsd,
      payoutCoin,
      ltcNetworkTh: currentHashrates.ltcTh,
      dogeNetworkTh: currentHashrates.dogeTh
    });

    const {
      netLtcPerDay,
      netDogePerDay,
      powerCostPerDayUsd,
      totalRevenueUsd,
      netProfitUsd,
      payoutAmount
    } = res;

    let html = `
      <p><strong>Estimated Daily Rewards (after pool fee):</strong></p>
      <p>Litecoin: ${formatNumber(netLtcPerDay, 6)} LTC / day</p>
      <p>Dogecoin: ${formatNumber(netDogePerDay, 2)} DOGE / day</p>
      <p><strong>Power Cost:</strong> ${formatUsd(powerCostPerDayUsd)} per day</p>
      <p><strong>Estimated Revenue:</strong> ${formatUsd(
        totalRevenueUsd
      )} per day</p>
      <p><strong>Estimated Net Profit:</strong> ${formatUsd(
        netProfitUsd
      )} per day</p>
      <hr class="divider" />
    `;

    if (!isNaN(payoutAmount)) {
      if (payoutCoin === "LTC") {
        html += `
          <p><strong>Combined Payout (LTC):</strong> ${formatNumber(
            payoutAmount,
            6
          )} LTC / day</p>
          <p><strong>Combined Payout (USD):</strong> ${formatUsd(
            totalRevenueUsd
          )} per day</p>
        `;
      } else {
        html += `
          <p><strong>Combined Payout (DOGE):</strong> ${formatNumber(
            payoutAmount,
            2
          )} DOGE / day</p>
          <p><strong>Combined Payout (USD):</strong> ${formatUsd(
            totalRevenueUsd
          )} per day</p>
        `;
      }
    }

    resultsEl.innerHTML = html;
  });
});
