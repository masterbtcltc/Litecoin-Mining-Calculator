// ----------------------
// CONFIG & CONSTANTS
// ----------------------

// Block rewards and block times
const LTC_BLOCK_REWARD = 6.25;          // LTC per block
const LTC_BLOCK_TIME_MIN = 2.5;         // minutes

const DOGE_BLOCK_REWARD = 10000;        // DOGE per block
const DOGE_BLOCK_TIME_MIN = 1;          // minutes

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
  try {
    const [ltcRes, dogeRes] = await Promise.all([
      fetch(SOCHAIN_LTC_INFO_URL),
      fetch(SOCHAIN_DOGE_INFO_URL)
    ]);

    if (!ltcRes.ok || !dogeRes.ok) {
      throw new Error("Network response was not ok");
    }

    const ltcData = await ltcRes.json();
    const dogeData = await dogeRes.json();

    const ltcHps = ltcData?.data?.hashrate;
    const dogeHps = dogeData?.data?.hashrate;

    if (typeof ltcHps !== "number" || ltcHps <= 0 ||
        typeof dogeHps !== "number" || dogeHps <= 0) {
      throw new Error("Invalid hashrate data");
    }

    const ltcTh = ltcHps / 1e12;   // H/s -> TH/s
    const dogeTh = dogeHps / 1e12; // H/s -> TH/s

    return { ltcTh, dogeTh };
  } catch (err) {
    console.error("Error fetching hashrates:", err);
    return { ltcTh: NaN, dogeTh: NaN };
  }
}

async function fetchPrices() {
  try {
    const res = await fetch(COINGECKO_SIMPLE_PRICE);
    if (!res.ok) {
      throw new Error("Price response not ok");
    }
    const data = await res.json();
    const ltcUsd = data?.litecoin?.usd;
    const dogeUsd = data?.dogecoin?.usd;

    if (typeof ltcUsd !== "number" || ltcUsd <= 0 ||
        typeof dogeUsd !== "number" || dogeUsd <= 0) {
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

let currentHashrates = {
  ltcTh: NaN,
  dogeTh: NaN
};

let currentPrices = {
  lt
