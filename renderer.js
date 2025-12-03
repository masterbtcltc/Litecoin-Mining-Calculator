// ----------------------
// CONFIG & CONSTANTS
// ----------------------

// Block rewards and block times
const LTC_BLOCK_REWARD = 6.25;          // LTC per block
const LTC_BLOCK_TIME_MIN = 2.5;         // minutes

const DOGE_BLOCK_REWARD = 10000;        // DOGE per block
const DOGE_BLOCK_TIME_MIN = 1;          // minutes

// API endpoints
const MINERSTAT_LTC_URL = "https://api.minerstat.com/v2/coins?list=LTC";
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
  try {
    const res = await fetch(MINERSTAT_LTC_URL);
    if (!res.ok) {
      throw new Error("Minerstat response not ok: " + res.status);
    }

    const data = await res.json();
    // Minerstat coins API returns an array; we requested list=LTC so index 0 is LTC
    const ltc = Array.isArray(data)
      ? data.find((c) => c.coin === "LTC") || data[0]
      : null;

    const rawHashrate = ltc?.network_hashrate;

    // network_hashrate is in H/s :contentReference[oaicite:1]{index=1}
    if (typeof rawHashrate !== "number" || rawHashrate <= 0) {
      throw new Error("Invalid network_hashrate from Minerstat");
    }

    const ltcTh = rawHashrate / 1e12; // H/s -> TH/s
    const dogeTh = ltcTh;             // merge-mined: assume same Scrypt hashrate

    return { ltcTh, dogeTh };
  } catch (err) {
    console.error("Error fetching hashrates from Minerstat:", err);
    return { ltcTh: NaN, dogeTh: NaN };
  }
}

async function fetchPrices() {
  try {
    const res = await fetch(COINGECKO_SIMPLE_PRICE);
    if (!res.ok) {
      throw new Error("Price response not ok: " + res.status);
    }
    const data = await res.json();
    const ltcUsd = data?.litecoin?.usd;
    const dogeUsd = data?.dogecoin?.usd;

    if (
      typeof ltcUsd !== "number" ||
      ltcUsd <= 0 ||
      typeof dogeUsd !== "number" ||
      dogeUsd <= 0
    ) {
      throw new Error("Invalid price data");
    }

    return { ltcUsd, dogeUsd };
  } catch (err) {
    console.error("Error fetching prices from CoinGecko:", err);
    return { ltcUsd: NaN, dogeUsd: NaN };
  }
}

// ----------------------
// UI RENDERING
// ----------------------

let currentHashrates = {
  ltcTh: NaN,
  dogeTh: NaN
};

let currentPrices = {
  ltcUsd: NaN,
  dogeUsd: NaN
};

function renderHashrateSummary() {
  const { ltcTh, dogeTh } = currentHashrates;
  const el = document.getElementById("hashrateSummary");
  if (!el) return;

  if (isNaN(ltcTh) || isNaN(dogeTh)) {
    el.innerHTML = `
      <p class="error"><strong>Error:</strong> Unable to load network hashrate data. Please reload the page.</p>
    `;
    return;
  }

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

  if (isNaN(ltcUsd) || isNaN(dogeUsd)) {
    el.innerHTML = `
      <p class="error"><strong>Error:</strong> Unable to load price data. Please reload the page.</p>
    `;
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

  refreshLiveData(); // initial load

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
        '<p class="error">Please enter at least hash rate and power usage.</p>';
      return;
    }

    const { ltcTh, dogeTh } = currentHashrates;
    const { ltcUsd, dogeUsd } = currentPrices;

    if (isNaN(ltcTh) || isNaN(dogeTh)) {
      resultsEl.innerHTML =
        '<p class="error">Network hashrate data is not available. Please reload the page.</p>';
      return;
    }

    if (isNaN(ltcUsd) || isNaN(dogeUsd)) {
      resultsEl.innerHTML =
        '<p class="error">Price data is not available. Please reload the page.</p>';
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
      ltcNetworkTh: ltcTh,
      dogeNetworkTh: dogeTh
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
