// ---------------------- CONFIG & CONSTANTS ----------------------
const LTC_BLOCK_REWARD = 6.25;
const LTC_BLOCK_TIME_MIN = 2.5;
const DOGE_BLOCK_REWARD = 10000;
const DOGE_BLOCK_TIME_MIN = 1;

const LITESPACE_HASHRATE_URL = "https://litecoinspace.org/api/v1/mining/hashrate/3d";
const COINGECKO_SIMPLE_PRICE = "https://api.coingecko.com/api/v3/simple/price?ids=litecoin,dogecoin&vs_currencies=usd";

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

// ---------------------- LIVE DATA ----------------------
async function fetchNetworkHashrates() {
  try {
    const res = await fetch(LITESPACE_HASHRATE_URL);
    if (!res.ok) throw new Error("Hashrate error");
    const data = await res.json();
    const raw = data?.currentHashrate;
    if (typeof raw !== "number" || raw <= 0) throw new Error("Bad hashrate");
    const ltcTh = raw / 1e12;
    return { ltcTh, dogeTh: ltcTh };
  } catch { return { ltcTh: NaN, dogeTh: NaN }; }
}

async function fetchPrices() {
  try {
    const res = await fetch(COINGECKO_SIMPLE_PRICE);
    if (!res.ok) throw new Error("Price error");
    const data = await res.json();
    const ltcUsd = data?.litecoin?.usd;
    const dogeUsd = data?.dogecoin?.usd;
    if (typeof ltcUsd !== "number" || typeof dogeUsd !== "number") throw new Error("Bad price");
    return { ltcUsd, dogeUsd };
  } catch { return { ltcUsd: NaN, dogeUsd: NaN }; }
}

// ---------------------- UI ----------------------
let currentHashrates = { ltcTh: NaN, dogeTh: NaN };
let currentPrices = { ltcUsd: NaN, dogeUsd: NaN };

function renderHashrateSummary() {
  const el = document.getElementById("hashrateSummary");
  if (!el) return;
  if (isNaN(currentHashrates.ltcTh)) {
    el.innerHTML = `<p class="error"><strong>Error:</strong> Unable to load hashrate.</p>`;
    return;
  }
  const ph = currentHashrates.ltcTh / 1000;
  el.innerHTML = `
    <p><strong>Litecoin Network Hashrate:</strong> ${formatNumber(ph, 2)} PH/s (current)</p>
    <p class="small-note">From litecoinspace.org • Dogecoin merge-mined</p>
  `;
}

function renderPriceSummary() {
  const el = document.getElementById("priceSummary");
  if (!el) return;
  if (isNaN(currentPrices.ltcUsd) || isNaN(currentPrices.dogeUsd)) {
    el.innerHTML = `<p class="error"><strong>Error:</strong> Unable to load prices.</p>`;
    return;
  }
  el.innerHTML = `
    <div class="price-line">
      <img src="ltclogo.png" alt="LTC" class="price-logo">
      <strong>LTC Price:</strong> ${formatUsd(currentPrices.ltcUsd)}
    </div>
    <div class="price-line" style="margin-top:8px;">
      <img src="dogelogo.png" alt="DOGE" class="price-logo">
      <strong>DOGE Price:</strong> ${formatUsd(currentPrices.dogeUsd)}
    </div>
  `;
}

// ---------------------- CALCULATOR ----------------------
function calculateRewards(p) {
  const minerTH = p.hashRateGH / 1000;
  const ltcDailyReward = LTC_BLOCK_REWARD * (1440 / LTC_BLOCK_TIME_MIN);
  const dogeDailyReward = DOGE_BLOCK_REWARD * (1440 / DOGE_BLOCK_TIME_MIN);
  const ltcPerThDay = ltcDailyReward / p.ltcNetworkTh;
  const dogePerThDay = dogeDailyReward / p.dogeNetworkTh;

  const grossLtc = minerTH * ltcPerThDay;
  const grossDoge = minerTH * dogePerThDay;
  const feeFactor = 1 - (p.poolFeePercent || 0) / 100;
  const netLtc = grossLtc * feeFactor;
  const netDoge = grossDoge * feeFactor;

  const powerCost = (p.powerW / 1000) * 24 * p.energyCostKWh;
  const totalRevenueUsd = netLtc * p.ltcPriceUsd + netDoge * p.dogePriceUsd;
  const netProfitUsd = totalRevenueUsd - powerCost;

  const payoutAmount = p.payoutCoin === "LTC"
    ? totalRevenueUsd / p.ltcPriceUsd
    : totalRevenueUsd / p.dogePriceUsd;

  let breakEvenDays = NaN;
  if (p.minerCostUsd > 0 && netProfitUsd > 0) breakEvenDays = p.minerCostUsd / netProfitUsd;

  return { netLtc, netDoge, powerCost, totalRevenueUsd, netProfitUsd, payoutAmount, breakEvenDays };
}

