const LTC_BLOCK_REWARD=6.25,LTC_BLOCK_TIME_MIN=2.5,DOGE_BLOCK_REWARD=10000,DOGE_BLOCK_TIME_MIN=1;
const HASHRATE_URL="https://litecoinspace.org/api/v1/mining/hashrate/3d";
const COINBASE_URL="https://api.coinbase.com/v2/exchange-rates?currency=USD";

function fmt(n,d=4){return isNaN(n)?'-':n.toLocaleString(void 0,{minimumFractionDigits:d,maximumFractionDigits:d});}
function usd(n){return isNaN(n)?'-':'$'+n.toLocaleString(void 0,{minimumFractionDigits:2,maximumFractionDigits:2});}
function years(d){if(d<30)return"< 1 month";if(d<365)return fmt(d/30.42,1)+" months";return fmt(d/365.25,2)+" years";}

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
    updatePriceDisplay(livePrices.ltc,livePrices.doge);
  }catch{
    document.getElementById("priceSummary").innerHTML=`<p class="error">Prices unavailable</p>`;
  }
}

function updatePriceDisplay(ltc,doge){
  document.getElementById("priceSummary").innerHTML=`
    <div class="price-line"><img src="ltclogo.png" alt="LTC" class="price-logo" onerror="this.style.display='none'"><strong>LTC Price:</strong> ${usd(ltc)}</div>
    <div class="price-line" style="margin-top:8px;"><img src="dogelogo.png" alt="DOGE" class="price-logo" onerror="this.style.display='none'"><strong>DOGE Price:</strong> ${usd(doge)}</div>
  `;
}

function calc(p){
  const th=p.hash/1000;
  const ltcDay=LTC_BLOCK_REWARD*(1440/LTC_BLOCK_TIME_MIN);
  const dogeDay=DOGE_BLOCK_REWARD*(1440/DOGE_BLOCK_TIME_MIN);
  const ltcPerTh=ltcDay/netHash.ltc;
  const dogePerTh=dogeDay/netHash.doge;
  const fee=1-(p.fee||0)/100;
  const netLtc=th*ltcPerTh*fee;
  const netDoge=th*dogePerTh*fee;
  const powerCost=(p.watts/1000)*24*p.electricity;
  const dailyRevenue=netLtc*p.priceLTC+netDoge*p.priceDOGE;
  const dailyProfit=dailyRevenue-powerCost;
  const monthlyProfit=dailyProfit*30.42;
  const payout=p.coin==="LTC"?dailyRevenue/p.priceLTC:dailyRevenue/p.priceDOGE;
  let breakEven=NaN;
  if(p.cost>0&&dailyProfit>0)breakEven=p.cost/dailyProfit;
  return {netLtc,netDoge,powerCost,dailyRevenue,dailyProfit,monthlyProfit,payout,breakEven};
}

document.addEventListener("DOMContentLoaded",()=>{
  const results=document.getElementById("results");
  const form=document.getElementById("miningForm");

  Promise.all([getHashrate(),getPrices()]);

  document.querySelectorAll(".preset-btn").forEach(b=>{
    b.addEventListener("click",()=>{
      document.getElementById("hashRate").value=b.dataset.hash;
      document.getElementById("powerUsage").value=b.dataset.power;
      form.dispatchEvent(new Event("submit"));
    });
  });

  form.addEventListener("submit",e=>{
    e.preventDefault();
    const hash=parseFloat(document.getElementById("hashRate").value)||0;
    const watts=parseFloat(document.getElementById("powerUsage").value)||0;
    const fee=parseFloat(document.getElementById("poolFee").value)||0;
    const elec=parseFloat(document.getElementById("energyCost").value)||0;
    const cost=parseFloat(document.getElementById("minerCost").value)||0;
    const coin=document.getElementById("payoutCoin").value;

    const hypoLTC=parseFloat(document.getElementById("hypoLTC").value);
    const hypoDOGE=parseFloat(document.getElementById("hypoDOGE").value);
    const priceLTC=isNaN(hypoLTC)?livePrices.ltc:hypoLTC;
    const priceDOGE=isNaN(hypoDOGE)?livePrices.doge:hypoDOGE;

    if(!isNaN(hypoLTC)||!isNaN(hypoDOGE)) updatePriceDisplay(priceLTC,priceDOGE);

    if(!hash||!watts){results.innerHTML='<p class="error">Enter hash rate and power</p>';return;}
    if(isNaN(netHash.ltc)||isNaN(livePrices.ltc)){results.innerHTML='<p class="error">Loading live data…</p>';return;}

    const r=calc({hash,watts,fee,electricity:elec,cost,coin,priceLTC,priceDOGE});

    let html=`
      <p><strong>Daily Rewards (after fee):</strong></p>
      <p>Litecoin: ${fmt(r.netLtc,6)} LTC</p>
      <p>Dogecoin: ${fmt(r.netDoge,2)} DOGE</p>
      <p><strong>Power Cost:</strong> ${usd(r.powerCost)}</p>
      <p><strong>Daily Revenue:</strong> ${usd(r.dailyRevenue)}</p>
      <p><strong>Daily Profit:</strong> ${usd(r.dailyProfit)}</p>
      <p><strong>Monthly Profit (30.42 days):</strong> ${usd(r.monthlyProfit)}</p>
      <hr class="divider"/>
      <p><strong>Payout in ${coin}:</strong> ${fmt(r.payout,coin==="LTC"?6:2)} ${coin}/day</p>
      <p class="muted">≈ ${usd(r.dailyRevenue)} USD/day • ${usd(r.monthlyProfit)}/month</p>
    `;
    if(cost>0){
      if(r.dailyProfit>0){
        html+=`<hr class="divider" style="margin:14px 0"/><p><strong>Break-even:</strong> ${years(r.breakEven)}</p>`;
      }else{
        html+=`<hr class="divider" style="margin:14px 0"/><p class="error"><strong>Not profitable</strong></p>`;
      }
    }
    results.innerHTML=html;
  });

  ["hypoLTC","hypoDOGE"].forEach(id=>document.getElementById(id)?.addEventListener("input",()=>form.dispatchEvent(new Event("submit"))));
});
