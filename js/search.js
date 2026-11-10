'use strict';
const searchEl=document.querySelector('#search');
const resultsEl=document.querySelector('#results');
const countEl=document.querySelector('#result-count');
let entries=[];let debounce;
const cache=new Map();let rendering=0;
function listedRole(entry){
  if(entry.roles.includes('pitching')&&!entry.roles.includes('batting'))return 'pitching';
  if(entry.roles.includes('batting')&&!entry.roles.includes('pitching'))return 'batting';
  return null;
}
function rowHtml(entry,role,team){
  const url=`${role==='pitching'?'pitching':'batting'}.html?id=${encodeURIComponent(entry.id)}`;
  const logo=SS.logo(team,'small');
  const logoHtml=logo?`<img class="result-team-logo" src="${logo}" alt="${SS.escape(team)} logo" loading="lazy">`:
    '<span class="team-logo-placeholder" aria-hidden="true">MLB</span>';
  const subline=team?`${SS.escape(team)} · ${role==='pitching'?'Pitcher':'Batter'}`:
    `${role==='pitching'?'Pitcher':'Batter'} · ${SS.escape(entry.seasons.at(-1)||'')}`;
  return `<article class="result-card" data-id="${SS.escape(entry.id)}"><div class="result-photo photo-placeholder"><span>PHOTO</span></div><div class="result-info"><h3>${SS.escape(entry.name)}</h3><div class="result-meta">${logoHtml}<span class="team-role">${subline}</span></div></div><a class="view-button" href="${url}" aria-label="View ${SS.escape(entry.name)} profile">View <span aria-hidden="true">→</span></a></article>`;
}
async function searchResults(){
  const seq=++rendering;
  const q=searchEl.value.trim().toLocaleLowerCase();
  let matching=entries.filter(e=>!q||e.name.toLocaleLowerCase().includes(q));
  if(q)matching.sort((a,b)=>Number(b.name.toLocaleLowerCase().startsWith(q))-Number(a.name.toLocaleLowerCase().startsWith(q)));
  countEl.textContent=`${matching.length.toLocaleString()} ${matching.length===1?'player':'players'} found`;
  if(!matching.length){resultsEl.innerHTML='<p class="empty-state">No players found. Try a different name.</p>';return;}
  const visible=matching.slice(0,8);
  resultsEl.innerHTML=visible.map(e=>rowHtml(e,listedRole(e)||'batting')).join('');
  await Promise.all(visible.map(async entry=>{
    try{
      const data=cache.has(entry.id)?cache.get(entry.id):await SS.player(entry.id);
      cache.set(entry.id,data);
      if(seq!==rendering)return;
      const role=listedRole(entry)||SS.role(data);
      const year=Object.keys(data.seasons||{}).filter(y=>data.seasons[y][role]).sort().at(-1);
      const season=data.seasons[year]||{};
      const team=season[role==='pitching'?'pitching_team':'hitting_team'];
      const row=Array.from(resultsEl.querySelectorAll('.result-card')).find(el=>el.dataset.id===String(entry.id));
      if(row)row.outerHTML=rowHtml(entry,role,team);
    }catch(e){console.warn('Unable to load player card',entry.id,e);}
  }));
}
searchEl.addEventListener('input',()=>{clearTimeout(debounce);debounce=setTimeout(searchResults,100)});
searchEl.addEventListener('keydown',e=>{if(e.key==='Enter'){const url=resultsEl.querySelector('.view-button')?.href;if(url)location.href=url;}});
Promise.all([SS.json('data/players.json'),SS.loadTeamLogos()]).then(([data])=>{entries=data;searchResults()}).catch(err=>{
  resultsEl.innerHTML='<p class="empty-state">Unable to load player index or team logos. Run the site through a local web server (not file://).</p>';console.error(err);
});