// ---------------------- BOOTSTRAP ----------------------
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

  // PRESET MINER BUTTONS — 100% WORKING
  document.querySelectorAll(".preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const mh = parseInt(btn.dataset.hash);                    // 9500, 17000, etc.
      const gh = (mh / 1000).toFixed(2).replace(/\.?0+$/, "");   // → "9.5", "17", etc.

      document.getElementById("hashRate").value = gh;
      document.getElementById("powerUsage").value = btn.dataset.power;

      // Auto calculate instantly
      form.dispatchEvent(new Event("submit"));
    });
  });

  form.addEventListener("submit", e => {
    e.preventDefault();

    const hashRateGH = parseFloat(document.getElementById("hashRate").value) || 0;
    const powerW = parseFloat(document.getElementById("powerUsage").value) || 0;
    const poolFeePercent = parseFloat(document.getElementById("poolFee").value) || 0;
    const energyCostKWh = parseFloat(document.getElementById("energyCost").value) || 0;
    const minerCostUsd = parseFloat(document.getElementById("minerCost").value) || 0;
    const payoutCoin = document.getElementById("payoutCoin").value;

    if (!hashRateGH || !powerW) {
      resultsEl.innerHTML = '<p class="error">Please enter hash rate and power usage.</p>';
      return;
    }
    if (isNaN(currentHashrates.ltcTh) || isNaN(currentPrices.ltcUsd)) {
      resultsEl.innerHTML = '<p class="error">Live data not ready. Please wait or reload.</p>';
      return;
    }

    const res = calculateRewards({
      hashRateGH,
      powerW,
      poolFeePercent,
      energyCostKWh,
      minerCostUsd,
      ltcPriceUsd: currentPrices.ltcUsd,
      dogePriceUsd: currentPrices.dogeUsd,
      payoutCoin,
      ltcNetworkTh: currentHashrates.ltcTh,
      dogeNetworkTh: currentHashrates.dogeTh
    });

    let html = `
      <p><strong>Estimated Daily Rewards (after pool fee):</strong></p>
      <p>Litecoin: ${formatNumber(res.netLtc, 6)} LTC / day</p>
      <p>Dogecoin: ${formatNumber(res.netDoge, 2)} DOGE / day</p>
      <p><strong>Power Cost:</strong> ${formatUsd(res.powerCost)} per day</p>
      <p><strong>Revenue:</strong> ${formatUsd(res.totalRevenueUsd)} per day</p>
      <p><strong>Net Profit:</strong> ${formatUsd(res.netProfitUsd)} per day</p>
      <hr class="divider" />
      <p><strong>Equivalent Daily Payout in ${payoutCoin}:</strong></p>
      <p>${formatNumber(res.payoutAmount, payoutCoin === "LTC" ? 6 : 2)} ${payoutCoin} / day</p>
      <p class="muted">≈ ${formatUsd(res.totalRevenueUsd)} USD / day</p>
    `;

    if (minerCostUsd > 0) {
      if (res.netProfitUsd > 0) {
        html += `
          <hr class="divider" style="margin:14px 0" />
          <p><strong>Break-even Time:</strong> ${formatBreakEvenYears(res.breakEvenDays)}</p>
          <p class="small-note">Based on $${formatNumber(minerCostUsd, 0)} hardware cost</p>
        `;
      } else {
        html += `
          <hr class="divider" style="margin:14px 0" />
          <p class="error"><strong>Not profitable</strong> — daily loss of ${formatUsd(-res.netProfitUsd)}</p>
        `;
      }
    }

    resultsEl.innerHTML = html;
  });
});
