'use strict';
// Side-by-side comparison of two batters or two pitchers.
// URL: compare.html?role=batting&a=<id>&ya=<year>&b=<id>&yb=<year>
// The URL always mirrors what is on screen, so a comparison can be bookmarked,
// shared, or returned to with Back. Category scores come from Stats.score,
// the same calculation the profile pages use.
const params=new URLSearchParams(location.search);
const state={role:params.get('role')==='pitching'?'pitching':'batting',a:null,b:null};
const SLOTS=['a','b'];
const SLOT_LABEL={a:'Player 1',b:'Player 2'};
let index=[],indexById=new Map(),glossary={},renderSeq=0;
const playerCache=new Map(),leagueCache={};
const statusEl=document.getElementById('compare-status');
const resultsEl=document.getElementById('compare-results');

const roleWord=(plural=true)=>state.role==='pitching'?(plural?'pitchers':'pitcher'):(plural?'batters':'batter');
const teamFor=(data,year)=>data.seasons[year]?.[state.role==='pitching'?'pitching_team':'hitting_team']||null;
const roleYears=(data,role)=>Object.keys(data.seasons||{}).filter(y=>data.seasons[y][role]).sort((x,y)=>y-x);
// Same default season rule as the profile pages.
function defaultYear(years,preferred){
  if(preferred&&years.includes(String(preferred)))return String(preferred);
  return years.includes('2025')?'2025':years[0];
}
async function loadPlayer(id){
  if(!playerCache.has(id))playerCache.set(id,await SS.player(id));
  return playerCache.get(id);
}
async function loadLeague(year){
  if(!(year in leagueCache)){
    try{leagueCache[year]=await SS.json(`data/league-percentiles-${year}.json`);}catch(e){leagueCache[year]={};}
  }
  return leagueCache[year];
}

// ---------- Choosing players ----------
// preferredYear: the season to try first. Otherwise use the other player's season
// (so the default is a same-season comparison), then the profile default.
async function setPlayer(slot,id,preferredYear){
  let data;
  try{data=await loadPlayer(String(id));}
  catch(e){console.error(e);statusEl.textContent='That player could not be loaded. Try another name.';return false;}
  const years=roleYears(data,state.role);
  if(!years.length){statusEl.textContent=`${data.name} has no ${state.role} seasons in this data. Switch to ${state.role==='pitching'?'Batters':'Pitchers'} to compare them.`;return false;}
  const other=state[slot==='a'?'b':'a'];
  const year=years.includes(String(preferredYear))?String(preferredYear):defaultYear(years,other?.year);
  state[slot]={id:String(id),data,year};
  return true;
}
async function choose(slot,id){
  statusEl.textContent='';
  if(!(await setPlayer(slot,id)))return;
  await update();
  const empty=SLOTS.find(s=>!state[s]);
  if(empty)document.getElementById(`pick-${empty}`)?.focus();
  else document.getElementById('compare-results').querySelector('.verdict')?.focus();
}
function matchesFor(query){
  const q=query.trim().toLocaleLowerCase();
  if(!q)return [];
  const list=index.filter(e=>e.roles.includes(state.role)&&e.name.toLocaleLowerCase().includes(q));
  // Names that start with the query first; then players who only have this role,
  // so e.g. a pitcher with one season of batting sorts below everyday hitters.
  list.sort((x,y)=>(Number(y.name.toLocaleLowerCase().startsWith(q))-Number(x.name.toLocaleLowerCase().startsWith(q)))||(Number(y.roles.length===1)-Number(x.roles.length===1)));
  return list.slice(0,8);
}
const seasonSpan=e=>e.seasons.length>1?`${e.seasons[0]}–${e.seasons.at(-1)}`:(e.seasons[0]||'');
function showMatches(input){
  const slot=input.dataset.slot;const list=document.getElementById(`pick-${slot}-list`);
  if(!input.value.trim()){hideMatches(input);return;}
  const found=matchesFor(input.value);
  list.innerHTML=found.length?found.map((e,i)=>`<li role="option" id="pick-${slot}-opt-${i}" data-id="${SS.escape(e.id)}" aria-selected="${i===0}"${i===0?' class="active"':''}>${SS.escape(e.name)} <small>${SS.escape(seasonSpan(e))}</small></li>`).join(''):
    `<li class="pick-none">No ${roleWord()} match “${SS.escape(input.value.trim())}”</li>`;
  list.hidden=false;input.setAttribute('aria-expanded','true');
  if(found.length)input.setAttribute('aria-activedescendant',`pick-${slot}-opt-0`);else input.removeAttribute('aria-activedescendant');
}
function hideMatches(input){
  const list=document.getElementById(`pick-${input.dataset.slot}-list`);
  if(list)list.hidden=true;
  input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');
}
function moveActive(input,step){
  const list=document.getElementById(`pick-${input.dataset.slot}-list`);
  const opts=[...list.querySelectorAll('[data-id]')];if(list.hidden||!opts.length)return;
  const cur=opts.findIndex(o=>o.classList.contains('active'));
  const next=(cur+step+opts.length)%opts.length;
  opts.forEach((o,i)=>{o.classList.toggle('active',i===next);o.setAttribute('aria-selected',String(i===next));});
  input.setAttribute('aria-activedescendant',opts[next].id);
  opts[next].scrollIntoView({block:'nearest'});
}

