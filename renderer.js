// ---------------------- CONFIG & CONSTANTS ----------------------
const LTC_BLOCK_REWARD = 6.25;
const LTC_BLOCK_TIME_MIN = 2.5;
const DOGE_BLOCK_REWARD = 10000;
const DOGE_BLOCK_TIME_MIN = 1;

// These URLs work 100% on GitHub Pages (CORS fixed)
const LITESPACE_HASHRATE_URL = "https://litecoinspace.org/api/v1/mining/hashrate/3d";
const COINGECKO_PRICE_URL = "https://api.allorigins.win/get?url=" + encodeURIComponent(
  "https://api.coingecko.com/api/v3/simple/price?ids=litecoin,dogecoin&vs_currencies=usd"
);

function formatNumber(num, dec = 4) {
  if (isNaN(num) || !isFinite(num)) return "-";
  return num.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
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

// ---------------------- FETCH DATA ----------------------
async function fetchNetworkHashrates() {
  try {
    const res = await fetch(LITESPACE_HASHRATE_URL);
    const data = await res.json();
    const raw = data?.currentHashrate;
    if (typeof raw !== "number" || raw <= 0) return { ltcTh: NaN, dogeTh: NaN };
    const th = raw / 1e12;
    return { ltcTh: th, dogeTh: th };
  } catch (e) {
    console.error("Hashrate error:", e);
    return { ltcTh: NaN, dogeTh: NaN };
  }
}

async function fetchPrices() {
  try {
    const res = await fetch(COINGECKO_PRICE_URL);
    const proxy = await res.json();
    const data = JSON.parse(proxy.contents);
    const ltc = data?.litecoin?.usd;
    const doge = data?.dogecoin?.usd;
    if (typeof ltc !== "number" || typeof doge !== "number") return { ltcUsd: NaN, dogeUsd: NaN };
    return { ltcUsd: ltc, dogeUsd: doge };
  } catch (e) {
    console.error("Price error:", e);
    return { ltcUsd: NaN, dogeUsd: NaN };
  }
}

// ---------------------- UI STATE ----------------------
let currentHashrates = { ltcTh: NaN, dogeTh: NaN };
let currentPrices = { ltcUsd: NaN, dogeUsd: NaN };

function renderHashrateSummary() {
  const el = document.getElementById("hashrateSummary");
  if (!el) return;
  if (isNaN(currentHashrates.ltcTh)) {
    el.innerHTML = `<p class="error"><strong>Error:</strong> Hashrate unavailable</p>`;
    return;
  }
  const ph = currentHashrates.ltcTh / 1000;
  el.innerHTML = `
    <p><strong>Litecoin Network Hashrate:</strong> ${formatNumber(ph, 2)} PH/s</p>
    <p class="small-note">From litecoinspace.org • Dogecoin merge-mined</p>
  `;
}

function renderPriceSummary() {
  const el = document.getElementById("priceSummary");
  if (!el) return;
  if (isNaN(currentPrices.ltcUsd) || isNaN(currentPrices.dogeUsd)) {
    el.innerHTML = `<p class="error"><strong>Error:</strong> Prices unavailable</p>`;
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

// ---------------------- CALCULATION ----------------------
function calculateRewards(p) {
  const minerTH = p.hashRateGH / 1000;
  const ltcDaily = LTC_BLOCK_REWARD * (1440 / LTC_BLOCK_TIME_MIN);
  const dogeDaily = DOGE_BLOCK_REWARD * (1440 / DOGE_BLOCK_TIME_MIN);
  const ltcPerTh = ltcDaily / p.ltcNetworkTh;
  const dogePerTh = dogeDaily / p.dogeNetworkTh;
  const fee = 1 - (p.poolFeePercent || 0) / 100;
  const netLtc = minerTH * ltcPerTh * fee;
  const netDoge = minerTH * dogePerTh * fee;
  const powerCost = (p.powerW / 1000) * 24 * p.energyCostKWh;
  const revenueUsd = netLtc * p.ltcPriceUsd + netDoge * p.dogePriceUsd;
  const profitUsd = revenueUsd - powerCost;
  const payoutAmount = p.payoutCoin === "LTC" ? revenueUsd / p.ltcPriceUsd : revenueUsd / p.dogePriceUsd;
  let breakEvenDays = NaN;
  if (p.minerCostUsd > 0 && profitUsd > 0) breakEvenDays = p.minerCostUsd / profitUsd;
  return { netLtc, netDoge, powerCost, revenueUsd, profitUsd, payoutAmount, breakEvenDays };
}

// ---------------------- MAIN ----------------------
async function refreshLiveData() {
  const [hr, pr] = await Promise.all([fetchNetworkHashrates(), fetchPrices()]);
  currentHashrates = hr;
  currentPrices = pr;
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
      const mh = parseInt(btn.dataset.hash);
      const gh = (mh / 1000).toFixed(2).replace(/\.?0+$/, "");
      document.getElementById("hashRate").value = gh;
      document.getElementById("powerUsage").value = btn.dataset.power;
      form.dispatchEvent(new Event("submit"));
    });
  });

  form.addEventListener("submit", e => {
    e.preventDefault();
    const hashRateGH = parseFloat(document.getElementById("hashRate").value) || 0;
    const powerW = parseFloat(document.getElementById("powerUsage").value) || 0;
    const poolFee = parseFloat(document.getElementById("poolFee").value) || 0;
    const energyCost = parseFloat(document.getElementById("energyCost").value) || 0;
    const minerCost = parseFloat(document.getElementById("minerCost").value) || 0;
    const payoutCoin = document.getElementById("payoutCoin").value;

    if (!hashRateGH || !powerW) {
      resultsEl.innerHTML = '<p class="error">Enter hash rate and power usage.</p>';
      return;
    }
    if (isNaN(currentHashrates.ltcTh) || isNaN(currentPrices.ltcUsd)) {
      resultsEl.innerHTML = '<p class="error">Live data loading… Please wait.</p>';
      return;
    }

    const r = calculateRewards({
      hashRateGH, powerW, poolFeePercent: poolFee, energyCostKWh: energyCost,
      minerCostUsd: minerCost, ltcPriceUsd: currentPrices.ltcUsd, dogePriceUsd: currentPrices.dogeUsd,
      payoutCoin, ltcNetworkTh: currentHashrates.ltcTh, dogeNetworkTh: currentHashrates.dogeTh
    });

    let html = `
      <p><strong>Daily Rewards (after fee):</strong></p>
      <p>Litecoin: ${formatNumber(r.netLtc, 6)} LTC</p>
      <p>Dogecoin: ${formatNumber(r.netDoge, 2)} DOGE</p>
      <p><strong>Power Cost:</strong> ${formatUsd(r.powerCost)}</p>
      <p><strong>Revenue:</strong> ${formatUsd(r.revenueUsd)}</p>
      <p><strong>Net Profit:</strong> ${formatUsd(r.profitUsd)}</p>
      <hr class="divider"/>
      <p><strong>Payout in ${payoutCoin}:</strong> ${formatNumber(r.payoutAmount, payoutCoin === "LTC" ? 6 : 2)} ${payoutCoin}/day</p>
      <p class="muted">≈ ${formatUsd(r.revenueUsd)} USD/day</p>
    `;

    if (minerCost > 0) {
      if (r.profitUsd > 0) {
        html += `
          <hr class="divider" style="margin:14px 0"/>
          <p><strong>Break-even Time:</strong> ${formatBreakEvenYears(r.breakEvenDays)}</p>
          <p class="small-note">Based on $${formatNumber(minerCost, 0)} cost</p>
        `;
      } else {
        html += `
          <hr class="divider" style="margin:14px 0"/>
          <p class="error"><strong>Not profitable</strong> – daily loss ${formatUsd(-r.profitUsd)}</p>
        `;
      }
    }

    resultsEl.innerHTML = html;
  });
});
