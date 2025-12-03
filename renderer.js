// ----- CONSTANTS: NETWORK + REWARDS -----
// You can update these any time to match current network conditions.

// Litecoin
const LTC_BLOCK_REWARD = 6.25;          // LTC per block
const LTC_BLOCK_TIME_MIN = 2.5;         // minutes per block
const LTC_NETWORK_HASHRATE_TH = 3600;   // TH/s (update as needed)

// Dogecoin (merged mined with LTC)
const DOGE_BLOCK_REWARD = 10000;        // DOGE per block
const DOGE_BLOCK_TIME_MIN = 1;          // minutes per block
const DOGE_NETWORK_HASHRATE_TH = 3500;  // TH/s (update as needed)

// ----- HELPERS -----

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

// ----- HASHRATE SUMMARY AT TOP -----

function renderHashrateSummary() {
  const ltcHash = LTC_NETWORK_HASHRATE_TH;
  const dogeHash = DOGE_NETWORK_HASHRATE_TH;
  const totalHash = ltcHash + dogeHash;

  const summaryEl = document.getElementById("hashrateSummary");
  if (!summaryEl) return;

  summaryEl.innerHTML = `
    <p><strong>Litecoin Network Hashrate:</strong> ${formatNumber(ltcHash, 2)} TH/s</p>
    <p><strong>Dogecoin Network Hashrate:</strong> ${formatNumber(dogeHash, 2)} TH/s</p>
    <p><strong>Total Combined Hashrate:</strong> ${formatNumber(totalHash, 2)} TH/s</p>
  `;
}

// ----- MAIN CALCULATION -----

function calculateRewards(params) {
  const {
    hashRateGH,
    powerW,
    poolFeePercent,
    energyCostKWh,
    ltcPriceUsd,
    dogePriceUsd,
    payoutCoin
  } = params;

  // Convert miner hashrate to TH/s
  const minerHashTH = hashRateGH / 1000;

  // Blocks per day
  const ltcBlocksPerDay = 1440 / LTC_BLOCK_TIME_MIN;
  const dogeBlocksPerDay = 1440 / DOGE_BLOCK_TIME_MIN;

  // Network daily rewards
  const ltcDailyNetworkReward = LTC_BLOCK_REWARD * ltcBlocksPerDay;   // LTC/day network
  const dogeDailyNetworkReward = DOGE_BLOCK_REWARD * dogeBlocksPerDay; // DOGE/day network

  // Rewards per TH/s per day
  const ltcPerThPerDay = ltcDailyNetworkReward / LTC_NETWORK_HASHRATE_TH;
  const dogePerThPerDay = dogeDailyNetworkReward / DOGE_NETWORK_HASHRATE_TH;

  // Miner gross rewards (before pool fee)
  const grossLtcPerDay = minerHashTH * ltcPerThPerDay;
  const grossDogePerDay = minerHashTH * dogePerThPerDay;

  const feeFactor = 1 - (poolFeePercent || 0) / 100;

  const netLtcPerDay = grossLtcPerDay * feeFactor;
  const netDogePerDay = grossDogePerDay * feeFactor;

  // Power cost
  const kW = powerW / 1000;
  const kWhPerDay = kW * 24;
  const powerCostPerDayUsd = kWhPerDay * energyCostKWh;

  // Revenue in USD (if prices are given)
  const hasLtcPrice = ltcPriceUsd > 0;
  const hasDogePrice = dogePriceUsd > 0;

  let ltcRevenueUsd = NaN;
  let dogeRevenueUsd = NaN;
  let totalRevenueUsd = NaN;
  let netProfitUsd = NaN;

  if (hasLtcPrice) {
    ltcRevenueUsd = netLtcPerDay * ltcPriceUsd;
  }
  if (hasDogePrice) {
    dogeRevenueUsd = netDogePerDay * dogePriceUsd;
  }
  if (hasLtcPrice && hasDogePrice) {
    totalRevenueUsd = ltcRevenueUsd + dogeRevenueUsd;
    netProfitUsd = totalRevenueUsd - powerCostPerDayUsd;
  }

  // Convert total revenue to desired payout coin (if prices available)
  let payoutAmount = NaN;
  if (!isNaN(totalRevenueUsd)) {
    if (payoutCoin === "LTC" && hasLtcPrice) {
      payoutAmount = totalRevenueUsd / ltcPriceUsd;
    } else if (payoutCoin === "DOGE" && hasDogePrice) {
      payoutAmount = totalRevenueUsd / dogePriceUsd;
    }
  }

  return {
    netLtcPerDay,
    netDogePerDay,
    powerCostPerDayUsd,
    ltcRevenueUsd,
    dogeRevenueUsd,
    totalRevenueUsd,
    netProfitUsd,
    payoutAmount
  };
}

// ----- DOM WIRING -----

document.addEventListener("DOMContentLoaded", () => {
  renderHashrateSummary();

  const form = document.getElementById("miningForm");
  const resultsEl = document.getElementById("results");

  if (!form || !resultsEl) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const hashRateGH = parseFloat(document.getElementById("hashRate").value || "0");
    const powerW = parseFloat(document.getElementById("powerUsage").value || "0");
    const poolFeePercent = parseFloat(document.getElementById("poolFee").value || "0");
    const energyCostKWh = parseFloat(document.getElementById("energyCost").value || "0");

    const ltcPriceUsd = parseFloat(document.getElementById("ltcPrice").value || "0");
    const dogePriceUsd = parseFloat(document.getElementById("dogePrice").value || "0");

    const payoutCoin = document.getElementById("payoutCoin").value;

    if (!hashRateGH || !powerW) {
      resultsEl.innerHTML = `<p>Please enter at least hash rate and power usage.</p>`;
      return;
    }

    const res = calculateRewards({
      hashRateGH,
      powerW,
      poolFeePercent,
      energyCostKWh,
      ltcPriceUsd,
      dogePriceUsd,
      payoutCoin
    });

    const {
      netLtcPerDay,
      netDogePerDay,
      powerCostPerDayUsd,
      ltcRevenueUsd,
      dogeRevenueUsd,
      totalRevenueUsd,
      netProfitUsd,
      payoutAmount
    } = res;

    let html = `
      <p><strong>Estimated Daily Rewards (after pool fee):</strong></p>
      <p>Litecoin: ${formatNumber(netLtcPerDay, 6)} LTC / day</p>
      <p>Dogecoin: ${formatNumber(netDogePerDay, 2)} DOGE / day</p>
      <p><strong>Power Cost:</strong> ${formatUsd(powerCostPerDayUsd)} per day</p>
    `;

    if (!isNaN(totalRevenueUsd)) {
      html += `
        <p><strong>Estimated Revenue:</strong> ${formatUsd(totalRevenueUsd)} per day</p>
        <p><strong>Estimated Net Profit:</strong> ${formatUsd(netProfitUsd)} per day</p>
      `;
    } else {
      html += `
        <p class="small-note">
          Enter both LTC and DOGE prices to see USD revenue and net profit.
        </p>
      `;
    }

    if (!isNaN(payoutAmount)) {
      html += `
        <p><strong>Combined Payout (value of LTC + DOGE in ${payoutCoin}):</strong> 
        ${formatNumber(payoutAmount, payoutCoin === "LTC" ? 6 : 2)} ${payoutCoin} / day</p>
      `;
    } else {
      html += `
        <p class="small-note">
          To compute equivalent payout in ${payoutCoin}, please enter the price for that coin.
        </p>
      `;
    }

    resultsEl.innerHTML = html;
  });
});
