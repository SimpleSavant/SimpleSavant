'use strict';
// Both batting.html and pitching.html use templates/profile-base.html.
const mode=location.pathname.toLowerCase().endsWith('pitching.html')?'pitching':'batting';
const id=new URLSearchParams(location.search).get('id');
const root=document.getElementById('profile-root');

// Weights describe the contribution of each CATEGORY to the overall bar,
// not the contribution of individual raw units (ERA, mph, percentages).
const categorySets={
  batting:[
    {name:'Power',weight:.40,metrics:[
      {name:'Expected Slugging (xSLG)',key:'xslg',raw:'xslg',kind:'decimal3'},
      {name:'Barrel%',key:'brl_percent',raw:'barrel_batted_rate',kind:'pct1'},
      {name:'Hard-Hit%',key:'hard_hit_percent',raw:'hard_hit_percent',kind:'pct1'}
    ]},
    {name:'Contact Ability',weight:.40,metrics:[
      {name:'Expected Batting Average (xBA)',key:'xba',raw:'xba',kind:'decimal3'},
      {name:'Expected wOBA',key:'xwoba',raw:'xwoba',kind:'decimal3'},
      {name:'Squared-Up Rate',key:'squared_up_rate',raw:'squared_up_swing',kind:'pct1'}
    ]},
    {name:'Plate Discipline',weight:.10,metrics:[
      {name:'Chase%',key:'chase_percent',raw:'oz_swing_percent',kind:'pct1'},
      {name:'Strikeout%',key:'k_percent',raw:'k_percent',kind:'pct1',fallback:'strikeouts'},
      {name:'Walk (BB)%',key:'bb_percent',raw:'bb_percent',kind:'pct1',fallback:'walks'},
      {name:'Whiff%',key:'whiff_percent',raw:'whiff_percent',kind:'pct1'}
    ]},
    {name:'Swing Quality',weight:.10,metrics:[
      {name:'Bat Speed',key:'bat_speed',raw:'avg_swing_speed',kind:'mph1'},
      {name:'Average Exit Velocity',key:'exit_velocity',raw:'exit_velocity_avg',kind:'mph1'},
      {name:'Squared-Up Rate',key:'squared_up_rate',raw:'squared_up_swing',kind:'pct1'}
    ]}
  ],
  pitching:[
    {name:'Run Prevention',weight:.40,metrics:[
      {name:'xERA',desc:'Expected Earned Run Average',key:'xera',raw:'xera',kind:'decimal2'},
      {name:'xBA',desc:'Expected Batting Average allowed',key:'xba',raw:'xba',kind:'decimal3'},
      {name:'WHIP',desc:'Walks + Hits per Inning Pitched',key:'whip',kind:'decimal2',source:'league',fallback:'whip'},
      {name:'ERA',desc:'Earned Run Average',key:'era',kind:'decimal2',source:'league',fallback:'era'}
    ]},
    {name:'Contact Management',weight:.25,metrics:[
      {name:'Average Exit Velocity',key:'exit_velocity',raw:'exit_velocity_avg',kind:'mph1'},
      {name:'Hard-Hit%',key:'hard_hit_percent',raw:'hard_hit_percent',kind:'pct1'},
      {name:'Barrel%',key:'brl_percent',raw:'barrel_batted_rate',kind:'pct1'},
      {name:'GB%',desc:'Ground Ball Percentage',key:'gb',raw:'groundballs_percent',kind:'pct1',source:'extra'}
    ]},
    {name:'Throwing Control',weight:.25,metrics:[
      {name:'Chase%',key:'chase_percent',raw:'oz_swing_percent',kind:'pct1'},
      {name:'Strikeout%',key:'k_percent',raw:'k_percent',kind:'pct1',fallback:'strikeouts'},
      {name:'Walk (BB)%',key:'bb_percent',raw:'bb_percent',kind:'pct1',fallback:'walks'},
      {name:'Whiff%',key:'whiff_percent',raw:'whiff_percent',kind:'pct1'}
    ]},
    {name:'Pitching Quality',weight:.10,metrics:[
      {name:'Fastball Velocity',key:'fb_velocity',raw:'velocity',kind:'mph1'},
      {name:'Extension',key:'extension',raw:'release_extension',kind:'ft1',source:'extra'}
    ]}
  ]
};
const average=nums=>nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:null;
let player,selectedYear,leagueByYear={};

