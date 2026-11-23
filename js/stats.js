'use strict';
// Shared stat definitions, scoring and explanations.
// Used by the profile pages (profile.js) and the comparison page (compare.js)
// so a player's category scores are calculated the same way everywhere.
// Requires common.js (SS) to be loaded first.
const Stats={};

// Weights describe the contribution of each CATEGORY to the overall bar,
// not the contribution of individual raw units (ERA, mph, percentages).
Stats.categories={
  batting:[
    {name:'Power',weight:.40,desc:'How hard and how far the player hits the ball.',metrics:[
      {name:'Expected Slugging (xSLG)',key:'xslg',raw:'xslg',kind:'decimal3'},
      {name:'Barrel%',key:'brl_percent',raw:'barrel_batted_rate',kind:'pct1'},
      {name:'Hard-Hit%',key:'hard_hit_percent',raw:'hard_hit_percent',kind:'pct1'}
    ]},
    {name:'Contact Ability',weight:.40,desc:'How likely the player’s contact is to turn into hits and times on base, judged by how well the ball was hit.',metrics:[
      {name:'Expected Batting Average (xBA)',key:'xba',raw:'xba',kind:'decimal3'},
      {name:'Expected wOBA',key:'xwoba',raw:'xwoba',kind:'decimal3'},
      {name:'Squared-Up Rate',key:'squared_up_rate',raw:'squared_up_swing',kind:'pct1'}
    ]},
    {name:'Plate Discipline',weight:.10,desc:'How well the player controls the strike zone: laying off bad pitches, drawing walks and avoiding strikeouts and misses.',metrics:[
      {name:'Chase%',key:'chase_percent',raw:'oz_swing_percent',kind:'pct1'},
      {name:'Strikeout%',key:'k_percent',raw:'k_percent',kind:'pct1',fallback:'strikeouts'},
      {name:'Walk (BB)%',key:'bb_percent',raw:'bb_percent',kind:'pct1',fallback:'walks'},
      {name:'Whiff%',key:'whiff_percent',raw:'whiff_percent',kind:'pct1'}
    ]},
    {name:'Swing Quality',weight:.10,desc:'How fast the player swings and how cleanly they connect.',metrics:[
      {name:'Bat Speed',key:'bat_speed',raw:'avg_swing_speed',kind:'mph1'},
      {name:'Average Exit Velocity',key:'exit_velocity',raw:'exit_velocity_avg',kind:'mph1'},
      {name:'Squared-Up Rate',key:'squared_up_rate',raw:'squared_up_swing',kind:'pct1'}
    ]}
  ],
  pitching:[
    {name:'Run Prevention',weight:.40,desc:'How well the pitcher keeps runs off the board and runners off the bases.',metrics:[
      {name:'xERA',desc:'Expected Earned Run Average',key:'xera',raw:'xera',kind:'decimal2'},
      {name:'xBA',desc:'Expected Batting Average allowed',key:'xba',raw:'xba',kind:'decimal3'},
      {name:'WHIP',desc:'Walks + Hits per Inning Pitched',key:'whip',kind:'decimal2',source:'league',fallback:'whip'},
      {name:'ERA',desc:'Earned Run Average',key:'era',kind:'decimal2',source:'league',fallback:'era'}
    ]},
    {name:'Contact Management',weight:.25,desc:'How weak the contact is when hitters do put the ball in play.',metrics:[
      {name:'Average Exit Velocity',key:'exit_velocity',raw:'exit_velocity_avg',kind:'mph1'},
      {name:'Hard-Hit%',key:'hard_hit_percent',raw:'hard_hit_percent',kind:'pct1'},
      {name:'Barrel%',key:'brl_percent',raw:'barrel_batted_rate',kind:'pct1'},
      {name:'GB%',desc:'Ground Ball Percentage',key:'gb',raw:'groundballs_percent',kind:'pct1',source:'extra'}
    ]},
    {name:'Throwing Control',weight:.25,desc:'How often the pitcher gets strikeouts, swings and misses and chases while avoiding walks.',metrics:[
      {name:'Chase%',key:'chase_percent',raw:'oz_swing_percent',kind:'pct1'},
      {name:'Strikeout%',key:'k_percent',raw:'k_percent',kind:'pct1',fallback:'strikeouts'},
      {name:'Walk (BB)%',key:'bb_percent',raw:'bb_percent',kind:'pct1',fallback:'walks'},
      {name:'Whiff%',key:'whiff_percent',raw:'whiff_percent',kind:'pct1'}
    ]},
    {name:'Pitching Quality',weight:.10,desc:'The raw stuff behind the pitches: fastball speed and how far out front the ball is released.',metrics:[
      {name:'Fastball Velocity',key:'fb_velocity',raw:'velocity',kind:'mph1'},
      {name:'Extension',key:'extension',raw:'release_extension',kind:'ft1',source:'extra'}
    ]}
  ]
};

