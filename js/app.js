const REGION = 'MX';
const LANG = 'es-MX';

// Matched by provider name so it survives TMDB id changes (e.g. "Max" ↔ "HBO Max").
// Names containing "channel" are add-on channels inside another app (e.g. "Crunchyroll Amazon Channel").
const PLATFORMS = [
  { key: 'netflix', name: 'Netflix', match: n => n.includes('netflix') },
  { key: 'prime', name: 'Prime Video', match: n => n.includes('prime video') },
  { key: 'crunchyroll', name: 'Crunchyroll', match: n => n.includes('crunchyroll') },
  { key: 'max', name: 'Max', match: n => n === 'max' || n.startsWith('hbo max') },
  { key: 'disney', name: 'Disney+', match: n => n.includes('disney') },
];
const DEFAULT_ACTIVE = { netflix: true, prime: true, crunchyroll: true, max: false, disney: false };

function platformOf(providerName) {
  const n = providerName.toLowerCase();
  if (n.includes('channel')) return null;
  return PLATFORMS.find(p => p.match(n)) || null;
}

// ---------- small helpers ----------
const $ = sel => document.querySelector(sel);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get(k, f) { try { const v = localStorage.getItem(k); return v == null ? f : JSON.parse(v); } catch { return f; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const dayStr = d => d.toISOString().slice(0, 10);
const daysAgo = n => dayStr(new Date(Date.now() - n * 864e5));

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3200);
}

function activePlatforms() {
  const a = ls.get('platforms', DEFAULT_ACTIVE);
  return PLATFORMS.filter(p => a[p.key]);
}

// ---------- TMDB ----------
function tmdbKey() { return ls.get('tmdbKey', ''); }

async function tmdb(path, params = {}) {
  const key = tmdbKey();
  if (!key) throw new Error('NO_KEY');
  const url = new URL('https://api.themoviedb.org/3' + path);
  url.searchParams.set('language', LANG);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers = { Accept: 'application/json' };
  // v4 "Read Access Token" is a JWT (starts with eyJ); otherwise treat as v3 api_key.
  if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key;
  else url.searchParams.set('api_key', key);
  const res = await fetch(url, { headers });
  if (res.status === 401) throw new Error('BAD_KEY');
  if (!res.ok) throw new Error('TMDB ' + res.status);
  return res.json();
}

function tmdbError(e) {
  if (e.message === 'NO_KEY') return 'Primero pega tu API key de TMDB en Ajustes.';
  if (e.message === 'BAD_KEY') return 'La API key de TMDB no es válida. Revísala en Ajustes.';
  return 'No se pudo conectar. Revisa tu internet e intenta de nuevo.';
}

const watchPage = (type, id) => `https://www.themoviedb.org/${type}/${id}/watch?locale=${REGION}`;
const poster = (p, size = 'w185') => p ? `https://image.tmdb.org/t/p/${size}${p}` : '';

// TMDB provider ids per platform, cached for a week.
async function providerIds(kind) {
  const cache = ls.get('providerIds', null);
  if (cache && cache[kind] && Date.now() - cache.ts < 7 * 864e5) return cache[kind];
  const data = await tmdb(`/watch/providers/${kind}`, { watch_region: REGION });
  const map = {};
  for (const p of data.results) {
    const plat = platformOf(p.provider_name);
    if (plat) (map[plat.key] = map[plat.key] || []).push(p.provider_id);
  }
  const next = Object.assign({}, cache && Date.now() - cache.ts < 7 * 864e5 ? cache : {}, { [kind]: map, ts: Date.now() });
  ls.set('providerIds', next);
  return map;
}

// ---------- tabs ----------
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === name));
  ls.set('view', name);
  if (name === 'new') loadNew();
  if (name === 'anime') renderFollowing();
  if (name === 'settings') renderSettings();
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));

// ---------- Buscar ----------
$('#search-form').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('#search-input').value.trim();
  if (!q) return;
  $('#search-input').blur();
  const box = $('#search-results');
  box.innerHTML = '<div class="loading">Buscando…</div>';
  try {
    const data = await tmdb('/search/multi', { query: q, include_adult: 'false', region: REGION });
    const items = data.results.filter(r => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 12);
    if (!items.length) { box.innerHTML = '<div class="empty">No encontré nada con ese nombre.</div>'; return; }
    const provs = await Promise.all(items.map(r =>
      tmdb(`/${r.media_type}/${r.id}/watch/providers`).then(d => d.results[REGION] || null).catch(() => null)));
    box.innerHTML = items.map((r, i) => searchCard(r, provs[i])).join('');
  } catch (err) {
    box.innerHTML = `<div class="empty">${esc(tmdbError(err))}</div>`;
  }
});

