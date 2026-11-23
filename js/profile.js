'use strict';
// Both batting.html and pitching.html use templates/profile-base.html.
const mode=location.pathname.toLowerCase().endsWith('pitching.html')?'pitching':'batting';
const id=new URLSearchParams(location.search).get('id');
const root=document.getElementById('profile-root');

// Category definitions, scoring and number formatting live in js/stats.js so the
// comparison page scores players exactly the same way. Thin wrappers keep the
// names this file has always used.
const categorySets=Stats.categories;
const average=Stats.average;
let player,selectedYear,leagueByYear={},glossary={};

function getPercentile(m,season,year){return Stats.percentile(mode,player.id,m,season,leagueByYear[year]);}
function getRaw(m,season){return Stats.raw(mode,m,season);}
function rawDisplay(value,kind){return Stats.display(value,kind);}
function barColor(value){return Stats.barColor(value);}
// The bar represents a percentile-based score,
// numbers as if they were actual measured statistics.
function metricBlock(title,score,rows,overall,weight,desc){
  const scoreDescription=score===null?'No ranking available':`${Math.round(score)} out of 100`;
  const label=SS.escape(title);
  const heading=`<div class="category-heading"><span>${label}${score!==null?` <span class="category-score">${Stats.ordinal(Math.round(score))}</span>`:''}</span>${!overall?`<span class="category-weight">${Math.round(weight*100)}% of overall</span>`:''}</div>`;
  if(!overall){
    const names=[...new Map(rows.map(m=>[m.key,m])).values()].map(m=>SS.escape(glossary[m.key]?.name||m.name)).join(' · ');
    return `<a class="category-card category-link" href="#cat=${encodeURIComponent(title)}" aria-label="${label}: ${scoreDescription}; open details">${heading}
      ${desc?`<p class="category-desc">${SS.escape(desc)}</p>`:''}
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
  // Shared with the comparison page (see Stats.score in js/stats.js).
  const {groups,overall:overallScore}=Stats.score(mode,player,year,leagueByYear[year]);
  const label=mode==='pitching'?'Overall Pitching':'Overall Hitting';
  document.getElementById('metric-groups').innerHTML=
    metricBlock(label,overallScore,groups,true,1)+
    groups.map(g=>metricBlock(g.name,g.score,g.rows,false,g.weight,g.desc)).join('');
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
  // [column label, stat field, glossary key for the "i" explanation]
  const fields=mode==='pitching'?[['ERA','ERA','era'],['IP','IP','ip'],['WHIP','WHIP','whip']]:[['Avg','AVG','avg'],['HR','HR','hr'],['OPS','OPS','ops']];
  const columns=fields.map(([label,,key])=>`<th scope="col"><span class="th-explain">${label}${Stats.explainButton(key,glossary[key]?.name||label)}</span></th>`).join('');
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
  const photo = document.getElementById('player-photo');

  photo.src = `https://img.mlbstatic.com/mlb-photos/image/upload/w_640,q_auto:best/v1/people/${id}/headshot/67/current`;
  
  photo.onerror = () => {
    photo.style.display = 'none';
  };
  
  photo.onload = () => {
    photo.style.display = 'block';
  };
  
  document.title=`${player.name} · ${mode==='pitching'?'Pitching':'Batting'} | SimpleSavant`;
  const img=document.getElementById('profile-team-logo');
  const logo=SS.logo(team,'big');
  if(logo){img.src=logo;img.alt=`${team} logo`;img.hidden=false;}
  else{img.hidden=true;img.removeAttribute('src');}
  document.getElementById('season-select').value=selectedYear;
  document.getElementById('bats-throws').textContent=`${mode==='pitching'?'Pitching':'Batting'} statistics · ${selectedYear}`;
  document.getElementById('favorite-slot').innerHTML=SS.starButton({id:player.id,name:player.name,role:mode},true);
  document.getElementById('compare-player').href=`compare.html?role=${mode}&a=${encodeURIComponent(player.id)}&ya=${selectedYear}`;
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
      fetch('templates/profile-base.html?v=6').then(r=>{if(!r.ok)throw Error('Missing template');return r.text()}),
      SS.player(id), SS.loadTeamLogos(), SS.json('data/glossary.json').then(g=>{glossary=g;})
    ]);
    player=data;root.innerHTML=tpl;
    window.addEventListener('hashchange',render);
    Stats.initExplain({glossary:()=>glossary,mode:()=>mode});
    SS.bindStars();
    bindSectionTabs();
    // Favorites can change on another page; refresh when returning via Back.
    window.addEventListener('pageshow',e=>{if(e.persisted&&player)SS.syncStars(player.id);});
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
function higherIsBetter(key){return Stats.higherIsBetter(glossary,key,mode);}
function ratingLabel(score){return Stats.ratingLabel(score);}
function fmt(key,v,kind){const g=glossary[key]||{};return v===null?'N/A':rawDisplay(v,kind);}
function findMetric(key){for(const g of categorySets[mode]){const m=g.metrics.find(m=>m.key===key);if(m)return {m,g};}return null;}
function valueFor(key,year){const f=findMetric(key);if(!f)return {value:null};const season=player.seasons[year]||{};return {...getRaw(f.m,season),pct:getPercentile(f.m,season,year),kind:f.m.kind};}
function statCard(m,year,cat){
  const g=glossary[m.key]||{};const name=g.name||m.name;const v=valueFor(m.key,year);
  const pct=v.pct;const hb=higherIsBetter(m.key);
  const bar=pct===null?'<div class="bar-missing">No league rank for this season</div>':
    `<div class="mini-scale"><span>Bad</span><div class="mini-track"><div class="mini-fill" style="width:${pct}%;background:${barColor(pct)}"></div></div><span>Good</span></div><div class="pct-note">${Stats.ordinal(Math.round(pct))} percentile · ${hb?'higher':'lower'} is better</div>`;
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
  col.innerHTML=`${group.desc?`<p class="category-desc category-desc-lead">${SS.escape(group.desc)}</p>`:''}<div class="rating-row"><div class="percentile-track"><div class="percentile-fill" style="width:${score??0}%;background:${barColor(score)}"></div></div><div class="pct-note">${score===null?'No ranking available':`Average of ${unique.length} stat percentiles · ${Stats.ordinal(Math.round(score))}`}</div></div>
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
  const cat=new URLSearchParams(location.hash.slice(1)).get('cat')||f.g.name;
  const years=Object.keys(player.seasons).filter(y=>player.seasons[y][mode]&&valueFor(key,y).value!==null).sort();
  document.getElementById('ranking-title').textContent=`${g.name} by season`;
  document.getElementById('ranking-subtitle').textContent=player.name;
  document.getElementById('overall-formula').textContent='';
  if(years.length<2){
    col.innerHTML=`<p class="error-state">Not enough season data to compare ${SS.escape(g.name)}. At least two seasons with measured values are needed.${years.length?` Available season: ${years[0]}.`:''}</p>
      <a class="back-nav" href="#stat=${key}&cat=${encodeURIComponent(cat)}">← Back to ${SS.escape(g.name)}</a>`;
    return;
  }

  a=years.includes(a)?a:years.at(-2);
  b=years.includes(b)?b:years.at(-1);
  const otherYear=(year,preferEarlier)=>{
    const i=years.indexOf(year);
    return years[preferEarlier?(i>0?i-1:i+1):(i<years.length-1?i+1:i-1)];
  };
  if(a===b)a=otherYear(b,true); // Never compare a season against itself.

  const va=valueFor(key,a),vb=valueFor(key,b);const hb=higherIsBetter(key);
  const [lo,hi]=g.scale;
  const w=v=>Math.max(0,Math.min(100,100*(hb?(v-lo)/(hi-lo):(hi-v)/(hi-lo))));
  const d=vb.value-va.value,abs=Math.abs(d),kind=f.m.kind;
  const precision=kind==='decimal3'?3:(kind==='pct1'||kind==='mph1'||kind==='ft1'?1:2);
  let change=abs.toFixed(precision);
  if(abs>0&&Number(change)===0)change=abs.toPrecision(2);
  if(kind==='decimal3'&&change.startsWith('0.'))change=change.slice(1);
  const unit=kind==='pct1'?' percentage points':kind==='mph1'?' mph':kind==='ft1'?' ft':'';
  const msg=abs<1e-9?`No change in ${SS.escape(g.name)} from ${a} to ${b}.`:
    `${b} is ${d>0?'up':'down'} ${change}${unit} from ${a}.<small>${d*(hb?1:-1)>0?'This is an improvement':'This is a decline'} for this statistic; ${hb?'higher':'lower'} is better.</small>`;
  const opts=sel=>years.map(y=>`<option value="${y}"${y===sel?' selected':''}>${y}</option>`).join('');
  col.innerHTML=`<div class="compare-pick"><label for="cmp-a">From season</label> <select id="cmp-a">${opts(a)}</select> <label for="cmp-b">to season</label> <select id="cmp-b">${opts(b)}</select></div>
    <div class="compare-chart"><div class="axis" style="margin-right:86px"><span>Worse</span><span>Better</span></div>
    ${[[a,va],[b,vb]].map(([y,v])=>`<div class="cmp-row"><span class="cmp-year">${y}</span><div class="cmp-track" role="img" aria-label="${y}: ${SS.escape(fmt(key,v.value,v.kind))}; ${w(v.value).toFixed(0)} percent of comparison scale"><div class="cmp-fill" style="width:${w(v.value)}%;min-width:0;padding:0"></div></div><strong style="min-width:76px;text-align:right;font-size:13px">${SS.escape(fmt(key,v.value,v.kind))}</strong></div>`).join('')}
    <div class="axis-ticks" style="margin-right:86px"><span>${rawDisplay(hb?lo:hi,kind)}</span><span>${rawDisplay(hb?hi:lo,kind)}</span></div></div>
    <div class="compare-msg">${msg}</div>
    <p class="pct-note">Both bars use the same ${rawDisplay(lo,kind)}–${rawDisplay(hi,kind)} scale. Longer bars mean better performance for this statistic, not an overall player rating. Only seasons with available values appear in the selectors.</p>
    <a class="back-nav" href="#stat=${key}&cat=${encodeURIComponent(cat)}">← Back to ${SS.escape(g.name)}</a> <a class="back-nav" href="#">← Back to Player</a>`;
  const go=changed=>{
    let first=document.getElementById('cmp-a').value,second=document.getElementById('cmp-b').value;
    if(first===second){if(changed==='a')second=otherYear(first,false);else first=otherYear(second,true);}
    location.hash=`compare=${key}&a=${first}&b=${second}&cat=${encodeURIComponent(cat)}`;
  };
  document.getElementById('cmp-a').onchange=()=>go('a');
  document.getElementById('cmp-b').onchange=()=>go('b');
}

// ---------- "More stats" progressive disclosure (Implication 5) ----------
// Row: [label, stat field or function(base, savantRaw), unit, glossary key for "i"]
const moreStatSets={
  batting:[
    {title:'Playing time',rows:[['Games','gamesPlayed',null,'games'],['Plate appearances','plateAppearances',null,'pa'],['At-bats','atBats',null,'ab']]},
    {title:'Hitting',rows:[['Hits','hits',null,'hits'],['Doubles','doubles',null,'doubles'],['Triples','triples',null,'triples'],['Runs','runs',null,'runs'],['RBI','rbi',null,'rbi'],['Stolen bases','stolenBases',null,'sb'],['OBP','obp',null,'obp'],['SLG','slg',null,'slg']]},
    {title:'Strikeouts & walks',rows:[['Strikeouts','strikeOuts',null,'strikeouts'],['Walks','baseOnBalls',null,'walks'],['Strikeout rate (K%)',(b,r)=>r.k_percent,'%','k_percent'],['Walk rate (BB%)',(b,r)=>r.bb_percent,'%','bb_percent']]}
  ],
  pitching:[
    {title:'Workload',rows:[['Wins – Losses',b=>`${b.wins??'—'}–${b.losses??'—'}`,null,'wl'],['Games / Starts',b=>`${b.gamesPitched??'—'} / ${b.gamesStarted??'—'}`,null,'g_gs'],['Innings pitched','inningsPitched',null,'ip'],['Saves','saves',null,'saves']]},
    {title:'Strikeouts & walks',rows:[['Strikeouts','strikeOuts',null,'strikeouts'],['Walks','baseOnBalls',null,'walks'],['K per 9 innings','strikeoutsPer9Inn',null,'k9'],['BB per 9 innings','walksPer9Inn',null,'bb9'],['Strikeout-to-walk ratio','strikeoutWalkRatio',null,'kbb'],['Strikeout rate (K%)',(b,r)=>r.k_percent,'%','k_percent'],['Walk rate (BB%)',(b,r)=>r.bb_percent,'%','bb_percent']]},
    {title:'Contact allowed',rows:[['Hits allowed','hits',null,'hits_allowed'],['Home runs allowed','homeRuns',null,'hr_allowed'],['Opponent batting average','avg',null,'opp_avg'],['Ground ball rate',(b,r)=>r.groundballs_percent,'%','gb']]}
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
  const body=moreStatSets[mode].map(g=>`<tr class="more-group"><th colspan="${years.length+1}">${g.title}</th></tr>`+g.rows.map(r=>`<tr><th scope="row"><span class="th-explain">${SS.escape(r[0])}${r[3]&&glossary[r[3]]?Stats.explainButton(r[3],glossary[r[3]].name):''}</span></th>${years.map(y=>cell(r,y)).join('')}</tr>`).join('')).join('');
  return `<details class="more-stats"${location.hash.includes("more")?" open":""}><summary>More stats <span class="more-hint">strikeouts, walks, ${mode==='pitching'?'innings, K/9':'OBP, SLG, runs'} …</span></summary>
    <table class="summary-table more-table"><thead>${head}</thead><tbody>${body}</tbody></table>
    <p class="pct-note">Season totals from the MLB Stats API. Rates (K%, BB%${mode==='pitching'?', ground ball rate':''}) from Baseball Savant.</p></details>`;
}

// ---------- Section tabs (Player Overview / Season Statistics / Percentile Rankings) ----------
// Jump links, like Baseball Savant's profile nav. They are buttons, not #links,
// because the URL hash already drives the category/stat views above.
// The target section flashes so the jump is noticeable even when both
// columns are already on screen (desktop).
function bindSectionTabs(){
  const tabs=[...document.querySelectorAll('.profile-tab')];
  const behavior=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';
  const sections={
    'player-overview':{scroll:()=>window.scrollTo({top:0,behavior:behavior()}),flash:'.identity-box',focus:'#player-name'},
    'season-statistics':{scroll:'.summary-section',flash:'.summary-section',focus:'.summary-section h2',
      before:()=>{const more=document.querySelector('.more-stats');if(more)more.open=true;}},
    'percentile-rankings':{scroll:'#categories',flash:'.rankings-header',focus:'#ranking-title'}
  };
  tabs.forEach(tab=>tab.addEventListener('click',()=>{
    const s=sections[tab.dataset.section];if(!s)return;
    tabs.forEach(t=>{const on=t===tab;t.classList.toggle('current-tab',on);if(on)t.setAttribute('aria-current','true');else t.removeAttribute('aria-current');});
    if(s.before)s.before();
    if(typeof s.scroll==='function')s.scroll();
    else document.querySelector(s.scroll)?.scrollIntoView({behavior:behavior(),block:'start'});
    // Move keyboard/screen-reader focus to the section heading without a second scroll.
    const heading=document.querySelector(s.focus);
    if(heading){heading.setAttribute('tabindex','-1');heading.classList.add('jump-target');heading.focus({preventScroll:true});}
    const flash=document.querySelector(s.flash);
    if(flash){flash.classList.remove('section-flash');void flash.offsetWidth;flash.classList.add('section-flash');}
  }));
}
