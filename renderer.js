const LTC_BLOCK_REWARD=6.25,LTC_BLOCK_TIME_MIN=2.5,DOGE_BLOCK_REWARD=10000,DOGE_BLOCK_TIME_MIN=1;
const HASHRATE_URL="https://litecoinspace.org/api/v1/mining/hashrate/3d";
const COINBASE_URL="https://api.coinbase.com/v2/exchange-rates?currency=USD";

function fmt(n,d=4){return isNaN(n)?'-':n.toLocaleString(void 0,{minimumFractionDigits:d,maximumFractionDigits:d});}
function usd(n){return isNaN(n)?'-':'$'+n.toLocaleString(void 0,{minimumFractionDigits:2,maximumFractionDigits:2});}
function years(d){if(d<30)return"< 1 month";if(d<365)return fmt(d/30.42,1)+" months";return fmt(d/365.25,2)+" years";}
function debounce(fn,delay){let t;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),delay);};}

let netHash={ltc:NaN,doge:NaN},livePrices={ltc:NaN,doge:NaN};

async function getHashrate(){
  try{
    const r=await fetch(HASHRATE_URL);
    const j=await r.json();
    const raw=j?.currentHashrate;
    if(typeof raw!=="number")throw"bad";
    const th=raw/1e12;
    netHash={ltc:th,doge:th};
    document.getElementById("hashrateSummary").innerHTML=`<p><strong>Network Hashrate:</strong> ${fmt(th/1000,2)} PH/s</p><p class="small-note">From litecoinspace.org • Dogecoin merge-mined</p>`;
  }catch{
    document.getElementById("hashrateSummary").innerHTML=`<p class="error">Hashrate unavailable</p>`;
  }
}

async function getPrices(){
  try{
    const r=await fetch(COINBASE_URL);
    const j=await r.json();
    const rates=j.data.rates;
    livePrices.ltc=1/parseFloat(rates.LTC);
    livePrices.doge=1/parseFloat(rates.DOGE);
    document.getElementById("priceSummary").innerHTML=`
      <div class="price-line"><img src="ltclogo.png" alt="LTC" class="price-logo" onerror="this.style.display='none'"><strong>LTC Price:</strong> ${usd(livePrices.ltc)}</div>
      <div class="price-line" style="margin-top:8px;"><img src="dogelogo.png" alt="DOGE" class="price-logo" onerror="this.style.display='none'"><strong>DOGE Price:</strong> ${usd(livePrices.doge)}</div>
    `;
  }catch{
    document.getElementById("priceSummary").innerHTML=`<p class="error">Prices unavailable</p>`;
  }
}

function calc(p){
  const qty = p.qty || 1;
  const th = (p.hash * qty) / 1000;
  const ltcDay = LTC_BLOCK_REWARD * (1440 / LTC_BLOCK_TIME_MIN);
  const dogeDay = DOGE_BLOCK_REWARD * (1440 / DOGE_BLOCK_TIME_MIN);
  const ltcPerTh = ltcDay / netHash.ltc;
  const dogePerTh = dogeDay / netHash.doge;
  const fee = 1 - (p.fee || 0) / 100;
  const netLtc = th * ltcPerTh * fee;
  const netDoge = th * dogePerTh * fee;
  const powerCost = (p.watts * qty / 1000) * 24 * p.electricity;
  const yearlyPowerCost = powerCost * 365.25;
  const monthlyPowerCost = yearlyPowerCost / 12;
  const revenue = netLtc * p.priceLTC + netDoge * p.priceDOGE;
  const profit = revenue - powerCost;
  const yearlyProfit = profit * 365.25;
  const monthlyProfit = yearlyProfit / 12;
  const payout = p.coin === "LTC" ? revenue / p.priceLTC : revenue / p.priceDOGE;
  let breakEven = NaN;
  if (p.cost > 0 && profit > 0) breakEven = (p.cost * qty) / profit;
  return {netLtc,netDoge,powerCost,monthlyPowerCost,yearlyPowerCost,revenue,profit,monthlyProfit,yearlyProfit,payout,breakEven,qty};
}