function searchCard(r, prov) {
  const isTv = r.media_type === 'tv';
  const title = isTv ? r.name : r.title;
  const year = (isTv ? r.first_air_date : r.release_date || '').slice(0, 4);
  const isAnime = (r.genre_ids || []).includes(16) && r.original_language === 'ja';
  const kind = isAnime ? 'Anime' : isTv ? 'Serie' : 'Película';

  const active = new Set(activePlatforms().map(p => p.key));
  const stream = prov ? [...(prov.flatrate || []), ...(prov.ads || [])] : [];
  const mine = new Map();   // platform key -> platform (active)
  const paused = new Map(); // one of my platforms, currently switched off
  const others = new Set();
  for (const p of stream) {
    const plat = platformOf(p.provider_name);
    if (plat && active.has(plat.key)) mine.set(plat.key, plat);
    else if (plat) paused.set(plat.key, plat);
    else others.add(p.provider_name);
  }
  const rentBuy = prov ? [...new Set([...(prov.rent || []), ...(prov.buy || [])].map(p => p.provider_name))] : [];

  let badges = [...mine.values()].map(p => `<span class="badge mine p-${p.key}">${esc(p.name)}</span>`).join('');
  badges += [...paused.values()].map(p => `<span class="badge">${esc(p.name)} (pausada)</span>`).join('');
  if (!mine.size && !paused.size) badges += '<span class="badge none">No está en tus plataformas</span>';

  const extra = [];
  if (others.size) extra.push('También en: ' + [...others].slice(0, 4).join(', '));
  if (rentBuy.length) extra.push('Renta/compra: ' + rentBuy.slice(0, 3).join(', '));

  const img = r.poster_path ? `<img src="${poster(r.poster_path)}" alt="" loading="lazy">` : '<div class="noimg"></div>';
  return `<a class="card" style="text-decoration:none;color:inherit" href="${watchPage(r.media_type, r.id)}" target="_blank" rel="noopener">
    ${img}
    <div class="body">
      <div class="title">${esc(title)}</div>
      <div class="meta">${kind}${year ? ' · ' + year : ''}</div>
      <div class="badges">${badges}</div>
      ${extra.map(x => `<div class="also">${esc(x)}</div>`).join('')}
    </div>
  </a>`;
}

// ---------- Novedades ----------
let newKind = 'tv';
let newPlatform = null;

document.querySelectorAll('#new-kind button').forEach(b => b.addEventListener('click', () => {
  newKind = b.dataset.kind;
  document.querySelectorAll('#new-kind button').forEach(x => x.classList.toggle('on', x === b));
  loadNew();
}));

function renderNewChips() {
  const plats = activePlatforms();
  if (!plats.some(p => p.key === newPlatform)) newPlatform = plats[0] ? plats[0].key : null;
  $('#new-platforms').innerHTML = plats.map(p =>
    `<button data-p="${p.key}" class="${p.key === newPlatform ? 'on badge p-' + p.key : ''}">${esc(p.name)}</button>`).join('');
  document.querySelectorAll('#new-platforms button').forEach(b => b.addEventListener('click', () => {
    newPlatform = b.dataset.p;
    loadNew();
  }));
}

let newReq = 0;
async function loadNew() {
  renderNewChips();
  const box = $('#new-results');
  const hint = $('#new-hint');
  if (!newPlatform) { box.innerHTML = ''; hint.textContent = 'Activa al menos una plataforma en Ajustes.'; return; }
  const plat = PLATFORMS.find(p => p.key === newPlatform);
  hint.textContent = newKind === 'tv'
    ? `Series con episodios nuevos en ${plat.name} (últimas 2 semanas), de más a menos populares.`
    : `Películas recientes (últimos 4 meses) disponibles en ${plat.name}.`;
  box.innerHTML = '<div class="loading" style="grid-column:1/-1">Cargando…</div>';
  const req = ++newReq;
  try {
    const ids = (await providerIds(newKind))[newPlatform];
    if (!ids || !ids.length) throw new Error('NO_PROVIDER');
    const params = {
      watch_region: REGION,
      with_watch_providers: ids.join('|'),
      with_watch_monetization_types: 'flatrate|ads',
      sort_by: 'popularity.desc',
    };
    if (newKind === 'tv') Object.assign(params, { 'air_date.gte': daysAgo(14), 'air_date.lte': daysAgo(-1) });
    else Object.assign(params, { 'primary_release_date.gte': daysAgo(120), 'primary_release_date.lte': daysAgo(0) });
    const data = await tmdb(`/discover/${newKind}`, params);
    if (req !== newReq) return;
    if (!data.results.length) { box.innerHTML = '<div class="empty" style="grid-column:1/-1">No hay resultados por ahora.</div>'; return; }
    box.innerHTML = data.results.map(r => {
      const title = newKind === 'tv' ? r.name : r.title;
      const date = newKind === 'tv' ? r.first_air_date : r.release_date;
      const img = r.poster_path ? `<img src="${poster(r.poster_path, 'w342')}" alt="" loading="lazy">` : '<div class="noimg"></div>';
      return `<a class="tile" href="${watchPage(newKind, r.id)}" target="_blank" rel="noopener">
        ${img}<div class="t">${esc(title)}</div><div class="d">${esc((date || '').slice(0, 4))}</div></a>`;
    }).join('');
  } catch (err) {
    if (req !== newReq) return;
    const msg = err.message === 'NO_PROVIDER' ? `TMDB no tiene datos de ${plat.name} en México.` : tmdbError(err);
    box.innerHTML = `<div class="empty" style="grid-column:1/-1">${esc(msg)}</div>`;
  }
}