function getPercentile(m,season,year){
  if(m.source==='league')return SS.number(leagueByYear[year]?.[player.id]?.[m.key]);
  if(m.source==='extra')return SS.number(season.pitching_extra_percentiles?.[m.key]);
  return SS.number(season[mode+'_percentiles']?.[m.key]);
}
function getRaw(m,season){
  const raw=SS.number(season[mode+'_raw']?.[m.raw]);
  if(raw!==null)return {value:raw,source:'Baseball Savant'};
  const base=season[mode]||{};
  if(m.fallback==='era')return {value:SS.number(base.ERA??base.era),source:'MLB Stats API'};
  if(m.fallback==='whip')return {value:SS.number(base.WHIP??base.whip),source:'MLB Stats API'};
  if(m.fallback==='strikeouts'||m.fallback==='walks'){
    // Strikeout rate and walk rate use PA for hitters, batters faced for pitchers.
    const denom=SS.number(mode==='batting'?base.plateAppearances:base.battersFaced);
    const numerator=SS.number(m.fallback==='strikeouts'?(base.strikeOuts??base.SO):(base.baseOnBalls??base.BB));
    return {value:denom&&numerator!==null?100*numerator/denom:null,source:'Calculated from MLB season totals'};
  }
  return {value:null,source:'Measured value unavailable in this season dataset'};
}
function rawDisplay(value,kind){
  if(value===null)return 'N/A';
  if(kind==='decimal3')return Number(value).toFixed(3).replace(/^0(?=\.)/,'');
  if(kind==='decimal2')return Number(value).toFixed(2);
  if(kind==='pct1')return Number(value).toFixed(1)+'%';
  if(kind==='mph1')return Number(value).toFixed(1)+' mph';
  if(kind==='ft1')return Number(value).toFixed(1)+' ft';
  return String(value);
}
function barColor(value){
  if(value===null)return '#d4d8dd';
  if(value>=80)return '#e9282d';
  if(value>=60)return '#f37779';
  if(value>=40)return '#f9abab';
  return '#f8d9d9';
}
// The bar represents a percentile-based score, but we NEVER display percentile
// numbers as if they were actual measured statistics.
function metricBlock(title,score,rows,overall,weight){
  const scoreDescription=score===null?'No ranking available':`${Math.round(score)} out of 100`;
  const label=SS.escape(title);
  const heading=`<div class="category-heading"><span>${label}</span>${!overall?`<span class="category-weight">${Math.round(weight*100)}% of overall</span>`:''}</div>`;
  let contents;
  if(overall){
    // The overall category must show the category weights, NOT a misleading
    // list of independent metric percentiles or raw statistics.
    contents=`<div class="detail-title">How the overall score is calculated</div>
      <p class="detail-explainer">Each category gets a score from its available stat percentiles. The overall bar combines the category scores using these weights:</p>
      ${rows.map(g=>{
        const available=g.rows.filter(m=>m.score!==null).length;
        return `<div class="detail-row overall-breakdown"><div><strong>${SS.escape(g.name)}</strong><small>${available} of ${g.rows.length} stats have rankings</small></div><b>${Math.round(g.weight*100)}% weight</b></div>`;
      }).join('')}
      <p class="detail-explainer weight-note">If a category has no rankings, its weight is redistributed proportionally across the remaining categories.</p>`;
  }else{
    const season=player.seasons[selectedYear];
    contents=`<div class="detail-title">Actual statistics for ${selectedYear}</div>
      ${rows.map(m=>{
        const raw=getRaw(m,season);
        const description=m.desc?`<small>${SS.escape(m.desc)}</small>`:'';
        return `<div class="detail-row"><div><strong>${SS.escape(m.name)}</strong>${description}<small>${SS.escape(raw.source)}</small></div><b>${SS.escape(rawDisplay(raw.value,m.kind))}</b></div>`;
      }).join('')}`;
  }
  return `<details class="category-card${overall?' overall':''}">
    <summary aria-label="${label}: ${scoreDescription}; expand for details">${heading}
      <div class="percentile-track" role="img" aria-label="${label} relative performance bar">
      ${score!==null?`<div class="percentile-fill" style="width:${Math.max(0,Math.min(100,score))}%;background:${barColor(score)}"></div>`:''}</div>
      ${score===null?'<div class="bar-missing">Not enough data</div>':''}
    </summary>
    <div class="category-details">${contents}</div>
  </details>`;
}
function renderCategories(year){
  const season=player.seasons[year]||{};
  const groups=categorySets[mode].map(g=>{
    const rows=g.metrics.map(m=>({...m,score:getPercentile(m,season,year)}));
    // Don't allow a stat that belongs to two groups to count twice inside
    // a single group; each group is the simple average of its own metrics.
    const unique=new Map(rows.map(m=>[m.key,m]));
    return {...g,rows,score:average([...unique.values()].map(m=>m.score).filter(v=>v!==null))};
  });
  const valid=groups.filter(g=>g.score!==null);
  const totalWeight=valid.reduce((s,g)=>s+g.weight,0);
  const overallScore=totalWeight?valid.reduce((s,g)=>s+g.score*g.weight,0)/totalWeight:null;
  const label=mode==='pitching'?'Overall Pitching':'Overall Hitting';
  document.getElementById('metric-groups').innerHTML=
    metricBlock(label,overallScore,groups,true,1)+
    groups.map(g=>metricBlock(g.name,g.score,g.rows,false,g.weight)).join('');
  document.getElementById('ranking-title').textContent=`${year} MLB Percentile Rankings`;
  document.getElementById('ranking-subtitle').textContent=mode==='pitching'?'Pitching simplified':'Batting simplified';
  const formula=groups.map(g=>`${g.name} ${Math.round(g.weight*100)}%`).join(' · ');
  document.getElementById('overall-formula').textContent=`Overall weights: ${formula}. Missing categories are excluded and available weights are rebalanced.`;
  // The supplied ZIP predates the user's successful data-enrichment run.
  // Help distinguish an unenriched copy from a truly missing measurement.
  const hasSomeRaw=Object.values(player.seasons).some(s=>Boolean(s[mode+'_raw']&&Object.keys(s[mode+'_raw']).length));
  const notice=document.getElementById('data-warning');
  if(notice){
    notice.hidden=hasSomeRaw;
    if(!hasSomeRaw)notice.textContent='This copy of the player data does not yet include actual advanced-stat values. In your existing enriched data folder they should appear here. Otherwise, run enrich_raw_stats.py before opening this page.';
  }
}
function renderSummary(year){
  const years=Object.keys(player.seasons).filter(y=>Number(y)<=Number(year)&&player.seasons[y][mode]).sort((a,b)=>b-a).slice(0,2).reverse();
  const fields=mode==='pitching'?[['ERA','ERA'],['IP','IP'],['WHIP','WHIP']]:[['Avg','AVG'],['HR','HR'],['OPS','OPS']];
  const columns=fields.map(([label])=>`<th scope="col">${label}</th>`).join('');
  const rows=years.map(y=>{
    const stats=player.seasons[y]?.[mode]||{};
    return `<tr><th scope="row">${y}</th>${fields.map(([,key])=>`<td>${SS.escape(SS.printable(stats[key]))}</td>`).join('')}</tr>`;
  }).join('');
  document.getElementById('season-stats').innerHTML=`<table class="summary-table"><thead><tr><th scope="col">Season</th>${columns}</tr></thead><tbody>${rows||'<tr><td colspan="4">No statistics available</td></tr>'}</tbody></table>`;
  const shortcuts=Object.keys(player.seasons).filter(y=>player.seasons[y][mode]).sort((a,b)=>b-a).slice(0,6);
  document.getElementById('season-shortcuts').innerHTML=shortcuts.map(y=>`<button class="season-chip${year===y?' active':''}" data-year="${y}" type="button">${y}</button>`).join('');
  document.querySelectorAll('.season-chip').forEach(b=>b.addEventListener('click',async()=>{
    selectedYear=b.dataset.year;
    await loadLeague(selectedYear);
    render();
  }));
}
async function loadLeague(year){
  if(year in leagueByYear)return;
  try{leagueByYear[year]=await SS.json(`data/league-percentiles-${year}.json`);}
  catch(e){leagueByYear[year]={};}
}
function render(){
  const season=player.seasons[selectedYear]||{};
  const team=season[mode==='pitching'?'pitching_team':'hitting_team']||'MLB';
  document.getElementById('player-name').textContent=player.name;
  document.getElementById('player-subtitle').textContent=`${team} | ${mode==='pitching'?'Pitcher':'Batter'}`;
  document.title=`${player.name} · ${mode==='pitching'?'Pitching':'Batting'} | SimpleSavant`;
  const img=document.getElementById('profile-team-logo');
  const logo=SS.logo(team,'big');
  if(logo){img.src=logo;img.alt=`${team} logo`;img.hidden=false;}
  else{img.hidden=true;img.removeAttribute('src');}
  document.getElementById('season-select').value=selectedYear;
  document.getElementById('bats-throws').textContent=`${mode==='pitching'?'Pitching':'Batting'} statistics · ${selectedYear}`;
  renderSummary(selectedYear);
  renderCategories(selectedYear);
}
async function init(){
  if(!id){root.innerHTML='<p class="error-state">No player selected. <a href="index.html">Search players</a></p>';return;}
  try{
    const [tpl,data]=await Promise.all([
      fetch('templates/profile-base.html?v=3').then(r=>{if(!r.ok)throw Error('Missing template');return r.text()}),
      SS.player(id), SS.loadTeamLogos()
    ]);
    player=data;root.innerHTML=tpl;
    const years=Object.keys(player.seasons).filter(y=>player.seasons[y][mode]).sort((a,b)=>b-a);
    if(!years.length){root.innerHTML=`<div class="error-state">No ${mode} statistics available for ${SS.escape(player.name)}. <a href="index.html">Back to search</a></div>`;return;}
    selectedYear=years.includes('2025')?'2025':years[0];
    const select=document.getElementById('season-select');
    select.innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join('');
    select.addEventListener('change',async e=>{selectedYear=e.target.value;await loadLeague(selectedYear);render();});
    await loadLeague(selectedYear);
    render();
  }catch(e){console.error(e);root.innerHTML='<div class="error-state">Could not load player data. Use a local web server and check that the data folder is present. <a href="index.html">Back to search</a></div>';}
}
init();
