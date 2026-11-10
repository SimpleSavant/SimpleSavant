'use strict';
const SS = {
  json: async url => {const r=await fetch(url);if(!r.ok)throw new Error(`${url} (${r.status})`);return r.json();},
  player: id => SS.json(`data/players/${encodeURIComponent(id)}.json`),
  number: v => (v===null||v===undefined||v===''||v==='.---'||v==='-.--')?null:(Number.isFinite(Number(v))?Number(v):null),
  printable: v => v===null||v===undefined||v===''||v==='.---'||v==='-.--'?'—':String(v),
  escape: s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  latestYear: player => Object.keys(player.seasons||{}).sort().at(-1),
  teamLogos: {},
  loadTeamLogos: async () => {SS.teamLogos = await SS.json('assets/team-logos.json');},
  logo: (team,size='small') => {
    const slug=SS.teamLogos[team];
    return slug?`assets/teams/${encodeURIComponent(slug)}-${size}.png`:null;
  },
  role: player => {
    let ab=0,outs=0;
    for(const season of Object.values(player.seasons||{})){
      ab+=SS.number(season.batting?.atBats)||0;
      outs+=SS.number(season.pitching?.outs)||0;
    }
    return outs>0&&outs/3>ab/2?'pitching':'batting';
  },
  summaryYears: (player,selected) => Object.keys(player.seasons||{}).filter(y=>Number(y)<=Number(selected)).sort((a,b)=>b-a).slice(0,2).reverse()
};
