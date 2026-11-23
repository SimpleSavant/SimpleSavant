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
  summaryYears: (player,selected) => Object.keys(player.seasons||{}).filter(y=>Number(y)<=Number(selected)).sort((a,b)=>b-a).slice(0,2).reverse(),
  profileUrl: (id,role) => `${role==='pitching'?'pitching':'batting'}.html?id=${encodeURIComponent(id)}`
};

// ---------- Favorite (starred) players ----------
// Saved in this browser's localStorage as [{id,name,role,added}], so favorites
// survive reloads without an account. role is the page the player was starred
// from (batting/pitching) so links return to the same view.
SS.favorites = {
  key: 'simplesavant-favorites',
  all() {
    try {
      const list = JSON.parse(localStorage.getItem(this.key) || '[]');
      return Array.isArray(list) ? list.filter(f => f && f.id && f.name) : [];
    } catch (e) { return []; }
  },
  has(id) { return this.all().some(f => String(f.id) === String(id)); },
  // Returns the saved state afterwards (false if storage is blocked).
  toggle(player) {
    const list = this.all();
    const i = list.findIndex(f => String(f.id) === String(player.id));
    if (i >= 0) list.splice(i, 1);
    else list.push({id: String(player.id), name: player.name, role: player.role === 'pitching' ? 'pitching' : 'batting', added: Date.now()});
    try { localStorage.setItem(this.key, JSON.stringify(list)); } catch (e) { console.warn('Favorites could not be saved', e); }
    return this.has(player.id);
  }
};
// Star toggle. Icon-only (result cards, compare page) is a pressed/unpressed
// button with a fixed name; labelled (profile page) spells out the state.
SS.starLabel = on => on ? 'In your favorites' : 'Add to favorites';
SS.starButton = (player, labelled = false) => {
  const on = SS.favorites.has(player.id);
  const data = `data-fav-id="${SS.escape(player.id)}" data-fav-name="${SS.escape(player.name)}" data-fav-role="${SS.escape(player.role)}"`;
  if (labelled) return `<button type="button" class="star-toggle labelled${on ? ' on' : ''}" ${data}><span class="star-icon" aria-hidden="true">${on ? '★' : '☆'}</span> <span class="star-label">${SS.starLabel(on)}</span></button>`;
  return `<button type="button" class="star-toggle${on ? ' on' : ''}" ${data} aria-pressed="${on}" aria-label="Favorite ${SS.escape(player.name)}" title="${SS.starLabel(on)}"><span class="star-icon" aria-hidden="true">${on ? '★' : '☆'}</span></button>`;
};
// Sync every star button for one player (there can be several on a page).
SS.syncStars = (id) => {
  const on = SS.favorites.has(id);
  document.querySelectorAll('.star-toggle').forEach(btn => {
    if (btn.dataset.favId !== String(id)) return;
    btn.classList.toggle('on', on);
    btn.querySelector('.star-icon').textContent = on ? '★' : '☆';
    if (btn.classList.contains('labelled')) btn.querySelector('.star-label').textContent = SS.starLabel(on);
    else { btn.setAttribute('aria-pressed', String(on)); btn.title = SS.starLabel(on); }
  });
};
// One delegated handler per page; onChange runs after every toggle.
SS.bindStars = (onChange) => {
  document.addEventListener('click', e => {
    const btn = e.target.closest('.star-toggle');
    if (!btn) return;
    e.preventDefault();
    const d = btn.dataset;
    const on = SS.favorites.toggle({id: d.favId, name: d.favName, role: d.favRole});
    SS.syncStars(d.favId);
    if (onChange) onChange(d.favId, on);
  });
};