// ---------- Slots ----------
function favQuickHtml(slot){
  // Use the role the player was starred as (shown on the search page chips):
  // the index lists many pitchers as batters too because they batted once.
  const favs=SS.favorites.all().filter(f=>f.role===state.role&&indexById.has(String(f.id)));
  if(!favs.length)return '';
  return `<span><span aria-hidden="true">★</span> Your favorites:</span>${favs.map(f=>`<button type="button" class="fav-pick" data-slot="${slot}" data-id="${SS.escape(f.id)}">${SS.escape(f.name)}</button>`).join('')}`;
}
function slotHtml(slot){
  const s=state[slot];
  const head=`<div class="slot-head"><span class="swatch swatch-${slot}" aria-hidden="true"></span><h2>${SLOT_LABEL[slot]}</h2></div>`;
  if(!s){
    return `${head}<div class="picker">
        <label class="visually-hidden" for="pick-${slot}">Search ${roleWord()} for ${SLOT_LABEL[slot]}</label>
        <input id="pick-${slot}" class="pick-input" data-slot="${slot}" type="search" autocomplete="off" placeholder="Search ${roleWord()}…" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="pick-${slot}-list">
        <ul id="pick-${slot}-list" class="pick-list" role="listbox" aria-label="Matching ${roleWord()}" hidden></ul>
      </div>
      <div class="fav-quick" id="fav-quick-${slot}">${favQuickHtml(slot)}</div>`;
  }
  const {data,year}=s;const team=teamFor(data,year);const logo=SS.logo(team,'small');
  const years=roleYears(data,state.role);
  return `${head}<div class="slot-player">${logo?`<img class="result-team-logo" src="${logo}" alt="${SS.escape(team)} logo">`:'<span class="team-logo-placeholder" aria-hidden="true">MLB</span>'}
      <div class="slot-id"><div class="slot-name-row"><strong class="slot-name">${SS.escape(data.name)}</strong>${SS.starButton({id:s.id,name:data.name,role:state.role})}</div>
      <small>${SS.escape(team||'MLB')} · ${state.role==='pitching'?'Pitcher':'Batter'}</small></div></div>
    <div class="slot-controls"><label>Season <select class="slot-year" data-slot="${slot}">${years.map(y=>`<option value="${y}"${y===year?' selected':''}>${y}</option>`).join('')}</select></label>
      <button type="button" class="slot-change" data-slot="${slot}">Change player</button>
      <a class="slot-profile" href="${SS.profileUrl(s.id,state.role)}">View profile →</a></div>`;
}
function renderSlots(){
  for(const slot of SLOTS){
    const el=document.getElementById(`slot-${slot}`);
    el.innerHTML=slotHtml(slot);el.classList.toggle('filled',Boolean(state[slot]));
  }
  document.getElementById('swap').disabled=!state.a&&!state.b;
  document.querySelectorAll('.role-toggle button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.role===state.role)));
}
function syncUrl(){
  const p=new URLSearchParams();p.set('role',state.role);
  for(const slot of SLOTS)if(state[slot]){p.set(slot,state[slot].id);p.set('y'+slot,state[slot].year);}
  history.replaceState(null,'',`${location.pathname}?${p}`);
  document.title=state.a&&state.b?`${state.a.data.name} vs ${state.b.data.name} | SimpleSavant`:'Compare players | SimpleSavant';
}
async function update(){syncUrl();renderSlots();await renderResults();}

// ---------- Results ----------
const ordinal=Stats.ordinal;
function shortNames(a,b){
  const last=n=>{const p=n.trim().split(/\s+/);return p.length>1?p.slice(1).join(' '):n;};
  let x=last(a.data.name),y=last(b.data.name);
  if(x===y){x=a.data.name;y=b.data.name;}                 // two different players share a surname
  if(x===y){x+=` ${a.year}`;y+=` ${b.year}`;}             // same player, two seasons
  if(x===y){x=SLOT_LABEL.a;y=SLOT_LABEL.b;}
  return {a:x,b:y};
}
// Which side is better, by the value the reader sees. Ties (equal as displayed) and
// missing values mark neither side.
function winner(va,vb,shownA,shownB,higherBetter){
  if(va===null||vb===null||higherBetter===null||shownA===shownB)return null;
  return (va>vb)===higherBetter?'a':'b';
}
function barRow(slot,name,score,catName){
  const has=score!==null;const v=has?Math.round(score):null;
  return `<div class="pair-row" title="${SS.escape(name)} · ${SS.escape(catName)}: ${has?`${ordinal(v)} percentile score`:'no ranking this season'}">
      <span class="pair-name">${SS.escape(name)}</span>
      <div class="pair-track">${has?`<div class="pair-fill fill-${slot}" style="width:${Math.max(0,Math.min(100,v))}%"></div>`:''}</div>
      <span class="pair-value">${has?ordinal(v):'N/A'}</span></div>`;
}
function diffHtml(sa,sb,names){
  if(sa===null||sb===null)return '<span class="pair-diff muted">Not comparable</span>';
  const d=Math.round(sa)-Math.round(sb);
  if(d===0)return '<span class="pair-diff">Tied</span>';
  const lead=d>0?'a':'b';
  return `<span class="pair-diff"><span class="swatch swatch-${lead}" aria-hidden="true"></span>${SS.escape(names[lead])} +${Math.abs(d)}</span>`;
}
function metricTable(group,a,b,names,la,lb){
  const unique=[...new Map(group.metrics.map(m=>[m.key,m])).values()];
  const sa=a.data.seasons[a.year]||{},sb=b.data.seasons[b.year]||{};
  const rows=unique.map(m=>{
    const ra=Stats.raw(state.role,m,sa),rb=Stats.raw(state.role,m,sb);
    const pa=Stats.percentile(state.role,a.id,m,sa,la),pb=Stats.percentile(state.role,b.id,m,sb,lb);
    const shownA=Stats.display(ra.value,m.kind),shownB=Stats.display(rb.value,m.kind);
    const win=winner(ra.value,rb.value,shownA,shownB,Stats.higherIsBetter(glossary,m.key,state.role));
    const name=glossary[m.key]?.name||m.name;
    const cell=(slot,shown,pct)=>`<td${win===slot?' class="win"':''}>${SS.escape(shown)}${win===slot?' <span class="win-mark" aria-hidden="true">✓</span><span class="visually-hidden">(better)</span>':''}<small>${pct===null?'No rank':`${ordinal(Math.round(pct))} percentile`}</small></td>`;
    return `<tr><th scope="row"><span class="th-explain">${SS.escape(name)}${glossary[m.key]?Stats.explainButton(m.key,name):''}</span><small>${SS.escape(Stats.directionText(glossary,m.key,state.role))}</small></th>${cell('a',shownA,pa)}${cell('b',shownB,pb)}</tr>`;
  }).join('');
  return `<table class="pair-table"><thead><tr><th scope="col">Stat</th><th scope="col"><span class="swatch swatch-a" aria-hidden="true"></span> ${SS.escape(names.a)} <small>${a.year}</small></th><th scope="col"><span class="swatch swatch-b" aria-hidden="true"></span> ${SS.escape(names.b)} <small>${b.year}</small></th></tr></thead><tbody>${rows}</tbody></table>`;
}
// Traditional season stats. rate:true rows get a better/worse mark; totals do not,
// because they mostly reflect playing time.
const seasonRows={
  batting:[
    {label:'Games',key:'games',get:s=>s.gamesPlayed},
    {label:'Plate appearances',key:'pa',get:s=>s.plateAppearances},
    {label:'Batting average',key:'avg',get:s=>s.avg??s.AVG,rate:true},
    {label:'On-base percentage',key:'obp',get:s=>s.obp??s.OBP,rate:true},
    {label:'Slugging',key:'slg',get:s=>s.slg??s.SLG,rate:true},
    {label:'OPS',key:'ops',get:s=>s.ops??s.OPS,rate:true},
    {label:'Home runs',key:'hr',get:s=>s.homeRuns??s.HR},
    {label:'RBI',key:'rbi',get:s=>s.rbi??s.RBI},
    {label:'Stolen bases',key:'sb',get:s=>s.stolenBases??s.SB}
  ],
  pitching:[
    {label:'Games / Starts',key:'g_gs',get:s=>`${s.gamesPitched??'—'} / ${s.gamesStarted??'—'}`},
    {label:'Innings pitched',key:'ip',get:s=>s.inningsPitched??s.IP},
    {label:'ERA',key:'era',get:s=>s.era??s.ERA,rate:true},
    {label:'WHIP',key:'whip',get:s=>s.whip??s.WHIP,rate:true},
    {label:'Strikeouts per 9',key:'k9',get:s=>s.strikeoutsPer9Inn,rate:true},
    {label:'Walks per 9',key:'bb9',get:s=>s.walksPer9Inn,rate:true},
    {label:'Strikeout-to-walk ratio',key:'kbb',get:s=>s.strikeoutWalkRatio,rate:true},
    {label:'Opponent batting average',key:'opp_avg',get:s=>s.avg??s.AVG,rate:true},
    {label:'Wins – Losses',key:'wl',get:s=>`${s.wins??'—'}–${s.losses??'—'}`},
    {label:'Strikeouts',key:'strikeouts',get:s=>s.strikeOuts??s.SO},
    {label:'Saves',key:'saves',get:s=>s.saves}
  ]
};
function seasonTable(a,b,names){
  const ba=a.data.seasons[a.year]?.[state.role]||{},bb=b.data.seasons[b.year]?.[state.role]||{};
  const rows=seasonRows[state.role].map(r=>{
    const shownA=SS.printable(r.get(ba)),shownB=SS.printable(r.get(bb));
    const win=r.rate?winner(SS.number(r.get(ba)),SS.number(r.get(bb)),shownA,shownB,Stats.higherIsBetter(glossary,r.key,state.role)):null;
    const cell=(slot,shown)=>`<td${win===slot?' class="win"':''}>${SS.escape(shown)}${win===slot?' <span class="win-mark" aria-hidden="true">✓</span><span class="visually-hidden">(better)</span>':''}</td>`;
    const name=glossary[r.key]?.name||r.label;
    return `<tr><th scope="row"><span class="th-explain">${SS.escape(r.label)}${glossary[r.key]?Stats.explainButton(r.key,name):''}</span></th>${cell('a',shownA)}${cell('b',shownB)}</tr>`;
  }).join('');
  return `<table class="pair-table season-table"><thead><tr><th scope="col">Stat</th><th scope="col"><span class="swatch swatch-a" aria-hidden="true"></span> ${SS.escape(names.a)} <small>${a.year}</small></th><th scope="col"><span class="swatch swatch-b" aria-hidden="true"></span> ${SS.escape(names.b)} <small>${b.year}</small></th></tr></thead><tbody>${rows}</tbody></table>`;
}
async function renderResults(){
  const seq=++renderSeq;
  const {a,b}=state;
  if(!a||!b){
    resultsEl.innerHTML=`<p class="compare-empty">${!a&&!b?`Choose two ${roleWord()} to compare.`:`Choose one more ${roleWord(false)} to compare with ${SS.escape((a||b).data.name)}.`}</p>`;
    return;
  }
  const [la,lb]=await Promise.all([loadLeague(a.year),loadLeague(b.year)]);
  if(seq!==renderSeq)return; // a newer selection already rendered
  const scoreA=Stats.score(state.role,a.data,a.year,la),scoreB=Stats.score(state.role,b.data,b.year,lb);
  const names=shortNames(a,b);
  // Headline: who leads overall, and in how many categories (as displayed, rounded).
  let aw=0,bw=0,ties=0,n=0;
  scoreA.groups.forEach((g,i)=>{
    const x=g.score,y=scoreB.groups[i].score;if(x===null||y===null)return;
    n++;const d=Math.round(x)-Math.round(y);if(d>0)aw++;else if(d<0)bw++;else ties++;
  });
  const oa=scoreA.overall,ob=scoreB.overall;
  const overallLine=`<span class="swatch swatch-a" aria-hidden="true"></span> ${SS.escape(names.a)} ${oa===null?'N/A':ordinal(Math.round(oa))} <span class="verdict-vs">vs</span> <span class="swatch swatch-b" aria-hidden="true"></span> ${SS.escape(names.b)} ${ob===null?'N/A':ordinal(Math.round(ob))}`;
  const catLine=n?`${SS.escape(names.a)} has the higher score in ${aw} of ${n} categories and ${SS.escape(names.b)} in ${bw}${ties?`; ${ties} tied`:''}.`:'Neither season has enough ranked stats to compare categories.';
  const seasonNote=a.year!==b.year?`<p class="verdict-note">Different seasons: each player is ranked against the league in their own season (${a.year} and ${b.year}).</p>`:'';
  const missing=[a,b].filter(p=>(p===a?oa:ob)===null).map(p=>p.data.name);
  const missingNote=missing.length?`<p class="verdict-note">${SS.escape(missing.join(' and '))} ${missing.length>1?'have':'has'} no Baseball Savant rankings for the selected season, usually because of limited playing time. Try another season.</p>`:'';
  const weights=Stats.categories[state.role].map(g=>`${g.name} ${Math.round(g.weight*100)}%`).join(' · ');
  const overallLabel=state.role==='pitching'?'Overall Pitching':'Overall Hitting';
  const cards=[
    `<div class="pair-card overall"><div class="pair-summary"><div class="pair-head"><span class="pair-title">${overallLabel}</span>${diffHtml(oa,ob,names)}</div>
      <p class="category-desc">Weighted average of the category scores below: ${weights}. Missing categories are left out and the other weights rebalanced.</p>
      <div class="pair-bars">${barRow('a',names.a,oa,overallLabel)}${barRow('b',names.b,ob,overallLabel)}</div></div></div>`,
    ...scoreA.groups.map((g,i)=>{
      const gb=scoreB.groups[i];
      return `<details class="pair-card"><summary class="pair-summary"><div class="pair-head"><span class="pair-title">${SS.escape(g.name)} <small>${Math.round(g.weight*100)}% of overall</small></span>${diffHtml(g.score,gb.score,names)}</div>
        <p class="category-desc">${SS.escape(g.desc)}</p>
        <div class="pair-bars">${barRow('a',names.a,g.score,g.name)}${barRow('b',names.b,gb.score,g.name)}</div>
        <span class="pair-toggle"><span class="when-closed">Show the stats behind this score ▸</span><span class="when-open">Hide stats ▾</span></span></summary>
        <div class="pair-details">${metricTable(g,a,b,names,la,lb)}<p class="pct-note">✓ marks the better value. The small number is that stat’s percentile rank within the player’s own season.</p></div></details>`;
    })
  ].join('');
  resultsEl.innerHTML=`<section class="verdict" tabindex="-1" aria-label="Comparison summary"><div class="verdict-score">${overallLine}</div><p>${catLine}</p>${seasonNote}${missingNote}</section>
    <section class="compare-section"><h2>Percentile rankings</h2>
      <div class="cmp-legend" aria-label="Legend">${SLOTS.map(s=>`<span><span class="swatch swatch-${s}" aria-hidden="true"></span>${SS.escape(state[s].data.name)} · ${state[s].year}</span>`).join('')}</div>
      <p class="pct-note scale-note">Bar length is a 0–100 percentile score: 100 means better than every other ranked ${roleWord(false)} that season. Select a category to see its stats. <button type="button" class="explain-btn" data-explain="percentile" aria-label="What is a percentile?" aria-expanded="false" aria-haspopup="dialog">i</button></p>
      <div class="pair-cards">${cards}</div></section>
    <section class="compare-section"><h2>Season statistics</h2>
      <div class="pair-details flush">${seasonTable(a,b,names)}</div>
      <p class="pct-note">✓ marks the better rate stat. Totals such as home runs${state.role==='pitching'?', strikeouts':''} and ${state.role==='pitching'?'wins':'RBI'} grow with playing time, so check ${state.role==='pitching'?'innings pitched':'games and plate appearances'} before comparing them.</p></section>
    <p class="data-source compare-source">Season totals: MLB Stats API · Percentile rankings and advanced metrics: Baseball Savant · ERA and WHIP percentiles: calculated against pitchers with at least 30 innings that season.</p>`;
}

// ---------- Events ----------
document.addEventListener('input',e=>{const input=e.target.closest?.('.pick-input');if(input)showMatches(input);});
document.addEventListener('keydown',e=>{
  const input=e.target.closest?.('.pick-input');if(!input)return;
  if(e.key==='ArrowDown'){e.preventDefault();if(document.getElementById(`pick-${input.dataset.slot}-list`).hidden)showMatches(input);else moveActive(input,1);}
  else if(e.key==='ArrowUp'){e.preventDefault();moveActive(input,-1);}
  else if(e.key==='Enter'){
    e.preventDefault();const list=document.getElementById(`pick-${input.dataset.slot}-list`);
    const opt=!list.hidden&&(list.querySelector('.active[data-id]')||list.querySelector('[data-id]'));
    if(opt)choose(input.dataset.slot,opt.dataset.id);
  }else if(e.key==='Escape')hideMatches(input);
});
document.addEventListener('focusout',e=>{const input=e.target.closest?.('.pick-input');if(input)setTimeout(()=>{if(document.activeElement!==input)hideMatches(input);},150);});
// Keep focus in the input while an option is pressed, so the click lands.
document.addEventListener('mousedown',e=>{if(e.target.closest('.pick-list [data-id]'))e.preventDefault();});
document.addEventListener('click',async e=>{
  const opt=e.target.closest('.pick-list [data-id]');
  if(opt){choose(opt.closest('.pick-list').id.split('-')[1],opt.dataset.id);return;}
  const fav=e.target.closest('.fav-pick');
  if(fav){choose(fav.dataset.slot,fav.dataset.id);return;}
  const change=e.target.closest('.slot-change');
  if(change){const slot=change.dataset.slot;state[slot]=null;statusEl.textContent='';await update();document.getElementById(`pick-${slot}`)?.focus();return;}
  const roleBtn=e.target.closest('.role-toggle button');
  if(roleBtn&&roleBtn.dataset.role!==state.role){
    state.role=roleBtn.dataset.role;
    const dropped=[];
    for(const slot of SLOTS){
      const s=state[slot];if(!s)continue;
      const years=roleYears(s.data,state.role);
      if(!years.length){dropped.push(s.data.name);state[slot]=null;}
      else s.year=defaultYear(years,s.year);
    }
    statusEl.textContent=dropped.length?`Removed ${dropped.join(' and ')}: no ${state.role} seasons in this data.`:'';
    await update();
    return;
  }
  if(e.target.closest('#swap')){[state.a,state.b]=[state.b,state.a];statusEl.textContent='';await update();}
});
document.addEventListener('change',e=>{
  const sel=e.target.closest('.slot-year');
  if(sel&&state[sel.dataset.slot]){state[sel.dataset.slot].year=sel.value;update();}
});

async function init(){
  try{
    const [idx]=await Promise.all([SS.json('data/players.json'),SS.loadTeamLogos(),SS.json('data/glossary.json').then(g=>{glossary=g;})]);
    index=idx;indexById=new Map(index.map(e=>[String(e.id),e]));
  }catch(err){
    console.error(err);
    resultsEl.innerHTML='<p class="error-state">Could not load player data. Run the site through a local web server (not file://).</p>';
    return;
  }
  Stats.initExplain({glossary:()=>glossary,mode:()=>state.role});
  // A star toggle changes the favorites shortcuts under any empty slot.
  SS.bindStars(()=>SLOTS.forEach(s=>{const el=document.getElementById(`fav-quick-${s}`);if(el)el.innerHTML=favQuickHtml(s);}));
  window.addEventListener('pageshow',e=>{if(e.persisted)renderSlots();});
  const a=params.get('a'),b=params.get('b');
  // No role in the link: use player 1's main role.
  if(a&&!params.get('role')){try{state.role=SS.role(await loadPlayer(a));}catch(err){}}
  if(a)await setPlayer('a',a,params.get('ya'));
  if(b)await setPlayer('b',b,params.get('yb'));
  await update();
  const empty=SLOTS.find(s=>!state[s]);
  if(empty)document.getElementById(`pick-${empty}`)?.focus();
}
init();