// ---------- Mis animes ----------
function fmtNext(next) {
  if (!next) return '';
  const d = new Date(next.airingAt * 1000);
  const when = d.toLocaleString(LANG, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `Próximo: ep. ${next.episode} · ${when}`;
}

async function renderFollowing() {
  updateNotifBanner();
  const list = await Anime.getFollowing();
  const box = $('#anime-following');
  if (!list.length) { box.innerHTML = '<div class="empty">Aún no sigues ningún anime. Búscalo abajo y toca «Seguir».</div>'; return; }
  box.innerHTML = list.map(a => {
    const img = a.cover ? `<img src="${esc(a.cover)}" alt="" loading="lazy">` : '<div class="noimg"></div>';
    const status = a.status === 'FINISHED' ? 'Ya terminó' : fmtNext(a.next) || 'Sin fecha del próximo episodio';
    return `<div class="card">${img}<div class="body">
      <div class="title">${esc(a.title)}</div>
      <div class="meta">${a.lastEp ? `Último: ep. ${a.lastEp}` : 'Aún no se estrena'}<br>${esc(status)}</div>
      <div class="badges">${a.url ? '<span class="badge ok">En Crunchyroll</span>' : '<span class="badge none">No aparece en Crunchyroll</span>'}</div>
      <div class="actions">
        ${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener"><button class="small">Ver</button></a>` : ''}
        <button class="small secondary" data-unfollow="${a.id}">Dejar de seguir</button>
      </div></div></div>`;
  }).join('');
  box.querySelectorAll('[data-unfollow]').forEach(b => b.addEventListener('click', async () => {
    await Anime.unfollow(Number(b.dataset.unfollow));
    renderFollowing();
  }));
}

let animeResults = [];
$('#anime-form').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('#anime-input').value.trim();
  if (!q) return;
  $('#anime-input').blur();
  const box = $('#anime-results');
  box.innerHTML = '<div class="loading">Buscando…</div>';
  try {
    animeResults = await Anime.search(q);
    await renderAnimeResults();
  } catch {
    box.innerHTML = '<div class="empty">No se pudo buscar. Intenta de nuevo en un momento.</div>';
  }
});

async function renderAnimeResults() {
  const box = $('#anime-results');
  if (!animeResults.length) { box.innerHTML = '<div class="empty">No encontré ese anime.</div>'; return; }
  const following = new Set((await Anime.getFollowing()).map(a => a.id));
  box.innerHTML = animeResults.map(m => {
    const cr = Anime.crunchyrollLink(m);
    const airing = m.status === 'RELEASING' || m.status === 'NOT_YET_RELEASED';
    const meta = [m.format, m.seasonYear, m.status === 'RELEASING' ? 'En emisión' : m.status === 'NOT_YET_RELEASED' ? 'Próximamente' : 'Terminado']
      .filter(Boolean).join(' · ');
    const img = m.coverImage && m.coverImage.large ? `<img src="${esc(m.coverImage.large)}" alt="" loading="lazy">` : '<div class="noimg"></div>';
    const btn = following.has(m.id)
      ? '<button class="small secondary" disabled>Siguiendo</button>'
      : `<button class="small" data-follow="${m.id}">${airing ? 'Seguir' : 'Seguir de todos modos'}</button>`;
    return `<div class="card">${img}<div class="body">
      <div class="title">${esc(Anime.displayTitle(m))}</div>
      <div class="meta">${esc(meta)}${m.nextAiringEpisode ? '<br>' + esc(fmtNext(m.nextAiringEpisode)) : ''}</div>
      <div class="badges">${cr ? '<span class="badge ok">En Crunchyroll</span>' : '<span class="badge none">No aparece en Crunchyroll</span>'}</div>
      <div class="actions">${btn}</div></div></div>`;
  }).join('');
  box.querySelectorAll('[data-follow]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      const m = animeResults.find(x => x.id === Number(b.dataset.follow));
      await Anime.follow(m);
      toast(`Siguiendo ${Anime.displayTitle(m)}`);
      renderFollowing();
      renderAnimeResults();
      if (Notification.permission === 'default') updateNotifBanner();
    } catch {
      b.disabled = false;
      toast('No se pudo agregar. Intenta de nuevo.');
    }
  }));
}

// ---------- Notificaciones ----------
const canNotify = 'Notification' in window && 'serviceWorker' in navigator;

function updateNotifBanner() {
  $('#notif-banner').classList.toggle('hidden', !canNotify || Notification.permission === 'granted');
}

async function registerPeriodicCheck() {
  const reg = await navigator.serviceWorker.ready;
  if (!('periodicSync' in reg)) return false;
  try {
    const st = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (st.state !== 'granted') return false;
    await reg.periodicSync.register('check-anime', { minInterval: 60 * 60 * 1000 });
    return true;
  } catch { return false; }
}

$('#notif-enable').addEventListener('click', async () => {
  const p = await Notification.requestPermission();
  updateNotifBanner();
  if (p === 'granted') {
    const bg = await registerPeriodicCheck();
    toast(bg ? 'Listo. Te avisaré de episodios nuevos.' : 'Listo. Instala la app en tu pantalla de inicio para revisiones automáticas.');
  } else {
    toast('Sin permiso no puedo mandarte avisos.');
  }
});

async function runCheck({ force = false } = {}) {
  const last = await Store.get('lastCheck', 0);
  if (!force && Date.now() - last < 15 * 60 * 1000) return null;
  const reg = canNotify ? await navigator.serviceWorker.ready : null;
  const fresh = await Anime.check(async (anime, ep) => {
    if (reg && Notification.permission === 'granted') {
      const n = Anime.notificationFor(anime, ep);
      await reg.showNotification(n.title, n.options);
    }
  });
  if ($('#view-anime').classList.contains('active')) renderFollowing();
  return fresh;
}

$('#notif-test').addEventListener('click', async () => {
  try {
    const fresh = await runCheck({ force: true });
    toast(fresh && fresh.length ? `${fresh.length} episodio(s) nuevo(s)` : 'No hay episodios nuevos por ahora.');
    renderSettings();
  } catch { toast('No se pudo revisar. Intenta de nuevo.'); }
});

// ---------- Ajustes ----------
async function renderSettings() {
  const active = ls.get('platforms', DEFAULT_ACTIVE);
  $('#settings-platforms').innerHTML = PLATFORMS.map(p => `
    <label class="toggle"><span>${esc(p.name)}</span>
      <input type="checkbox" data-p="${p.key}" ${active[p.key] ? 'checked' : ''}></label>`).join('');
  document.querySelectorAll('#settings-platforms input').forEach(i => i.addEventListener('change', () => {
    const a = ls.get('platforms', DEFAULT_ACTIVE);
    a[i.dataset.p] = i.checked;
    ls.set('platforms', a);
  }));

  $('#key-status').textContent = tmdbKey() ? '✓ API key guardada.' : 'Todavía no hay API key.';

  let txt;
  if (!canNotify) txt = 'Este navegador no permite notificaciones.';
  else if (Notification.permission === 'denied') txt = 'Bloqueaste las notificaciones. Actívalas en los ajustes del sitio en Chrome.';
  else if (Notification.permission === 'default') txt = 'Todavía no activas las notificaciones (pestaña Mis animes).';
  else {
    const bg = await registerPeriodicCheck();
    txt = bg
      ? 'Activas. Chrome revisa en segundo plano varias veces al día (él decide cuándo, según qué tanto uses la app). También reviso cada vez que abres la app.'
      : 'Activas, pero las revisiones en segundo plano solo funcionan con la app instalada (Chrome → ⋮ → «Agregar a la pantalla principal»). Mientras tanto, reviso al abrir la app.';
  }
  const last = await Store.get('lastCheck', 0);
  if (last) txt += ` Última revisión: ${new Date(last).toLocaleString(LANG, { dateStyle: 'short', timeStyle: 'short' })}.`;
  $('#notif-status').textContent = txt;
}

$('#key-form').addEventListener('submit', async e => {
  e.preventDefault();
  const v = $('#key-input').value.trim();
  if (!v) return;
  const prev = tmdbKey();
  ls.set('tmdbKey', v);
  try {
    await tmdb('/configuration');
    $('#key-input').value = '';
    ls.set('providerIds', null);
    toast('API key guardada ✓');
  } catch (err) {
    ls.set('tmdbKey', prev);
    toast(tmdbError(err));
  }
  renderSettings();
});

// ---------- arranque ----------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

showView(tmdbKey() ? ls.get('view', 'search') : 'settings');
runCheck().catch(() => {});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') runCheck().catch(() => {});
});
