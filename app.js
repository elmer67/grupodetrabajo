/* ═══════════════════════════════════════════════════════
   HentaiLA Admin — app.js
   Vanilla JS + Supabase JS v2 (CDN)
   ═══════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────────────
//  CONFIG — credenciales Supabase
// ─────────────────────────────────────────────────────
const SUPABASE_URL = 'https://xhetpfovwcqpnwfvwtxu.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoZXRwZm92d2NxcG53ZnZ3dHh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NTE2NzMsImV4cCI6MjA5MzIyNzY3M30.l8lrUIZJVi1hFKERheNP-TiRw5rmkQ6pheD-tylTJv0'
const CDN_BASE = 'https://cdn.hentaila.pro'

const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── IMAGEN ─────────────────────────────────────────
// Replica la lógica de lib/imgPath.ts del proyecto hentaila-pro
function imgPath(dbPath) {
  if (!dbPath) return ''
  if (dbPath.startsWith('http')) return dbPath
  let p = dbPath
  if (p.startsWith('img/')) p = 'assets/' + p
  return `${CDN_BASE}/${p}`
}

// ─────────────────────────────────────────────────────
//  CONTRASEÑAS — config de grupos
// ─────────────────────────────────────────────────────
const SESSIONS = {
  'hideki123': { profile: 'experto', group: 'A', members: ['Jean Franco', 'Hideki'] },
  'ortiz123':  { profile: 'experto', group: 'B', members: ['Osorio', 'Ortiz'] },
  'kish123':   { profile: 'experto', group: 'C', members: ['Kish'] },
  'flower123': { profile: 'redes',   group: null, members: null }
}

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const GRUPO_COLORS = {
  'A': { bg: 'rgba(124,58,237,.22)', border: 'rgba(124,58,237,.55)', text: '#a66ef5' },
  'B': { bg: 'rgba(236,72,153,.22)', border: 'rgba(236,72,153,.55)', text: '#f472b6' },
  'C': { bg: 'rgba(14,165,233,.22)',  border: 'rgba(14,165,233,.55)',  text: '#38bdf8' }
}

// ─────────────────────────────────────────────────────
//  ESTADO GLOBAL
// ─────────────────────────────────────────────────────
let currentSession    = null           // { profile, group, members } — sesión activa
let currentProfile    = 'experto'
let currentAnime      = null
let currentEpisodios  = []
let currentGeneroIds  = new Set()   // ids de géneros del anime activo (estado actual)
let originalGeneroIds = new Set()   // ids originales antes de editar (para revertir)
let allGeneros        = []          // todos los géneros disponibles
let allServidores     = []          // todos los servidores de BD
let mp4Server        = null        // { id_servidor, nombre: 'MP4Upload' }
let embedServers      = []          // todos los servidores (incluyendo mp4 para embed)
// links cargados: { [id_episodio]: { mp4: {id_link,url_video} | null, embed: { [id_servidor]: {id_link,url_video} } } }
let linksCache        = {}
let dirty             = false
let searchTimer       = null
let letrasCache       = {}   // { 'A': { grupo:'A', completada:false }, ... }
let animeCountByLetra = {}   // { 'A': 45, 'B': 12, ... }

// ─────────────────────────────────────────────────────
//  AUTENTICACIÓN
// ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Soporte tecla Enter en login
  document.getElementById('loginPassword').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin()
  })

  // Verificar sesión guardada
  const saved = sessionStorage.getItem('hl_session')
  if (saved) {
    try {
      currentSession = JSON.parse(saved)
      startApp()
    } catch {
      sessionStorage.removeItem('hl_session')
    }
  }
  // Si no hay sesión, la pantalla de login ya está visible en el HTML
})

async function doLogin() {
  const btn  = document.getElementById('loginBtn')
  const pwd  = document.getElementById('loginPassword').value
  const errEl = document.getElementById('loginError')
  const session = SESSIONS[pwd]

  if (!session) {
    errEl.style.display = 'flex'
    document.getElementById('loginPassword').value = ''
    document.getElementById('loginPassword').focus()
    setTimeout(() => { errEl.style.display = 'none' }, 3000)
    return
  }

  btn.disabled = true
  btn.textContent = 'Entrando...'
  currentSession = session
  sessionStorage.setItem('hl_session', JSON.stringify(session))
  await startApp()
}

function doLogout() {
  if (!confirm('\u00bfCerrar sesión?')) return
  sessionStorage.removeItem('hl_session')
  location.reload()
}

function togglePasswordVisibility() {
  const input = document.getElementById('loginPassword')
  input.type = input.type === 'password' ? 'text' : 'password'
}

function applySession() {
  // Ocultar login
  document.getElementById('loginScreen').style.display = 'none'

  // Fijar perfil según sesión
  currentProfile = currentSession.profile

  // Ocultar toggle (rol fijo por contraseña)
  const toggle = document.getElementById('profileToggle')
  if (toggle) toggle.style.display = 'none'

  // Etiqueta de perfil en buscador
  const lbl = document.getElementById('searchProfileLabel')
  if (lbl) lbl.textContent = currentProfile === 'experto' ? '🧠 Perfil Experto' : '📡 Perfil Redes'

  // Cola de trabajo solo para Redes
  const wq = document.getElementById('workQueue')
  if (wq) wq.style.display = currentProfile === 'redes' ? 'block' : 'none'

  // Indicador de usuario en header
  const ui = document.getElementById('userIndicator')
  if (ui) {
    ui.innerHTML = currentSession.group
      ? `👥 <strong>Grupo ${currentSession.group}</strong>`
      : '📡 Redes'
    ui.style.display = 'flex'
  }

  // Botón salir visible
  const lb = document.getElementById('logoutBtn')
  if (lb) lb.style.display = 'inline-flex'

  // Tarjeta de grupo en dashboard (solo Experto)
  const gc = document.getElementById('groupCard')
  if (gc) {
    if (currentSession.group) {
      gc.style.display = 'flex'
      document.getElementById('groupCardName').textContent =
        `Grupo ${currentSession.group}`
      document.getElementById('groupCardMembers').textContent =
        currentSession.members.join(' · ')
    } else {
      gc.style.display = 'none'
    }
  }

  updatePill()
}

// ─────────────────────────────────────────────────────
//  INICIO DE APP (después de autenticarse)
// ─────────────────────────────────────────────────────
async function startApp() {
  applySession()

  try {
    // Cargar servidores
    const { data: servs, error: sErr } = await db
      .from('servidores').select('*').order('id_servidor')
    if (sErr) throw sErr
    allServidores = servs || []
    mp4Server    = allServidores.find(s => s.nombre === 'MP4Upload') || null
    // mp4 aparece en la grilla de reproductores (embed) Y también tiene link de descarga
    embedServers  = allServidores  // todos los servidores, incluyendo mp4

    // Cargar géneros
    const { data: gens, error: gErr } = await db
      .from('generos').select('*').order('nombre')
    if (gErr) throw gErr
    allGeneros = gens || []

    await loadStats()
    await loadLetras()         // cargar asignaciones de letras
    setInterval(loadLetras, 45_000)  // sincronizar letras cada 45s
    if (currentProfile === 'redes') await loadColaRedes()
    setupSearch()

    // Aviso antes de cerrar si hay cambios pendientes
    window.addEventListener('beforeunload', e => {
      if (dirty) { e.preventDefault(); e.returnValue = '' }
    })

  } catch (err) {
    showToast('Error al iniciar: ' + err.message, 'error')
    console.error(err)
  }
}

// ─────────────────────────────────────────────────────
//  PERFIL
// ─────────────────────────────────────────────────────
function switchProfile(p) {
  currentProfile = p
  updatePill()

  const label = document.getElementById('searchProfileLabel')
  label.textContent = p === 'experto' ? '🧠 Perfil Experto' : '📡 Perfil Redes'

  const wq = document.getElementById('workQueue')
  wq.style.display = p === 'redes' ? 'block' : 'none'
  if (p === 'redes') loadColaRedes()

  // Re-render con datos ya cargados si hay un anime activo
  if (currentAnime) {
    if (p === 'experto') renderExperto()
    else renderRedes()
  }

  clearSearch()
}

function updatePill() {
  document.querySelectorAll('.toggle-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.p === currentProfile)
  )
  const pill      = document.getElementById('togglePill')
  const activeBtn = document.querySelector(`.toggle-btn[data-p="${currentProfile}"]`)
  if (pill && activeBtn) {
    pill.style.left  = activeBtn.offsetLeft + 'px'
    pill.style.width = activeBtn.offsetWidth + 'px'
  }
}

// Actualizar pill después de que el DOM esté listo y los fonts cargados
window.addEventListener('load', updatePill)

// ─────────────────────────────────────────────────────
//  BUSCADOR
// ─────────────────────────────────────────────────────
function setupSearch() {
  const input = document.getElementById('searchInput')
  const clear = document.getElementById('searchClear')

  input.addEventListener('input', e => {
    const q = e.target.value.trim()
    clear.style.display = q ? 'flex' : 'none'
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => runSearch(q), 300)
  })

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') clearSearch()
  })

  document.addEventListener('click', e => {
    if (!e.target.closest('.search-section')) closeDropdown()
  })
}

async function runSearch(q) {
  const dd = document.getElementById('searchDropdown')
  if (!q || q.length < 2) { closeDropdown(); return }

  dd.innerHTML = '<div class="loading"><div class="spinner"></div> Buscando...</div>'
  dd.classList.add('open')

  const { data, error } = await db
    .from('animes')
    .select('id_anime, titulo, url_portada')
    .ilike('titulo', `%${q}%`)
    .order('titulo')
    .limit(12)

  if (error) { dd.innerHTML = '<div class="dd-empty">Error al buscar</div>'; return }

  if (!data || data.length === 0) {
    const safeQ = escapeHtml(q)
    dd.innerHTML = `
      <div class="dd-empty">No se encontró "${safeQ}"</div>
      <button class="dd-create" onclick="openNewAnimeModal('${safeQ}')">➕ Crear nuevo anime: "${safeQ}"</button>
    `
    return
  }

  dd.innerHTML = data.map(a => `
    <div class="dd-item" onclick="selectAnime(${a.id_anime})">
      ${a.url_portada
        ? `<img class="dd-thumb" src="${a.url_portada}" alt="" onerror="this.style.display='none'">`
        : `<div class="dd-placeholder">🎌</div>`}
      <div class="dd-info">
        <div class="dd-title">${highlightMatch(escapeHtml(a.titulo), q)}</div>
        <div class="dd-sub">ID: ${a.id_anime}</div>
      </div>
    </div>
  `).join('')
}

function highlightMatch(html, q) {
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return html.replace(new RegExp(`(${esc})`, 'gi'), '<mark>$1</mark>')
}

function closeDropdown() {
  document.getElementById('searchDropdown').classList.remove('open')
}

function clearSearch() {
  document.getElementById('searchInput').value = ''
  document.getElementById('searchClear').style.display = 'none'
  closeDropdown()
  document.getElementById('formSection').style.display = 'none'
  currentAnime = null
  currentEpisodios = []
  linksCache = {}
  currentGeneroIds  = new Set()
  originalGeneroIds = new Set()
  dirty = false
  document.getElementById('unsavedBanner')?.remove()
}

// ─────────────────────────────────────────────────────
//  SELECCIONAR ANIME (carga todo)
// ─────────────────────────────────────────────────────
async function selectAnime(id) {
  closeDropdown()
  const input = document.getElementById('searchInput')
  input.value = 'Cargando...'
  input.disabled = true

  try {
    // 1. Anime
    const { data: anime, error: aErr } = await db
      .from('animes').select('*').eq('id_anime', id).single()
    if (aErr) throw aErr

    // 2. Episodios
    const { data: eps, error: eErr } = await db
      .from('episodios').select('*').eq('id_anime', id).order('numero')
    if (eErr) throw eErr

    // 3. Géneros del anime
    const { data: ag } = await db
      .from('anime_generos').select('id_genero').eq('id_anime', id)
    currentGeneroIds  = new Set((ag || []).map(x => x.id_genero))
    originalGeneroIds = new Set(currentGeneroIds)  // snapshot para revertir

    // 4. Links de video de todos los episodios
    linksCache = {}
    if (eps && eps.length > 0) {
      const epIds = eps.map(e => e.id_episodio)
      const { data: lv } = await db
        .from('links_videos').select('*').in('id_episodio', epIds)

      ;(lv || []).forEach(l => {
        if (!linksCache[l.id_episodio]) linksCache[l.id_episodio] = { mp4: null, embed: {}, descargas: {} }
        if (l.es_descarga) {
          linksCache[l.id_episodio].mp4 = l
        } else {
          linksCache[l.id_episodio].embed[l.id_servidor] = l
        }
      })
    }

    currentAnime = anime
    currentEpisodios = eps || []
    input.value = anime.titulo

    // Render según perfil
    if (currentProfile === 'experto') renderExperto()
    else renderRedes()

    document.getElementById('formSection').style.display = 'block'
    dirty = false

  } catch (err) {
    showToast('Error al cargar: ' + err.message, 'error')
    input.value = ''
    console.error(err)
  } finally {
    input.disabled = false
  }
}

// ─────────────────────────────────────────────────────
//  RENDER — PERFIL EXPERTO
// ─────────────────────────────────────────────────────
function renderExperto() {
  const section = document.getElementById('formSection')
  const epCount = currentEpisodios.length
  const poster  = imgPath(currentAnime.url_portada)

  section.innerHTML = `
    <div class="form-header">
      ${poster
        ? `<img class="anime-poster" src="${escapeAttr(poster)}" alt="${escapeAttr(currentAnime.titulo)}" onerror="this.style.display='none'">`
        : `<div class="anime-poster-ph">🎌</div>`}
      <div>
        <div class="anime-titulo">${escapeHtml(currentAnime.titulo)}</div>
        <div class="anime-meta">🧠 Experto · ${epCount} capítulo${epCount !== 1 ? 's' : ''} · ID ${currentAnime.id_anime}</div>
      </div>
    </div>

    <div class="form-body">
      <!-- GÉNEROS -->
      <div class="form-group">
        <label>🏷️ Géneros</label>
        <div class="genres-wrap" id="genresWrap">${buildGenreChips()}</div>
        <div class="genre-add-row">
          <select class="genre-select" id="genreSelect">
            <option value="">+ Agregar género...</option>
            ${allGeneros.filter(g => !currentGeneroIds.has(g.id_genero))
              .map(g => `<option value="${g.id_genero}">${escapeHtml(g.nombre)}</option>`).join('')}
          </select>
          <button class="btn-secondary" onclick="addGenre()" style="padding:10px 16px;font-size:13px">Agregar</button>
        </div>
      </div>

      <!-- CAPÍTULOS -->
      <div class="form-group">
        <label>📚 Capítulos</label>
        <div class="episodes-list" id="episodesList">
          ${epCount === 0
            ? buildEpBlockExperto(null, 1)
            : currentEpisodios.map(ep => buildEpBlockExperto(ep)).join('')}
        </div>
        <button class="add-ep-btn" onclick="addEpisodeExperto()">➕ Añadir Capítulo</button>
      </div>
    </div>

    <div class="form-actions">
      <button class="btn-secondary" onclick="clearSearch()">Cancelar</button>
      <button class="btn-primary" onclick="saveExperto()">💾 Guardar Cambios</button>
    </div>
  `

  // Abrir primer bloque automáticamente
  const first = section.querySelector('.ep-block')
  if (first) toggleEpisode(first)
}

function buildGenreChips() {
  if (currentGeneroIds.size === 0)
    return '<span class="no-genres">Sin géneros asignados</span>'
  return [...currentGeneroIds].map(gid => {
    const g = allGeneros.find(x => x.id_genero === gid)
    if (!g) return ''
    return `<span class="genre-chip">
      ${escapeHtml(g.nombre)}
      <span class="chip-x" onclick="removeGenre(${g.id_genero})" title="Quitar">✕</span>
    </span>`
  }).join('')
}

function buildEpBlockExperto(ep, forceNum = null) {
  const num   = ep ? ep.numero : forceNum
  const epId  = ep ? ep.id_episodio : `new_${Date.now()}_${Math.random().toString(36).slice(2,6)}`
  let preg  = ep ? (ep.pregunta_akinator || '') : ''
  const prefix = '¿El hentai que buscas tiene '
  const suffix = '?'
  if (preg.startsWith(prefix) && preg.endsWith(suffix)) {
    preg = preg.slice(prefix.length, -suffix.length).trim()
  }
  const cache = ep ? linksCache[ep.id_episodio] : null
  const mp4  = cache?.mp4?.url_video || ''
  const done  = ep && ep.estado_experto === 'completado'
  const partial = !done && (mp4 || preg)
  const canDel = num !== 1 || (currentEpisodios.length > 0)

  return `
    <div class="ep-block ${done ? 'ep-done' : partial ? 'ep-partial' : ''}"
         data-ep-id="${epId}" data-num="${num}">
      <div class="ep-header" onclick="toggleEpisode(this.parentElement)">
        <span class="ep-num">Cap. ${num}</span>
        <span class="ep-label">${ep?.titulo_episodio ? escapeHtml(ep.titulo_episodio) : `Capítulo ${num}`}</span>
        <span class="ep-status">${done ? '✅' : partial ? '🔶' : '⚪'}</span>
        ${canDel ? `<button class="ep-del" onclick="deleteEpisode(event, this.closest('.ep-block'))" title="Eliminar capítulo">🗑️</button>` : ''}
        <span class="ep-chevron">▼</span>
      </div>
      <div class="ep-body experto-grid">
        <div class="form-group">
          <label>🔗 Link MP4Upload</label>
          <input type="url" class="input mp4-in"
            value="${escapeAttr(mp4)}"
            placeholder="https://www.mp4upload.com/..."
            data-ep-id="${epId}"
            oninput="markDirty(); validateUrlInput(this)" />
        </div>
        <div class="form-group">
          <label>❓ Pregunta Akinator</label>
          <div class="input-preg-wrapper">
            <span class="preg-prefix">¿El hentai que buscas tiene</span>
            <input type="text" class="input preg-in"
              value="${escapeAttr(preg)}"
              placeholder="elfas masoquistas..."
              data-ep-id="${epId}"
              oninput="markDirty()" />
            <span class="preg-suffix">?</span>
          </div>
        </div>
      </div>
    </div>`
}

function toggleEpisode(block) {
  block.classList.toggle('ep-open')
}

function addGenre() {
  const sel = document.getElementById('genreSelect')
  const id  = parseInt(sel.value)
  if (!id) return
  currentGeneroIds.add(id)
  markDirty()
  refreshGenreUI()
}

function removeGenre(id) {
  currentGeneroIds.delete(id)
  markDirty()
  refreshGenreUI()
}

function refreshGenreUI() {
  document.getElementById('genresWrap').innerHTML = buildGenreChips()
  const sel = document.getElementById('genreSelect')
  if (!sel) return
  sel.innerHTML = `<option value="">+ Agregar género...</option>` +
    allGeneros.filter(g => !currentGeneroIds.has(g.id_genero))
      .map(g => `<option value="${g.id_genero}">${escapeHtml(g.nombre)}</option>`).join('')
  sel.value = ''
  renderUnsavedBanner()
}

// Banner de cambios no guardados en géneros
function renderUnsavedBanner() {
  const existing = document.getElementById('unsavedBanner')
  const hasChanges = !setsEqual(currentGeneroIds, originalGeneroIds)

  if (!hasChanges) {
    if (existing) existing.remove()
    return
  }
  if (existing) return  // ya existe, no duplicar

  const banner = document.createElement('div')
  banner.id = 'unsavedBanner'
  banner.style.cssText = [
    'display:flex', 'align-items:center', 'gap:12px',
    'padding:10px 16px',
    'background:rgba(245,158,11,.12)',
    'border:1px solid rgba(245,158,11,.35)',
    'border-radius:9px',
    'font-size:13px',
    'color:#fcd34d',
    'margin-top:4px'
  ].join(';')
  banner.innerHTML = `
    <span>⚠️ <strong>Cambios no guardados</strong> en géneros</span>
    <button onclick="revertirGeneros()" style="
      margin-left:auto;
      padding:5px 14px;
      background:rgba(245,158,11,.15);
      border:1px solid rgba(245,158,11,.4);
      border-radius:6px;
      color:#fcd34d;
      font-family:inherit;
      font-size:12px;
      font-weight:700;
      cursor:pointer;
    ">↩ Revertir cambios</button>
  `
  // Insertar después del genresWrap
  const wrap = document.getElementById('genresWrap')
  if (wrap) wrap.parentElement.insertBefore(banner, wrap.nextSibling)
}

function revertirGeneros() {
  currentGeneroIds = new Set(originalGeneroIds)
  markDirty()
  document.getElementById('unsavedBanner')?.remove()
  refreshGenreUI()
  showToast('Géneros revertidos al estado original', 'info')
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

function addEpisodeExperto() {
  const list   = document.getElementById('episodesList')
  const blocks = [...list.querySelectorAll('.ep-block')]
  const nums   = blocks.map(b => parseInt(b.dataset.num)).filter(n => !isNaN(n))
  const next   = nums.length > 0 ? Math.max(...nums) + 1 : 1
  const div    = document.createElement('div')
  div.innerHTML = buildEpBlockExperto(null, next)
  list.appendChild(div.firstElementChild)
  const newBlock = list.lastElementChild
  toggleEpisode(newBlock)
  newBlock.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  markDirty()
}

async function deleteEpisode(event, block) {
  event.stopPropagation()
  const epId = block.dataset.epId
  const num  = block.dataset.num
  if (!confirm(`¿Eliminar Capítulo ${num}? Esta acción es irreversible.`)) return

  if (!String(epId).startsWith('new_')) {
    const { error } = await db.from('episodios').delete().eq('id_episodio', epId)
    if (error) { showToast('Error al eliminar: ' + error.message, 'error'); return }
    currentEpisodios = currentEpisodios.filter(e => e.id_episodio != epId)
    delete linksCache[epId]
  }
  block.remove()
  showToast(`Capítulo ${num} eliminado`, 'info')
}

// ─────────────────────────────────────────────────────
//  GUARDAR — EXPERTO
// ─────────────────────────────────────────────────────
async function saveExperto(silent = false) {
  if (!currentAnime) return
  const btn = document.querySelector('.btn-primary[onclick="saveExperto()"]')
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...' }

  try {
    // ── 1. Géneros ──────────────────────────────────
    await db.from('anime_generos').delete().eq('id_anime', currentAnime.id_anime)
    if (currentGeneroIds.size > 0) {
      const rows = [...currentGeneroIds].map(gid => ({
        id_anime:  currentAnime.id_anime,
        id_genero: gid
      }))
      const { error } = await db.from('anime_generos').insert(rows)
      if (error) throw error
    }

    // ── 2. Episodios ─────────────────────────────────
    const blocks = document.querySelectorAll('#episodesList .ep-block')
    for (const block of blocks) {
      const rawId   = block.dataset.epId
      const num     = parseInt(block.dataset.num)
      const mp4In  = block.querySelector('.mp4-in')
      const pregIn  = block.querySelector('.preg-in')
      const mp4Url = mp4In?.value.trim() || ''
      let preg    = pregIn?.value.trim() || ''
      if (preg) {
        preg = `¿El hentai que buscas tiene ${preg}?`
      }

      // Validar URL si se ingresó
      if (mp4Url && !validateUrl(mp4Url)) {
        showToast(`URL de MP4Upload inválida en Cap. ${num}`, 'error')
        continue
      }

      const estadoExperto = (mp4Url && preg) ? 'completado' : 'pendiente'
      let episodioId

      if (String(rawId).startsWith('new_')) {
        // Verificar que no exista ya ese número
        const { data: exists } = await db.from('episodios')
          .select('id_episodio').eq('id_anime', currentAnime.id_anime).eq('numero', num).maybeSingle()
        if (exists) {
          episodioId = exists.id_episodio
          await db.from('episodios').update({ pregunta_akinator: preg || null, estado_experto: estadoExperto })
            .eq('id_episodio', episodioId)
        } else {
          const { data: newEp, error: nErr } = await db.from('episodios').insert({
            id_anime: currentAnime.id_anime,
            numero: num,
            pregunta_akinator: preg || null,
            estado_experto: estadoExperto,
            estado_links: 'pendiente'
          }).select('id_episodio').single()
          if (nErr) throw nErr
          episodioId = newEp.id_episodio
          block.dataset.epId = episodioId
        }
      } else {
        episodioId = parseInt(rawId)
        const { error: uErr } = await db.from('episodios').update({
          pregunta_akinator: preg || null,
          estado_experto:    estadoExperto
        }).eq('id_episodio', episodioId)
        if (uErr) throw uErr
      }

      // ── Link MP4Upload ──
      if (mp4Server && mp4Url) {
        if (!linksCache[episodioId]) linksCache[episodioId] = { mp4: null, embed: {}, descargas: {} }
        const existMp4 = linksCache[episodioId].mp4

        if (existMp4) {
          await db.from('links_videos').update({ url_video: mp4Url }).eq('id_link', existMp4.id_link)
          linksCache[episodioId].mp4.url_video = mp4Url
        } else {
          const { data: nl, error: nlErr } = await db.from('links_videos').insert({
            id_episodio: episodioId,
            id_servidor: mp4Server.id_servidor,
            url_video:   mp4Url,
            es_descarga: true,
            idioma:      'sub'
          }).select().single()
          if (nlErr) throw nlErr
          linksCache[episodioId].mp4 = nl
        }
      }

      // Actualizar indicador visual
      const statusEl = block.querySelector('.ep-status')
      if (statusEl) statusEl.textContent = estadoExperto === 'completado' ? '✅' : (mp4Url || preg ? '🔶' : '⚪')
      block.classList.toggle('ep-done', estadoExperto === 'completado')
      block.classList.toggle('ep-partial', estadoExperto !== 'completado' && !!(mp4Url || preg))
    }

    // Actualizar estado para la UI de géneros
    originalGeneroIds = new Set(currentGeneroIds)
    document.getElementById('unsavedBanner')?.remove()

    dirty = false
    if (!silent) {
      showToast('¡Guardado correctamente! 💾', 'success')
      await loadStats()
    }
  } catch (err) {
    showToast('Error al guardar: ' + err.message, 'error')
    console.error(err)
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar Cambios' }
  }
}

// ─────────────────────────────────────────────────────
//  RENDER — PERFIL REDES
// ─────────────────────────────────────────────────────
function renderRedes() {
  const section  = document.getElementById('formSection')
  const epCount  = currentEpisodios.length
  const poster   = imgPath(currentAnime.url_portada)

  section.innerHTML = `
    <div class="form-header">
      ${poster
        ? `<img class="anime-poster" src="${escapeAttr(poster)}" alt="${escapeAttr(currentAnime.titulo)}" onerror="this.style.display='none'">`
        : `<div class="anime-poster-ph">🎌</div>`}
      <div>
        <div class="anime-titulo">${escapeHtml(currentAnime.titulo)}</div>
        <div class="anime-meta">📡 Redes · ${epCount} capítulo${epCount !== 1 ? 's' : ''} · ID ${currentAnime.id_anime}</div>
      </div>
    </div>

    <div class="form-body">
      <div class="form-group">
        <label>📚 Capítulos</label>
        <div class="episodes-list" id="episodesList">
          ${epCount === 0
            ? `<div style="color:var(--text-dim);padding:20px;text-align:center">
                 El Experto aún no ha registrado capítulos para este anime.
               </div>`
            : currentEpisodios.map(ep => buildEpBlockRedes(ep)).join('')}
        </div>
      </div>
    </div>

    <div class="form-actions">
      <button class="btn-secondary" onclick="clearSearch()">Cancelar</button>
      <button class="btn-primary" onclick="saveRedes()">💾 Guardar Links</button>
    </div>
  `

  const first = section.querySelector('.ep-block')
  if (first) toggleEpisode(first)
}

function buildEpBlockRedes(ep) {
  const cache      = linksCache[ep.id_episodio] || { mp4: null, embed: {}, descargas: {} }
  const mp4Url    = cache.mp4?.url_video || ''
  const filled     = embedServers.filter(s => cache.embed[s.id_servidor]?.url_video).length
  const total      = embedServers.length
  const isComplete = filled === total && total > 0
  const isPartial  = filled > 0 && !isComplete
  const done       = ep.estado_experto === 'completado'

  return `
    <div class="ep-block ${isComplete ? 'ep-done' : isPartial ? 'ep-partial' : ''}"
         data-ep-id="${ep.id_episodio}" data-num="${ep.numero}">
      <div class="ep-header" onclick="toggleEpisode(this.parentElement)">
        <span class="ep-num">Cap. ${ep.numero}</span>
        <span class="ep-label">${ep.titulo_episodio ? escapeHtml(ep.titulo_episodio) : `Capítulo ${ep.numero}`}</span>
        <span class="ep-status" id="epStat_${ep.id_episodio}">
          ${isComplete ? '✅' : isPartial ? '⚠️' : '⚪'}
          <small>${filled}/${total}</small>
        </span>
        ${!done ? '<span style="font-size:10px;color:var(--text-dim);margin-left:4px">Experto pendiente</span>' : ''}
        <span class="ep-chevron">▼</span>
      </div>
      <div class="ep-body">
        <!-- mp4 LINK DE DESCARGA (readonly — lo pone el Experto) -->
        <div class="form-group">
          <label>⬇️ mp4 — Link de descarga <span style="color:var(--text-dim);font-weight:400;text-transform:none;font-size:10px">(provisto por el Experto)</span></label>
          <div class="mp4-display">
            ${mp4Url
              ? `<span class="mp4-url" title="${escapeAttr(mp4Url)}">${escapeHtml(mp4Url)}</span>
                 <div style="display:flex; gap:8px;">
     <button type="button" class="btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="copyFakeName(${ep.numero}, ${currentAnime.id_anime}, '${escapeAttr(ep.titulo_episodio || '')}')">📋 Copiar Nombre Falso</button>
     <a class="mp4-open" href="${escapeAttr(mp4Url)}" target="_blank" rel="noopener noreferrer">Descargar ↗</a>
   </div>`
              : `<span class="mp4-no-url">El Experto aún no ha subido el link de descarga de MP4Upload</span>`}
          </div>
        </div>

        <!-- REPRODUCTORES: todos los servidores (MP4Upload incluido como embed) -->
        <div class="form-group">
          <label>?? Reproductores (Embed) (<span id="epFilledCount_"></span>/ listos)</label>
          <div class="server-grid">
            ${embedServers.map(s => {
              const lv    = cache.embed[s.id_servidor]
              const val   = lv?.url_video || ''
              const isMp4 = mp4Server && s.id_servidor === mp4Server.id_servidor
              return \
                <div class="server-field">
                  <div class="server-label">
                    <span class="sdot \" id="dot_\_\"></span>
                    \`\
                  </div>
                  <input type="url" class="input"
                    value="\"
                    placeholder="\"
                    data-ep-id="\"
                    data-server-id="\"
                    data-server-name="\"
                    data-link-id="\"
                    oninput="markDirty(); onServerInput(this)"
                    onchange="validateUrlInput(this)" />
                </div>\
            }).join('')}
          </div>
        </div>

        <!-- LINKS DE DESCARGA (Auto-generados) -->
        <div class="form-group" style="margin-top: 16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <label style="margin:0;">?? Links de Descarga (Auto-generados)</label>
            <button class="btn-secondary" style="padding: 4px 8px; font-size:11px;" onclick="toggleManualDl(\)">?? Edici�n Manual</button>
          </div>
          <div class="server-grid dl-grid-\">
            ${embedServers.map(s => {
              const lv = cache.descargas[s.id_servidor]
              const val = lv?.url_video || ''
              
              return \
                <div class="server-field">
                  <div class="server-label">
                    <span class="sdot \" id="dot_dl_\_\"></span>
                    \
                  </div>
                  <input type="url" class="input dl-input-\"
                    value="\"
                    placeholder="Auto-generado"
                    data-ep-id="\"
                    data-server-id="\"
                    data-link-id="\"
                    oninput="markDirty(); onDlInput(this)"
                    onchange="validateUrlInput(this)"
                    readonly />
                </div>\
            }).join('')}
          </div>
        </div>
      </div>
    </div>\
}

function toggleManualDl(epId) {
  const inputs = document.querySelectorAll(\.dl-input-\\\);
  let isReadonly = false;
  inputs.forEach(input => {
    if(input.hasAttribute('readonly')) {
      input.removeAttribute('readonly');
      isReadonly = true;
    } else {
      input.setAttribute('readonly', 'true');
    }
  });
  showToast(isReadonly ? 'Edici�n manual activada' : 'Modo auto-generado activado', 'info');
}

function onDlInput(input) {
  const epId = input.dataset.epId;
  const servId = input.dataset.serverId;
  const val = input.value.trim();
  const dot = document.getElementById(\dot_dl_\\\_\\\);
  if (dot) dot.classList.toggle('filled', !!val);
}

function onServerInput(input) {
  const epId   = input.dataset.epId
  const servId = input.dataset.serverId
  const sName  = input.dataset.serverName || ''
  const val    = input.value.trim()
  const filled = !!val

  // Actualizar dot
  const dot = document.getElementById(`dot_${epId}_${servId}`)
  if (dot) dot.classList.toggle('filled', filled)

  // AUTO-FILL DOWNLOAD LINK
  const dlInput = document.querySelector(`.dl-input-${epId}[data-server-id="${servId}"]`)
  if (dlInput && dlInput.hasAttribute('readonly')) {
    const derived = deriveDownloadLink(sName, val)
    dlInput.value = derived
    onDlInput(dlInput)
  }

  // Actualizar estado del bloque
  const block  = input.closest('.ep-block')
  if (!block) return
  const inputs = [...block.querySelectorAll('input[data-server-id]')]
  const nFilled = inputs.filter(i => i.value.trim()).length
  const nTotal  = embedServers.length
  const statEl  = document.getElementById(`epStat_${epId}`)
  
  const epFilledCount = document.getElementById(`epFilledCount_${epId}`)
  if (epFilledCount) epFilledCount.textContent = nFilled

  if (statEl) {
    statEl.innerHTML = nFilled === nTotal
      ? `✅ <small>${nFilled}/${nTotal}</small>`
      : nFilled > 0
        ? `⚠️ <small>${nFilled}/${nTotal}</small>`
        : `⚪ <small>0/${nTotal}</small>`
  }

  block.classList.toggle('ep-done',    nFilled === nTotal && nTotal > 0)
  block.classList.toggle('ep-partial', nFilled > 0 && nFilled < nTotal)
}

// ─────────────────────────────────────────────────────
//  GUARDAR — REDES
// ─────────────────────────────────────────────────────
async function saveRedes(silent = false) {
  if (!currentAnime) return
  const btn = document.querySelector('.btn-primary[onclick="saveRedes()"]')
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...' }

  try {
    const blocks = document.querySelectorAll('#episodesList .ep-block')

    for (const block of blocks) {
      const epId   = parseInt(block.dataset.epId)
      const num    = block.dataset.num
      const inputs = [...block.querySelectorAll('input[data-server-id]')]
      let allFilled = true

      for (const input of inputs) {
        const url    = input.value.trim()
        const servId = parseInt(input.dataset.serverId)
        const isDescarga = input.className.includes('dl-input')
        const linkId = input.dataset.linkId ? parseInt(input.dataset.linkId) : null

        if (url && !validateUrl(url)) {
          showToast(`URL inválida en Cap. ${num} — ${allServidores.find(s=>s.id_servidor===servId)?.nombre}`, 'error')
          if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar Links' }
          return
        }

        if (!url) { allFilled = false; continue }

        if (linkId) {
          const { error } = await db.from('links_videos').update({ url_video: url }).eq('id_link', linkId)
          if (error) throw error
        } else {
          const { data: nl, error } = await db.from('links_videos').insert({
            id_episodio: epId,
            id_servidor: servId,
            url_video:   url,
            es_descarga: isDescarga,
            idioma:      'sub'
          }).select().single()
          if (error) throw error
          input.dataset.linkId = nl.id_link
          if (!linksCache[epId])        linksCache[epId] = { mp4: linksCache[epId]?.mp4 || null, embed: {}, descargas: {} }
          if (!linksCache[epId].embed) linksCache[epId].embed = {}
          if (!linksCache[epId].descargas) linksCache[epId].descargas = {}
          if (isDescarga) {
            linksCache[epId].descargas[servId] = nl
          } else {
            linksCache[epId].embed[servId] = nl
          }
        }
      }

      // Actualizar estado_links del episodio
      const estadoLinks = allFilled ? 'completado' : 'pendiente'
      await db.from('episodios').update({ estado_links: estadoLinks }).eq('id_episodio', epId)
    }

    dirty = false
    if (!silent) {
      showToast('¡Links guardados! ✅', 'success')
      await loadStats()
      await loadColaRedes()
    }
  } catch (err) {
    showToast('Error al guardar: ' + err.message, 'error')
    console.error(err)
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Guardar Links' }
  }
}

// ─────────────────────────────────────────────────────
//  COLA DE TRABAJO (Redes)
// ─────────────────────────────────────────────────────
async function loadColaRedes() {
  const listEl  = document.getElementById('queueList')
  const badgeEl = document.getElementById('queueBadge')
  if (!listEl) return

  listEl.innerHTML = '<div class="loading"><div class="spinner"></div></div>'

  // Episodios que el experto completó pero Redes no
  const { data, error } = await db
    .from('episodios')
    .select('id_episodio, numero, id_anime, animes(id_anime, titulo, url_portada)')
    .eq('estado_experto', 'completado')
    .eq('estado_links',   'pendiente')
    .order('id_anime')
    .limit(200)

  if (error) {
    listEl.innerHTML = '<div style="color:var(--error);padding:12px;font-size:13px">Error al cargar cola</div>'
    return
  }

  // Agrupar por anime
  const byAnime = {}
  ;(data || []).forEach(ep => {
    const a = ep.animes
    if (!byAnime[a.id_anime]) byAnime[a.id_anime] = { anime: a, count: 0 }
    byAnime[a.id_anime].count++
  })

  const items = Object.values(byAnime)
  badgeEl.textContent = items.length

  if (items.length === 0) {
    listEl.innerHTML = '<div class="queue-empty">🎉 ¡Cola vacía! Todo al día.</div>'
    return
  }

  listEl.innerHTML = items.map(({ anime, count }) => `
    <div class="queue-item" onclick="selectAnime(${anime.id_anime})">
      ${anime.url_portada
        ? `<img class="queue-thumb" src="${anime.url_portada}" alt="" onerror="this.style.display='none'">`
        : `<div style="width:30px;text-align:center;font-size:18px">🎌</div>`}
      <div class="queue-info">
        <div class="queue-title">${escapeHtml(anime.titulo)}</div>
        <div class="queue-sub">${count} cap${count > 1 ? 's' : ''}. pendiente${count > 1 ? 's' : ''}</div>
      </div>
      <span class="queue-arrow">→</span>
    </div>
  `).join('')
}

// ─────────────────────────────────────────────────────
//  LETRAS DEL CATÁLOGO
// ─────────────────────────────────────────────────────
async function loadLetras() {
  // 1. Cargar asignaciones de la BD
  const { data: asigs } = await db.from('asignaciones_letras').select('*')
  letrasCache = {}
  ;(asigs || []).forEach(r => {
    letrasCache[r.letra.toUpperCase()] = { grupo: r.grupo, completada: r.completada }
  })

  // 2. Contar animes por letra (una sola query)
  const { data: titulosData } = await db.from('animes').select('titulo')
  animeCountByLetra = {}
  ;(titulosData || []).forEach(a => {
    const first = (a.titulo || '')[0]?.toUpperCase()
    const key = first && /[A-Z]/.test(first) ? first : '#'
    animeCountByLetra[key] = (animeCountByLetra[key] || 0) + 1
  })

  renderLetrasGrid()
}

async function claimLetra(letra) {
  if (!currentSession?.group) return   // Redes no puede reclamar
  const myGroup = currentSession.group
  const existing = letrasCache[letra]

  // Letra completada → no se puede tocar
  if (existing?.completada) return

  // De otro grupo → bloqueada
  if (existing?.grupo && existing.grupo !== myGroup) return

  if (existing?.grupo === myGroup) {
    // Liberar mi letra
    const { error } = await db.from('asignaciones_letras').delete().eq('letra', letra)
    if (error) { showToast('Error al liberar: ' + error.message, 'error'); return }
    delete letrasCache[letra]
    showToast(`Letra "${letra}" liberada`, 'info')
  } else {
    // Reclamar
    const { error } = await db.from('asignaciones_letras')
      .upsert({ letra, grupo: myGroup, completada: false })
    if (error) { showToast('Error al reclamar: ' + error.message, 'error'); return }
    letrasCache[letra] = { grupo: myGroup, completada: false }
    showToast(`Letra "${letra}" asignada al Grupo ${myGroup} ✅`, 'success')
  }
  renderLetrasGrid()
}

async function checkCompletadas() {
  const toCheck = Object.entries(letrasCache)
    .filter(([, info]) => info.grupo && !info.completada)
    .map(([l]) => l)

  if (toCheck.length === 0) { showToast('No hay letras para verificar', 'info'); return }

  showToast('Verificando letras...', 'info')

  // Obtener todos los animes con sus ids y primeras letras
  const { data: allAnimes } = await db.from('animes').select('id_anime, titulo')
  const animesByLetra = {}
  ;(allAnimes || []).forEach(a => {
    const first = (a.titulo || '')[0]?.toUpperCase()
    const key = first && /[A-Z]/.test(first) ? first : '#'
    if (!animesByLetra[key]) animesByLetra[key] = []
    animesByLetra[key].push(a.id_anime)
  })

  let newDone = 0
  for (const letra of toCheck) {
    const ids = animesByLetra[letra] || []
    if (ids.length === 0) continue

    const [{ count: total }, { count: done }] = await Promise.all([
      db.from('episodios').select('*', { count: 'exact', head: true }).in('id_anime', ids),
      db.from('episodios').select('*', { count: 'exact', head: true })
        .in('id_anime', ids).eq('estado_experto', 'completado').eq('estado_links', 'completado')
    ])

    if (total && total > 0 && done === total) {
      await db.from('asignaciones_letras').update({ completada: true }).eq('letra', letra)
      letrasCache[letra].completada = true
      newDone++
    }
  }

  showToast(
    newDone > 0 ? `¡${newDone} letra${newDone > 1 ? 's' : ''} completada${newDone > 1 ? 's' : ''}! 🎉` : 'Ninguna completada aún',
    newDone > 0 ? 'success' : 'info'
  )
  renderLetrasGrid()
}

function renderLetrasGrid() {
  const gridEl    = document.getElementById('letrasGrid')
  const summaryEl = document.getElementById('letrasSummary')
  if (!gridEl) return

  const myGroup = currentSession?.group

  // ── Resumen por grupo ──
  if (summaryEl) {
    const byGroup = { A: [], B: [], C: [] }
    Object.entries(letrasCache).forEach(([l, info]) => {
      if (info.grupo && byGroup[info.grupo]) byGroup[info.grupo].push(l)
    })
    summaryEl.innerHTML = ['A', 'B', 'C'].map(g => {
      const c = GRUPO_COLORS[g]
      const letters = byGroup[g].sort().join(' · ') || '—'
      return `
        <div class="grupo-row" style="border-color:${c.border}">
          <span class="grupo-tag-sm" style="background:${c.bg};color:${c.text}">Grupo ${g}</span>
          <span class="grupo-letras-sm">${letters}</span>
        </div>`
    }).join('')
  }

  // ── Grid de letras ──
  gridEl.innerHTML = LETRAS.map(letra => {
    const info        = letrasCache[letra]
    const completed   = info?.completada
    const claimedBy   = info?.grupo
    const isMine      = claimedBy === myGroup
    const isOthers    = claimedBy && claimedBy !== myGroup
    const canClick    = !completed && !isOthers && !!myGroup
    const c           = claimedBy ? GRUPO_COLORS[claimedBy] : null
    const count       = animeCountByLetra[letra] || 0

    let bgStyle = ''
    if (completed)   bgStyle = 'background:rgba(16,185,129,.18);border-color:rgba(16,185,129,.5);color:#10B981'
    else if (c)      bgStyle = `background:${c.bg};border-color:${c.border};color:${c.text}`

    const tooltip = completed
      ? `${letra} — ✅ Completada (${count} animes)`
      : claimedBy
        ? `${letra} — Grupo ${claimedBy} · ${count} animes${isMine ? ' (clic para liberar)' : ''}`
        : `${letra} — ${count} animes · Clic para reclamar`

    return `
      <div class="letra-cell ${completed ? 'lc-done' : isMine ? 'lc-mine' : isOthers ? 'lc-others' : 'lc-free'}"
           style="${bgStyle}"
           onclick="${canClick ? `claimLetra('${letra}')` : ''}"
           title="${tooltip}">
        <span class="letra-char">${completed ? '✓' : letra}</span>
        ${claimedBy && !completed ? `<span class="letra-badge">${claimedBy}</span>` : ''}
        ${count > 0 ? `<span class="letra-count">${count}</span>` : ''}
      </div>`
  }).join('')
}

// ─────────────────────────────────────────────────────
//  STATS / DASHBOARD
// ─────────────────────────────────────────────────────
async function loadStats() {
  try {
    const [
      { count: totalAnimes },
      { count: pendExperto },
      { count: pendRedes   },
      { count: epsDone     }
    ] = await Promise.all([
      db.from('animes')  .select('*', { count: 'exact', head: true }),
      db.from('episodios').select('*', { count: 'exact', head: true }).eq('estado_experto', 'pendiente'),
      db.from('episodios').select('*', { count: 'exact', head: true }).eq('estado_experto', 'completado').eq('estado_links', 'pendiente'),
      db.from('episodios').select('*', { count: 'exact', head: true }).eq('estado_experto', 'completado').eq('estado_links', 'completado')
    ])

    // Contar animes con al menos un episodio 100% completo (experto + redes)
    const { data: doneEpData } = await db
      .from('episodios')
      .select('id_anime')
      .eq('estado_experto', 'completado')
      .eq('estado_links', 'completado')
    const doneAnimes = new Set((doneEpData || []).map(e => e.id_anime)).size
    const pct = Math.round((doneAnimes / 1000) * 100)

    // Dashboard
    setText('dashTotal',   totalAnimes  || 0)
    setText('dashDone',    epsDone      || 0)
    setText('dashPendExp', pendExperto  || 0)
    setText('dashPendRed', pendRedes    || 0)
    document.getElementById('progressBar').style.width = pct + '%'
    setText('progressPct', pct + '%')
    setText('progressSub', `${doneAnimes.toLocaleString()} / 1,000 animes completados`)

    // Header
    setText('hStatDone',    epsDone     || 0)
    setText('hStatPendExp', pendExperto || 0)
    setText('hStatPendRed', pendRedes   || 0)

  } catch (err) {
    console.error('Stats error:', err)
  }
}

// ─────────────────────────────────────────────────────
//  MODAL — NUEVO ANIME
// ─────────────────────────────────────────────────────
function openNewAnimeModal(prefill = '') {
  document.getElementById('newAnimeTitulo').value = prefill
  document.getElementById('newAnimeSlug').value   = slugify(prefill)
  document.getElementById('newAnimePortada').value = ''
  document.getElementById('modalOverlay').style.display = 'flex'
}

function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none'
}

function handleModalClick(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal()
}

function syncSlug() {
  const titulo = document.getElementById('newAnimeTitulo').value
  document.getElementById('newAnimeSlug').value = slugify(titulo)
}

async function createAnime() {
  const titulo  = document.getElementById('newAnimeTitulo').value.trim()
  const slug    = document.getElementById('newAnimeSlug').value.trim()
  const portada = document.getElementById('newAnimePortada').value.trim()

  if (!titulo) { showToast('El título es obligatorio', 'error'); return }
  if (!slug)   { showToast('El slug es obligatorio', 'error'); return }

  const { data, error } = await db.from('animes').insert({
    titulo,
    slug,
    url_portada: portada || null
  }).select('id_anime').single()

  if (error) { showToast('Error: ' + error.message, 'error'); return }

  closeModal()
  closeDropdown()
  showToast(`Anime "${titulo}" creado ✅`, 'success')
  await selectAnime(data.id_anime)
  await loadStats()
}

// ─────────────────────────────────────────────────────
//  AUTO-SAVE
// ─────────────────────────────────────────────────────
async function autoSave() {
  if (!dirty || !currentAnime) return
  if (currentProfile === 'experto') await saveExperto(true)
  else await saveRedes(true)
  showToast('Auto-guardado ✅', 'info')
}

// ─────────────────────────────────────────────────────
//  UTILIDADES
// ─────────────────────────────────────────────────────
function deriveDownloadLink(serverName, embedUrl) {
  if (!embedUrl) return '';
  const url = embedUrl.trim();
  const name = (serverName || '').toLowerCase();
  
  if (name.includes('mp4upload')) {
    const match = url.match(/\/embed-([^.]+)\.html/);
    if (match) return https://www.mp4upload.com/ + match[1];
  }
  else if (name.includes('mega')) {
    return url.replace('/embed/', '/file/');
  }
  else if (name.includes('yourupload')) {
    return url.replace('/embed/', '/watch/');
  }
  else if (name.includes('voe')) {
    const match = url.match(/\/e\/([^\/]+)$/);
    if (match) return url.replace(/e/ + match[1], / + match[1]);
  }
  else if (name.includes('vidhide')) {
    return url.replace('/embed/', '/v/');
  }
  else if (name.includes('netu')) {
    const match = url.match(/vid=([^&]+)/) || url.match(/v=([^&]+)/);
    if (match) {
      try {
        const urlObj = new URL(url);
        return urlObj.origin + '/watch_video.php?v=' + match[1];
      } catch (e) {}
    }
  }
  
  return url;
}
function validateUrl(url) {
  return /^https?:\/\/.+/.test(url)
}

function validateUrlInput(input) {
  const v = input.value.trim()
  input.classList.remove('valid', 'invalid')
  if (v) input.classList.add(validateUrl(v) ? 'valid' : 'invalid')
}

function markDirty() { dirty = true }

function showToast(msg, type = 'success') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' }
  const t = document.createElement('div')
  t.className = `toast ${type}`
  t.innerHTML = `<span>${icons[type] || '📢'}</span><span>${msg}</span>`
  document.getElementById('toastContainer').appendChild(t)
  setTimeout(() => {
    t.style.animation = 'toastOut .3s forwards'
    setTimeout(() => t.remove(), 310)
  }, 3500)
}

function slugify(text) {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim()
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function escapeAttr(s) {
  return String(s ?? '').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}

function setText(id, val) {
  const el = document.getElementById(id)
  if (el) el.textContent = val
}









