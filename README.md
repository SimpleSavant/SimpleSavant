# SimpleSavant — search + simplified MLB player pages (version 2)

The site uses the *real* 2021–2026 MLB player dataset supplied in `data.zip` (2,949 player files) and the user-supplied `MLB.zip` team logos. There is no backend and no external image loading. Player headshots and banners remain labeled placeholders.

## Run on Windows

Extract this ZIP. Open PowerShell in the **SimpleSavant** directory:

```powershell
py -3.11 -m http.server 8000
```

Open http://localhost:8000/ . Use a server, not `file://`, because the site fetches JSON and the shared HTML fragment.

- Search: http://localhost:8000/
- Aaron Judge: http://localhost:8000/batting.html?id=592450
- Tarik Skubal: http://localhost:8000/pitching.html?id=669373

## Important: obtain RAW Baseball Savant metrics (one command)

The original uploaded player files include MLB season totals **and Baseball Savant percentile rankings**, but generally **not actual advanced Statcast values**. This version never presents a percentile as if it were a raw stat. Existing actual MLB values (ERA, WHIP, strikeout rate, walk rate) appear immediately. Other actual values show `N/A` until you run this one-time enrichment:

```powershell
py -3.11 -m pip install requests
py -3.11 enrich_raw_stats.py --start 2021 --end 2026
```

The script queries Baseball Savant's Custom Leaderboard CSV for all requested seasons and both roles, matches by **MLBAM player ID**, and adds `<role>_raw` to `data/players/<id>.json`. It also calculates clearly separate derived percentile rankings for pitcher GB% and Extension using pitchers with at least 30 IP. It does not overwrite existing stat percentile rankings, make up missing values, or convert a percentile into a raw value. Re-running is safe: it updates the same JSON files.

**This data download has not been live-tested in the sandbox (network access is unavailable).** It uses documented `?csv=true` Baseball Savant leaderboard URLs; if the service changes parameters or CSV columns, the terminal will report errors and the site will keep showing `N/A` for affected stats. Run the enrichment script *before* committing the site to GitHub Pages. Downloaded values are stored locally in the JSON; your website itself makes no API calls.

When bat-tracking stats are unavailable for older seasons, they remain `N/A`. When a player has too few qualifying events, missing percentiles remain missing.

## Scoring

Each category bar is the arithmetic mean of its available individual **percentile ranks**. A score of 80 on a bar is not "80 mph" or "80% hard-hit". Hover or expand to view the actual metric values with their units. Visible `95th` labels are deliberately removed.

**Overall Hitting** uses the weighted category scores:

- Power: **40%**
- Contact Ability: **40%**
- Plate Discipline: **10%**
- Swing Quality: **10%**

**Overall Pitching** uses these editable defaults (since pitching weights were not specified):

- Run Prevention: **40%**
- Contact Management: **25%**
- Throwing Control: **25%**
- Pitching Quality: **10%**

Change `weight` values at the top of `js/profile.js` to adjust the mix. Missing individual percentile values are skipped within a category. If a category has no available percentiles, its overall weight is redistributed proportionally to available categories. **Overall bars are not derived by averaging raw ERA, mph, and percentages.**

Traditional MLB values are available without further download: ERA, WHIP, and calculated K%/BB%. Advanced numbers from the enrichment include xERA, xBA, xSLG, xwOBA, EV, hard-hit%, barrel%, chase%, whiff%, bat speed, GB%, fastball velocity, and extension, when the source provides them. Their percentiles are still read independently from the original dataset.

## Files

- `index.html`, `js/search.js`: search names, live result cards and matching small square logos
- `batting.html`, `pitching.html`, `js/profile.js`: role-specific player pages with a shared renderer
- `templates/profile-base.html`: the **unlinked, reusable** common profile template, not a visible page
- `assets/teams/*-small.png`: small square logos for search results
- `assets/teams/*-big.png`: larger square logos beside names on profiles
- `assets/team-logos.json`: team-name-to-asset mapping (includes historical aliases for Athletics and Cleveland)
- `css/style.css`: styling, including the two-line PERCENTILE / LOW–HIGH legend
- `data/players.json`: searchable player index
- `data/players/<id>.json`: individual player year/role stats and percentiles
- `data/league-percentiles-<year>.json`: pre-existing league-derived ERA and WHIP percentiles, not official Savant ranks
- `enrich_raw_stats.py`: optional one-time updater for real advanced metrics

## Notes

The team logos are from the user-provided `MLB.zip`; historical team name aliases map to the current logo asset, not historically accurate branding for each year. The position field was absent from the uploaded JSON, so the site says "Batter" or "Pitcher" rather than inventing a specific position. Player photos are still placeholders. Use this file set for GitHub Pages; keep the relative paths intact.
