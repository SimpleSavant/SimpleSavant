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
let player,selectedYear,leagueByYear={},glossary={};

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
// The bar represents a percentile-based score,
// numbers as if they were actual measured statistics.
function metricBlock(title,score,rows,overall,weight){
  const scoreDescription=score===null?'No ranking available':`${Math.round(score)} out of 100`;
  const label=SS.escape(title);
  const heading=`<div class="category-heading"><span>${label}${score!==null?` <span class="category-score">${Math.round(score)}th</span>`:''}</span>${!overall?`<span class="category-weight">${Math.round(weight*100)}% of overall</span>`:''}</div>`;
  if(!overall){
    const names=[...new Map(rows.map(m=>[m.key,m])).values()].map(m=>SS.escape(glossary[m.key]?.name||m.name)).join(' · ');
    return `<a class="category-card category-link" href="#cat=${encodeURIComponent(title)}" aria-label="${label}: ${scoreDescription}; open details">${heading}
      <div class="percentile-track" role="img" aria-label="${label} percentile bar">${score!==null?`<div class="percentile-fill" style="width:${Math.max(0,Math.min(100,score))}%;background:${barColor(score)}"></div>`:''}</div>
      ${score===null?'<div class="bar-missing">Not enough data</div>':''}
      <div class="category-stats">Includes: ${names} <span class="open-hint">Open →</span></div></a>`;
  }
  let contents;
  if(overall){
    // overall category shows the category weights
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
  document.getElementById('season-stats').innerHTML=`<table class="summary-table"><thead><tr><th scope="col">Season</th>${columns}</tr></thead><tbody>${rows||'<tr><td colspan="4">No statistics available</td></tr>'}</tbody></table>${moreStatsHtml(years)}`;
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
  const h=new URLSearchParams(location.hash.slice(1));
  if(h.get('compare'))renderCompare(h.get('compare'),h.get('a'),h.get('b'));
  else if(h.get('stat'))renderStat(h.get('stat'),h.get('cat'));
  else if(h.get('cat'))renderCategory(h.get('cat'));
  else renderCategories(selectedYear);
}
async function init(){
  if(!id){root.innerHTML='<p class="error-state">No player selected. <a href="index.html">Search players</a></p>';return;}
  try{
    const [tpl,data]=await Promise.all([
      fetch('templates/profile-base.html?v=4').then(r=>{if(!r.ok)throw Error('Missing template');return r.text()}),
      SS.player(id), SS.loadTeamLogos(), SS.json('data/glossary.json').then(g=>{glossary=g;})
    ]);
    player=data;root.innerHTML=tpl;
    window.addEventListener('hashchange',render);
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

// ---------- Detail views (category > stat > compare seasons) ----------
const pitcherFlip=new Set(['chase_percent','k_percent','bb_percent','whiff_percent','exit_velocity','hard_hit_percent','brl_percent','xba']);
function higherIsBetter(key){const g=glossary[key];if(!g)return true;return mode==='pitching'&&pitcherFlip.has(key)?!g.higherIsBetter:g.higherIsBetter;}
function ratingLabel(score){if(score===null)return 'No rank';if(score>=90)return 'ELITE';if(score>=70)return 'Very Good';if(score>=55)return 'Good';if(score>=40)return 'Average';return 'Below Average';}
function fmt(key,v,kind){const g=glossary[key]||{};return v===null?'N/A':rawDisplay(v,kind);}
function findMetric(key){for(const g of categorySets[mode]){const m=g.metrics.find(m=>m.key===key);if(m)return {m,g};}return null;}
function valueFor(key,year){const f=findMetric(key);if(!f)return {value:null};const season=player.seasons[year]||{};return {...getRaw(f.m,season),pct:getPercentile(f.m,season,year),kind:f.m.kind};}
function statCard(m,year,cat){
  const g=glossary[m.key]||{};const name=g.name||m.name;const v=valueFor(m.key,year);
  const pct=v.pct;const hb=higherIsBetter(m.key);
  const bar=pct===null?'<div class="bar-missing">No league rank for this season</div>':
    `<div class="mini-scale"><span>Bad</span><div class="mini-track"><div class="mini-fill" style="width:${pct}%;background:${barColor(pct)}"></div></div><span>Good</span></div><div class="pct-note">${Math.round(pct)}th percentile · ${hb?'higher':'lower'} is better</div>`;
  return `<div class="stat-card"><div class="stat-card-head"><strong>${SS.escape(name)}</strong><b>${SS.escape(fmt(m.key,v.value,m.kind))}</b></div>${bar}
    <a class="info-button" href="#stat=${m.key}&cat=${encodeURIComponent(cat)}">What is this? <span class="i-badge">i</span></a></div>`;
}
function renderCategory(catName){
  const group=categorySets[mode].find(g=>g.name===catName);
  const col=document.getElementById('metric-groups');
  if(!group){col.innerHTML='<p class="error-state">Unknown category.</p>';return;}
  const season=player.seasons[selectedYear]||{};
  const unique=[...new Map(group.metrics.map(m=>[m.key,m])).values()];
  const score=average(unique.map(m=>getPercentile(m,season,selectedYear)).filter(v=>v!==null));
  document.getElementById('ranking-title').textContent=`${mode==='pitching'?'Pitching':'Batting'} simplified › ${group.name}`;
  document.getElementById('ranking-subtitle').textContent=`${group.name} rating: ${ratingLabel(score)}`;
  col.innerHTML=`<div class="rating-row"><div class="percentile-track"><div class="percentile-fill" style="width:${score??0}%;background:${barColor(score)}"></div></div><div class="pct-note">${score===null?'No ranking available':`Average of ${unique.length} stat percentiles · ${Math.round(score)}th`}</div></div>
    <h4 class="included">Included statistics · ${selectedYear}</h4>
    <div class="stat-cards">${unique.map(m=>statCard(m,selectedYear,group.name)).join('')}</div>
    <a class="back-nav" href="#">← Back to ${mode} summary</a>`;
  document.getElementById('overall-formula').textContent='';
}
function prevYear(year){const ys=Object.keys(player.seasons).filter(y=>player.seasons[y][mode]&&Number(y)<Number(year)).sort();return ys.at(-1)||null;}
function renderStat(key,cat){
  const g=glossary[key];const f=findMetric(key);const col=document.getElementById('metric-groups');
  if(!g||!f){col.innerHTML='<p class="error-state">No definition available.</p>';return;}
  const prev=prevYear(selectedYear);const cur=valueFor(key,selectedYear);const old=prev?valueFor(key,prev):{value:null};
  const hb=higherIsBetter(key);
  document.getElementById('ranking-title').textContent=g.name;
  document.getElementById('ranking-subtitle').textContent='Definition';
  const related=(g.related||[]).filter(k=>findMetric(k)).map(k=>`<a href="#stat=${k}&cat=${encodeURIComponent(cat||f.g.name)}">${SS.escape(glossary[k].name)} <span class="i-badge">i</span></a>`).join('');
  col.innerHTML=`<div class="definition-box">${SS.escape(g.definition)}<div class="def-meta">Unit: ${g.unit.trim()||'ratio'} · ${hb?'Higher':'Lower'} is better for ${mode==='pitching'?'pitchers':'hitters'} · Source: Baseball Savant / MLB Stats API</div></div>
    <h4 class="included">${SS.escape(player.name)}</h4>
    <div class="season-values"><div><span>${selectedYear} ${SS.escape(g.name)}</span><b>${fmt(key,cur.value,cur.kind)}</b></div>
    ${prev?`<div><span>${prev} ${SS.escape(g.name)}</span><b>${fmt(key,old.value,old.kind)}</b></div>`:''}</div>
    ${prev?`<a class="compare-button" href="#compare=${key}&a=${prev}&b=${selectedYear}&cat=${encodeURIComponent(cat||f.g.name)}">Compare ${prev} and ${selectedYear} ➜</a>`:''}
    ${related?`<h4 class="included">Related</h4><div class="related-links">${related}</div>`:''}
    <a class="back-nav" href="#cat=${encodeURIComponent(cat||f.g.name)}">← Back to ${SS.escape(cat||f.g.name)}</a>`;
  document.getElementById('overall-formula').textContent='';
}
function renderCompare(key,a,b){
  const g=glossary[key];const f=findMetric(key);const col=document.getElementById('metric-groups');
  if(!g||!f){col.innerHTML='<p class="error-state">Cannot compare this statistic.</p>';return;}
  const years=Object.keys(player.seasons).filter(y=>player.seasons[y][mode]).sort();
  a=years.includes(a)?a:years.at(-2)||years[0];b=years.includes(b)?b:years.at(-1);
  const va=valueFor(key,a),vb=valueFor(key,b);const hb=higherIsBetter(key);
  const [lo,hi]=g.scale;const w=v=>{if(v===null)return 0;const f=(v-lo)/(hi-lo);return Math.max(2,Math.min(100,100*(hb?f:1-f)));};
  const isPct=f.m.kind==='pct1';
  let msg='Not enough data to compare.';
  if(va.value!==null&&vb.value!==null){
    const d=vb.value-va.value;const abs=Math.abs(d);
    const amount=isPct?`${abs.toFixed(1)} percentage points`:f.m.kind==='mph1'?`${abs.toFixed(1)} mph`:f.m.kind==='decimal3'?abs.toFixed(3).replace(/^0/,''):abs.toFixed(2);
    msg=abs<1e-9?`No change from ${a} to ${b}`:`${d>0?'Up':'Down'} ${amount} compared to ${a}`;
    msg+=`<small>${(d>0)===hb?'This is an improvement':'This is a decline'} because ${hb?'higher':'lower'} ${SS.escape(g.name)} is better.</small>`;
  }
  const cat=new URLSearchParams(location.hash.slice(1)).get('cat')||f.g.name;
  const opts=sel=>years.map(y=>`<option value="${y}"${y===sel?' selected':''}>${y}</option>`).join('');
  document.getElementById('ranking-title').textContent=`${g.name} by season`;
  document.getElementById('ranking-subtitle').textContent=`${player.name}`;
  col.innerHTML=`<div class="compare-pick">Compare <select id="cmp-a">${opts(a)}</select> and <select id="cmp-b">${opts(b)}</select></div>
    <div class="compare-chart"><div class="axis"><span>Worse</span><span>Better</span></div>
    ${[[a,va],[b,vb]].map(([y,v])=>`<div class="cmp-row"><span class="cmp-year">${y}</span><div class="cmp-track"><div class="cmp-fill" style="width:${w(v.value)}%">${fmt(key,v.value,v.kind)}</div></div></div>`).join('')}
    <div class="axis-ticks"><span>${rawDisplay(hb?lo:hi,f.m.kind)}</span><span>${rawDisplay(hb?hi:lo,f.m.kind)}</span></div></div>
    <div class="compare-msg">${msg}</div>
    <p class="pct-note">Both seasons use the same ${rawDisplay(lo,f.m.kind)}–${rawDisplay(hi,f.m.kind)} scale. ${hb?'Higher':'Lower'} ${SS.escape(g.name)} is better${hb?'':' and appears farther to the right'}.</p>
    <a class="back-nav" href="#stat=${key}&cat=${encodeURIComponent(cat)}">← Back to ${SS.escape(g.name)}</a> <a class="back-nav" href="#">← Back to Player</a>`;
  document.getElementById('overall-formula').textContent='';
  const go=()=>{location.hash=`compare=${key}&a=${document.getElementById('cmp-a').value}&b=${document.getElementById('cmp-b').value}&cat=${encodeURIComponent(cat)}`;};
  document.getElementById('cmp-a').onchange=go;document.getElementById('cmp-b').onchange=go;
}

// ---------- "More stats" progressive disclosure (Implication 5) ----------
const moreStatSets={
  batting:[
    {title:'Playing time',rows:[['Games','gamesPlayed'],['Plate appearances','plateAppearances'],['At-bats','atBats']]},
    {title:'Hitting',rows:[['Hits','hits'],['Doubles','doubles'],['Triples','triples'],['Runs','runs'],['RBI','rbi'],['Stolen bases','stolenBases'],['OBP','obp'],['SLG','slg']]},
    {title:'Strikeouts & walks',rows:[['Strikeouts','strikeOuts'],['Walks','baseOnBalls'],['Strikeout rate (K%)',(b,r)=>r.k_percent,'%'],['Walk rate (BB%)',(b,r)=>r.bb_percent,'%']]}
  ],
  pitching:[
    {title:'Workload',rows:[['Wins – Losses',b=>`${b.wins??'—'}–${b.losses??'—'}`],['Games / Starts',b=>`${b.gamesPitched??'—'} / ${b.gamesStarted??'—'}`],['Innings pitched','inningsPitched'],['Saves','saves']]},
    {title:'Strikeouts & walks',rows:[['Strikeouts','strikeOuts'],['Walks','baseOnBalls'],['K per 9 innings','strikeoutsPer9Inn'],['BB per 9 innings','walksPer9Inn'],['Strikeout-to-walk ratio','strikeoutWalkRatio'],['Strikeout rate (K%)',(b,r)=>r.k_percent,'%'],['Walk rate (BB%)',(b,r)=>r.bb_percent,'%']]},
    {title:'Contact allowed',rows:[['Hits allowed','hits'],['Home runs allowed','homeRuns'],['Opponent batting average','avg'],['Ground ball rate',(b,r)=>r.groundballs_percent,'%']]}
  ]
};
function moreStatsHtml(years){
  if(!years.length)return '';
  const cell=(row,y)=>{
    const [,src,unit]=row;const season=player.seasons[y]||{};const base=season[mode]||{};const raw=season[mode+'_raw']||{};
    let v=typeof src==='function'?src(base,raw):base[src];
    if(typeof v==='number'&&unit==='%')v=v.toFixed(1)+'%';
    return `<td>${SS.escape(SS.printable(v))}</td>`;
  };
  const head=`<tr><th scope="col">Stat</th>${years.map(y=>`<th scope="col">${y}</th>`).join('')}</tr>`;
  const body=moreStatSets[mode].map(g=>`<tr class="more-group"><th colspan="${years.length+1}">${g.title}</th></tr>`+g.rows.map(r=>`<tr><th scope="row">${SS.escape(r[0])}</th>${years.map(y=>cell(r,y)).join('')}</tr>`).join('')).join('');
  return `<details class="more-stats"${location.hash.includes("more")?" open":""}><summary>More stats <span class="more-hint">strikeouts, walks, ${mode==='pitching'?'innings, K/9':'OBP, SLG, runs'} …</span></summary>
    <table class="summary-table more-table"><thead>${head}</thead><tbody>${body}</tbody></table>
    <p class="pct-note">Season totals from the MLB Stats API. Rates (K%, BB%${mode==='pitching'?', ground ball rate':''}) from Baseball Savant.</p></details>`;
}