document.addEventListener("DOMContentLoaded",()=>{
  const results=document.getElementById("results");
  const form=document.getElementById("miningForm");

  Promise.all([getHashrate(),getPrices()]).catch(err=>console.error("API load failed:",err));

  document.querySelectorAll(".preset-btn").forEach(b=>{
    b.addEventListener("click",()=>{
      document.getElementById("hashRate").value=b.dataset.hash;
      document.getElementById("powerUsage").value=b.dataset.power;
      document.getElementById("quantity").value=1;
      form.dispatchEvent(new Event("submit"));
    });
  });

  form.addEventListener("submit",e=>{
    e.preventDefault();
    const hash=parseFloat(document.getElementById("hashRate").value)||0;
    const watts=parseFloat(document.getElementById("powerUsage").value)||0;
    const qty=parseFloat(document.getElementById("quantity").value)||1;
    const fee=parseFloat(document.getElementById("poolFee").value)||0;
    const elec=parseFloat(document.getElementById("energyCost").value)||0;
    const cost=parseFloat(document.getElementById("minerCost").value)||0;
    const coin=document.getElementById("payoutCoin").value;

    const hypoLTC=parseFloat(document.getElementById("hypoLTC").value);
    const hypoDOGE=parseFloat(document.getElementById("hypoDOGE").value);
    const priceLTC=isNaN(hypoLTC)?livePrices.ltc:hypoLTC;
    const priceDOGE=isNaN(hypoDOGE)?livePrices.doge:hypoDOGE;

    if(!hash||!watts){results.innerHTML='<p class="error">Enter hash rate and power</p>';return;}
    if(hash<0||watts<0||qty<1||elec<0||cost<0){results.innerHTML='<p class="error">Values cannot be negative</p>';return;}
    if(fee<0||fee>100){results.innerHTML='<p class="error">Pool fee must be 0-100%</p>';return;}
    if(coin!=="LTC"&&coin!=="DOGE"){results.innerHTML='<p class="error">Invalid payout coin</p>';return;}
    if(isNaN(netHash.ltc)||isNaN(livePrices.ltc)){results.innerHTML='<p class="error">Loading live data…</p>';return;}

    const r=calc({hash,watts,qty,fee,electricity:elec,cost,coin,priceLTC,priceDOGE});

    let html=`
      <p><strong>Daily Rewards (after fee) — ${fmt(qty,0)} miner${qty>1?'s':''}:</strong></p>
      <p>Litecoin: ${fmt(r.netLtc,6)} LTC</p>
      <p>Dogecoin: ${fmt(r.netDoge,2)} DOGE</p>
      <p><strong>Daily Power Cost:</strong> ${usd(r.powerCost)}</p>
      <p><strong>Monthly Power Cost:</strong> ${usd(r.monthlyPowerCost)}</p>
      <p><strong>Yearly Power Cost:</strong> ${usd(r.yearlyPowerCost)}</p>
      <p><strong>Daily Revenue:</strong> ${usd(r.revenue)}</p>
      <p><strong>Daily Profit:</strong> ${usd(r.profit)}</p>
      <p><strong>Monthly Profit:</strong> ${usd(r.monthlyProfit)}</p>
      <p><strong>Yearly Profit:</strong> ${usd(r.yearlyProfit)}</p>
      <hr class="divider"/>
      <p><strong>Payout in ${coin}:</strong> ${fmt(r.payout,coin==="LTC"?6:2)} ${coin}/day</p>
      <p class="muted">≈ ${usd(r.revenue)} USD/day • ${usd(r.monthlyProfit)}/month</p>
    `;

    if(!isNaN(hypoLTC)||!isNaN(hypoDOGE)){
      html+=`<p class="small-note"><strong>Hypothetical prices used:</strong> LTC $${fmt(priceLTC,2)} • DOGE $${fmt(priceDOGE,4)}</p>`;
    }

    if(cost>0){
      if(r.profit>0){
        html+=`<hr class="divider" style="margin:14px 0"/><p><strong>Break-even (all ${fmt(qty,0)} miners):</strong> ${years(r.breakEven)}</p>`;
      }else{
        html+=`<hr class="divider" style="margin:14px 0"/><p class="error"><strong>Not profitable</strong></p>`;
      }
    }
    results.innerHTML=html;
  });

  const debouncedSubmit=debounce(()=>form.dispatchEvent(new Event("submit")),300);
  ["hashRate","powerUsage","quantity","poolFee","energyCost","minerCost","hypoLTC","hypoDOGE","payoutCoin"].forEach(id=>
    document.getElementById(id)?.addEventListener("input",debouncedSubmit)
  );
});