Stats.average=nums=>nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:null;

// Percentile rank (0-100, higher is always better) for one metric in one season.
// league = that year's data/league-percentiles-<year>.json (ERA/WHIP only).
Stats.percentile=(mode,playerId,m,season,league)=>{
  if(m.source==='league')return SS.number(league?.[playerId]?.[m.key]);
  if(m.source==='extra')return SS.number(season.pitching_extra_percentiles?.[m.key]);
  return SS.number(season[mode+'_percentiles']?.[m.key]);
};

// Actual measured value for one metric in one season, with where it came from.
Stats.raw=(mode,m,season)=>{
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
};

Stats.display=(value,kind)=>{
  if(value===null)return 'N/A';
  if(kind==='decimal3')return Number(value).toFixed(3).replace(/^0(?=\.)/,'');
  if(kind==='decimal2')return Number(value).toFixed(2);
  if(kind==='pct1')return Number(value).toFixed(1)+'%';
  if(kind==='mph1')return Number(value).toFixed(1)+' mph';
  if(kind==='ft1')return Number(value).toFixed(1)+' ft';
  return String(value);
};

Stats.barColor=value=>{
  if(value===null)return '#d4d8dd';
  if(value>=80)return '#e9282d';
  if(value>=60)return '#f37779';
  if(value>=40)return '#f9abab';
  return '#f8d9d9';
};

// 1 -> 1st, 2 -> 2nd, 11 -> 11th, 23 -> 23rd
Stats.ordinal=n=>{const v=n%100;return n+(v>=11&&v<=13?'th':({1:'st',2:'nd',3:'rd'}[n%10]||'th'));};

Stats.ratingLabel=score=>{if(score===null)return 'No rank';if(score>=90)return 'ELITE';if(score>=70)return 'Very Good';if(score>=55)return 'Good';if(score>=40)return 'Average';return 'Below Average';};

// Category scores and the weighted overall score for one player-season.
// Each category is the simple average of its own available stat percentiles
// (a stat listed twice in one category counts once). The overall score is the
// weighted average of the categories that have data; missing categories are
// excluded and the remaining weights are rebalanced.
Stats.score=(mode,player,year,league)=>{
  const season=player.seasons[year]||{};
  const groups=Stats.categories[mode].map(g=>{
    const rows=g.metrics.map(m=>({...m,score:Stats.percentile(mode,player.id,m,season,league)}));
    const unique=new Map(rows.map(m=>[m.key,m]));
    return {...g,rows,score:Stats.average([...unique.values()].map(m=>m.score).filter(v=>v!==null))};
  });
  const valid=groups.filter(g=>g.score!==null);
  const totalWeight=valid.reduce((s,g)=>s+g.weight,0);
  const overall=totalWeight?valid.reduce((s,g)=>s+g.score*g.weight,0)/totalWeight:null;
  return {groups,overall};
};

