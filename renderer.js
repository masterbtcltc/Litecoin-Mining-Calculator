const LTC_BLOCK_REWARD=6.25,LTC_BLOCK_TIME_MIN=2.5,DOGE_BLOCK_REWARD=10000,DOGE_BLOCK_TIME_MIN=1;
const HASHRATE_URL="https://litecoinspace.org/api/v1/mining/hashrate/3d";
const COINBASE_URL="https://api.coinbase.com/v2/exchange-rates?currency=USD";

function fmt(n,d=4){return isNaN(n)?'-':n.toLocaleString(void 0,{minimumFractionDigits:d,maximumFractionDigits:d});}
function usd(n){return isNaN(n)?'-':'$'+n.toLocaleString(void 0,{minimumFractionDigits:2,maximumFractionDigits:2});}
function years(d){if(d<30)return"< 1 month";if(d<365)return fmt(d/30.42,1)+" months";return fmt(d/365.25,2)+" years";}

let netHash={ltc:NaN,doge:NaN},prices={ltc:NaN,doge:NaN};

async function getHashrate(){
  try{
    const r=await fetch(HASHRATE_URL);
    const j=await r.json();
    const raw=j?.currentHashrate;
    if(typeof raw!=="number")throw"bad";
    const th=raw/1e12;
    netHash={ltc:th,doge:th};
    document.getElementById("hashrateSummary").innerHTML=`<p><strong>Litecoin Network Hashrate:</strong> ${fmt(th/1000,2)} PH/s</p><p class="small-note">From litecoinspace.org • Dogecoin merge-mined</p>`;
  }catch{
    document.getElementById("hashrateSummary").innerHTML=`<p class="error">Hashrate unavailable</p>`;
  }
}

async function getPrices(){
  try{
    const r=await fetch(COINBASE_URL);
    const j=await r.json();
    prices.ltc=j.data.rates.LTC;
    prices.doge=j.data.rates.DOGE;
    document.getElementById("priceSummary").innerHTML=`
      <div class="price-line"><img src="ltclogo.png" alt="LTC" class="price-logo" onerror="this.style.display='none'"><strong>LTC Price:</strong> ${usd(prices.ltc)}</div>
      <div class="price-line" style="margin-top:8px;"><img src="dogelogo.png" alt="DOGE" class="price-logo" onerror="this.style.display='none'"><strong>DOGE Price:</strong> ${usd(prices.doge)}</div>
    `;
  }catch{
    document.getElementById("priceSummary").innerHTML=`<p class="error">Prices unavailable</p>`;
  }
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
  const revenue=netLtc*prices.ltc+netDoge*prices.doge;
  const profit=revenue-powerCost;
  const payout=p.coin==="LTC"?revenue/prices.ltc:revenue/prices.doge;
  let breakEven=NaN;
  if(p.cost>0&&profit>0)breakEven=p.cost/profit;
  return {netLtc,netDoge,powerCost,revenue,profit,payout,breakEven};
}

document.addEventListener("DOMContentLoaded",()=>{
  const results=document.getElementById("results");
  const form=document.getElementById("miningForm");
  Promise.all([getHashrate(),getPrices()]);
  document.querySelectorAll(".preset-btn").forEach(b=>{
    b.addEventListener("click",()=>{
      const mh=parseInt(b.dataset.hash);
      document.getElementById("hashRate").value=(mh/1000).toFixed(2).replace(/\.?0+$/,"");
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
    if(!hash||!watts){results.innerHTML='<p class="error">Enter hash rate and power</p>';return;}
    if(isNaN(netHash.ltc)||isNaN(prices.ltc)){results.innerHTML='<p class="error">Loading live data…</p>';return;}
    const r=calc({hash,watts,fee,electricity:elec,cost,coin});
    let html=`
      <p><strong>Daily Rewards (after fee):</strong></p>
      <p>Litecoin: ${fmt(r.netLtc,6)} LTC</p>
      <p>Dogecoin: ${fmt(r.netDoge,2)} DOGE</p>
      <p><strong>Power Cost:</strong> ${usd(r.powerCost)}</p>
      <p><strong>Revenue:</strong> ${usd(r.revenue)}</p>
      <p><strong>Net Profit:</strong> ${usd(r.profit)}</p>
      <hr class="divider"/>
      <p><strong>Payout in ${coin}:</strong> ${fmt(r.payout,coin==="LTC"?6:2)} ${coin}/day</p>
      <p class="muted">≈ ${usd(r.revenue)} USD/day</p>
    `;
    if(cost>0){
      if(r.profit>0){
        html+=`<hr class="divider" style="margin:14px 0"/><p><strong>Break-even:</strong> ${years(r.breakEven)}</p>`;
      }else{
        html+=`<hr class="divider" style="margin:14px 0"/><p class="error"><strong>Not profitable</strong> – daily loss ${usd(-r.profit)}</p>`;
      }
    }
    results.innerHTML=html;
  });
});