// ---------- Better/worse direction ----------
// Glossary entries state the direction for hitters. These stats flip for pitchers
// (e.g. a hitter wants a low strikeout rate, a pitcher wants a high one).
Stats.pitcherFlip=new Set(['chase_percent','k_percent','bb_percent','whiff_percent','exit_velocity','hard_hit_percent','brl_percent','xba','strikeouts','walks']);
// true = higher is better, false = lower is better,
// null = no better/worse direction (playing time, role or record stats).
Stats.higherIsBetter=(glossary,key,mode)=>{
  const g=glossary[key];if(!g)return true;
  if(g.higherIsBetter===null||g.higherIsBetter===undefined)return null;
  return mode==='pitching'&&Stats.pitcherFlip.has(key)?!g.higherIsBetter:g.higherIsBetter;
};
// Plain-language direction. Pass mode ('batting'/'pitching') when the reader is
// looking at one kind of player; omit it on the glossary page.
Stats.directionText=(glossary,key,mode)=>{
  const g=glossary[key];if(!g)return '';
  if(g.higherIsBetter===null||g.higherIsBetter===undefined)return g.note||'No better or worse direction on its own';
  const who=r=>r==='pitching'?'pitchers':'hitters';
  if(mode)return `${Stats.higherIsBetter(glossary,key,mode)?'Higher':'Lower'} is better for ${who(mode)}`;
  if(g.role)return `${g.higherIsBetter?'Higher':'Lower'} is better for ${who(g.role)}`;
  if(Stats.pitcherFlip.has(key))return `${g.higherIsBetter?'Higher':'Lower'} is better for hitters; ${g.higherIsBetter?'lower':'higher'} is better for pitchers`;
  return `${g.higherIsBetter?'Higher':'Lower'} is better`;
};

// ---------- Inline stat explanations ("i" buttons) ----------
// Buttons render anywhere a stat name appears; one shared popover shows the
// definition next to the button so the reader never has to leave the page.
Stats.explainButton=(key,label)=>`<button type="button" class="explain-btn" data-explain="${SS.escape(key)}" aria-label="What is ${SS.escape(label)}?" aria-expanded="false" aria-haspopup="dialog">i</button>`;

// opts.glossary() returns the loaded glossary; opts.mode() returns the current role.
Stats.initExplain=opts=>{
  let pop=null,openBtn=null;
  const close=returnFocus=>{
    if(pop){pop.remove();pop=null;}
    if(openBtn){openBtn.setAttribute('aria-expanded','false');if(returnFocus)openBtn.focus();}
    openBtn=null;
  };
  const open=btn=>{
    const glossary=opts.glossary()||{};const key=btn.dataset.explain;const g=glossary[key];
    if(!g)return;
    const mode=opts.mode?opts.mode():null;
    const unit=(g.unit||'').trim();
    pop=document.createElement('div');
    pop.className='explain-pop';pop.id='explain-pop';
    pop.setAttribute('role','dialog');pop.setAttribute('aria-label',`Definition: ${g.name}`);pop.tabIndex=-1;
    pop.innerHTML=`<div class="explain-head"><strong>${SS.escape(g.name)}</strong><button type="button" class="explain-close" aria-label="Close definition">×</button></div>
      <p>${SS.escape(g.definition)}</p>
      <p class="explain-meta">${SS.escape(Stats.directionText(glossary,key,mode))}${unit?` · Unit: ${SS.escape(unit)}`:''}</p>
      <a class="explain-more" href="glossary.html#${encodeURIComponent(key)}">Open in glossary →</a>`;
    document.body.appendChild(pop);
    const r=btn.getBoundingClientRect();const vw=document.documentElement.clientWidth;
    const w=Math.min(320,vw-16);pop.style.width=w+'px';
    const left=Math.max(8,Math.min(r.left+r.width/2-w/2,vw-w-8));
    pop.style.left=`${left+window.scrollX}px`;
    pop.style.top=`${r.bottom+window.scrollY+8}px`;
    btn.setAttribute('aria-expanded','true');btn.setAttribute('aria-controls','explain-pop');
    openBtn=btn;
    pop.querySelector('.explain-close').addEventListener('click',()=>close(true));
    pop.focus({preventScroll:true});
  };
  document.addEventListener('click',e=>{
    const btn=e.target.closest('.explain-btn');
    if(btn){
      // preventDefault keeps a button inside <summary> from toggling its <details>.
      e.preventDefault();
      const same=btn===openBtn;close(false);if(!same)open(btn);
      return;
    }
    if(pop&&!pop.contains(e.target))close(false);
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&pop)close(true);});
  window.addEventListener('resize',()=>close(false));
  window.addEventListener('hashchange',()=>close(false));
  return {close};
};
