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
  // ── EXPERTOS ────────────────────────────────────────
  'hideki123':       { profile: 'experto', group: 'A', userName: 'Hideki' },
  'jeanfranco123':   { profile: 'experto', group: 'A', userName: 'Jean Franco' },
  'osorio123':       { profile: 'experto', group: 'B', userName: 'Osorio' },
  'ortiz123':        { profile: 'experto', group: 'B', userName: 'Ortiz' },
  'kish123':         { profile: 'experto', group: 'C', userName: 'Kish' },
  // ── REDES (individuales) ────────────────────────────
  'osorior123':      { profile: 'redes', group: 'A', userName: 'Osorio' },
  'jeanfrancor123':  { profile: 'redes', group: 'B', userName: 'Jean Franco' },
  'kishr123':        { profile: 'redes', group: 'C', userName: 'Kish' },
  'maurizio123':     { profile: 'redes', group: 'D', userName: 'Maurizio' },
}

const LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const GRUPO_COLORS = {
  'A': { bg: 'rgba(124,58,237,.22)', border: 'rgba(124,58,237,.55)', text: '#a66ef5' },
  'B': { bg: 'rgba(236,72,153,.22)', border: 'rgba(236,72,153,.55)', text: '#f472b6' },
  'C': { bg: 'rgba(14,165,233,.22)',  border: 'rgba(14,165,233,.55)',  text: '#38bdf8' },
  'D': { bg: 'rgba(16,185,129,.22)',  border: 'rgba(16,185,129,.55)',  text: '#34d399' }
}
const GRUPO_MEMBERS = {
  'experto': { 'A': ['Hideki', 'Jean Franco'], 'B': ['Osorio', 'Ortiz'], 'C': ['Kish'] },
  'redes':   { 'A': ['Osorio'], 'B': ['Jean Franco'], 'C': ['Kish'], 'D': ['Maurizio'] }
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
let currentEstudioIds = new Set()   // ids de estudios del anime activo
let originalEstudioIds= new Set()   // ids de estudios originales
let allGeneros        = []          // todos los géneros disponibles
let allStudios        = []          // todos los estudios disponibles
let originalAnimeAno  = null        // año original antes de editar
let allServidores     = []          // todos los servidores de BD
let mp4Server        = null        // { id_servidor, nombre: 'MP4Upload' }
let embedServers      = []          // todos los servidores (incluyendo mp4 para embed)
// links cargados: { [id_episodio]: { mp4: {id_link,url_video} | null, embed: { [id_servidor]: {id_link,url_video} } } }
let linksCache        = {}
let dirty             = false
let searchTimer       = null
let letrasCache       = {}   // { 'A': { grupo:'A', completada:false }, ... }
let letrasRedesCache  = {}   // Letras del equipo de Redes (tabla separada)
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

  // Cola de trabajo deshabilitada (Redes trabaja independiente con letras)
  const wq = document.getElementById('workQueue')
  if (wq) wq.style.display = 'none'

  // Indicador de usuario en header
  const ui = document.getElementById('userIndicator')
  if (ui) {
    const name = currentSession.userName || ''
    if (currentProfile === 'experto') {
      ui.innerHTML = `🧠 <strong>Grupo ${currentSession.group}</strong> — ${name}`
    } else {
      ui.innerHTML = `📡 <strong>Redes ${currentSession.group}</strong> — ${name}`
    }
    ui.style.display = 'flex'
  }

  // Botón salir visible
  const lb = document.getElementById('logoutBtn')
  if (lb) lb.style.display = 'inline-flex'

  // Tarjeta de grupo en dashboard
  const gc = document.getElementById('groupCard')
  if (gc) {
    if (currentSession.group) {
      gc.style.display = 'flex'
      document.getElementById('groupCardName').textContent =
        currentProfile === 'experto'
          ? `Grupo ${currentSession.group}`
          : `Redes ${currentSession.group}`
      document.getElementById('groupCardMembers').textContent =
        (GRUPO_MEMBERS[currentProfile]?.[currentSession.group] || [currentSession.userName]).join(' · ')
    } else {
      gc.style.display = 'none'
    }
  }

  // Configurar sección de letras según perfil
  const letrasTitle = document.getElementById('letrasSectionTitle')
  const letrasSyncBtn = document.getElementById('letrasSyncBtn')
  const letrasCheckBtn = document.getElementById('letrasCheckBtn')
  if (currentProfile === 'redes') {
    if (letrasTitle) letrasTitle.textContent = '📡 Letras de Redes'
    if (letrasSyncBtn) letrasSyncBtn.setAttribute('onclick', 'loadLetrasRedes()')
    if (letrasCheckBtn) letrasCheckBtn.setAttribute('onclick', 'checkCompletadasRedes()')
  } else {
    if (letrasTitle) letrasTitle.textContent = '🗂️ Letras del Catálogo'
    if (letrasSyncBtn) letrasSyncBtn.setAttribute('onclick', 'loadLetras()')
    if (letrasCheckBtn) letrasCheckBtn.setAttribute('onclick', 'checkCompletadas()')
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

    // Cargar estudios
    const { data: stds, error: stErr } = await db.from('estudios').select('*').order('nombre')
    if (stErr) throw stErr
    allStudios = stds || []

    await loadStats()
    if (currentProfile === 'redes') {
      await loadLetrasRedes()            // cargar letras de Redes
      setInterval(loadLetrasRedes, 45_000)
    } else {
      await loadLetras()                 // cargar letras de Experto
      setInterval(loadLetras, 45_000)
    }
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
  currentEstudioIds = new Set()
  originalEstudioIds= new Set()
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
    
    // 3.5 Estudios del anime
    const { data: ae } = await db
      .from('anime_estudios').select('id_estudio').eq('id_anime', id)
    currentEstudioIds = new Set((ae || []).map(x => x.id_estudio))
    originalEstudioIds = new Set(currentEstudioIds)

    originalAnimeAno = anime['año']

    // 4. Links de video de todos los episodios
    linksCache = {}
    if (eps && eps.length > 0) {
      const epIds = eps.map(e => e.id_episodio)
      const { data: lv } = await db
        .from('links_videos').select('*').in('id_episodio', epIds)

      ;(lv || []).forEach(l => {
        if (!linksCache[l.id_episodio]) linksCache[l.id_episodio] = { hls: null, mp4_sub: null, mp4_eng: null }
        if (l.id_servidor === 14) {
          linksCache[l.id_episodio].hls = l
        } else if (l.id_servidor === 13) {
          if (l.idioma === 'eng') linksCache[l.id_episodio].mp4_eng = l
          else linksCache[l.id_episodio].mp4_sub = l
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

      <!-- AÑO Y ESTUDIO -->
      <div id="animeDetailsRow" style="display:flex; gap:16px; margin-bottom:24px;">
        <div class="form-group" style="flex:1; margin-bottom:0;">
          <label>📅 Año</label>
          <input type="number" class="input" id="animeAno" value="${currentAnime['año'] || ''}" placeholder="Ej. 2024" oninput="markDirty(); renderUnsavedBanner()" />
        </div>
        <div class="form-group" style="flex:1; margin-bottom:0;">
          <label>🏢 Estudio</label>
          <div class="genres-wrap" id="studioWrap" style="margin-bottom:6px;">${buildStudioChip()}</div>
          <div class="genre-add-row" id="studioAddRow" style="display:flex;">
              <select class="genre-select" id="studioSelect">
                <option value="">+ Seleccionar estudio...</option>
                ${allStudios.filter(s => !currentEstudioIds.has(s.id_estudio))
                  .map(s => `<option value="${s.id_estudio}">${escapeHtml(s.nombre)}</option>`).join('')}
              </select>
            <button class="btn-secondary" onclick="addStudio()" style="padding:10px 16px;font-size:13px">Agregar</button>
            <button class="btn-secondary" onclick="createNewStudio()" style="padding:10px 14px;font-size:13px;background:rgba(236,72,153,.15);border-color:rgba(236,72,153,.3);color:#ec4899;" title="Crear nuevo estudio">➕ Nuevo</button>
          </div>
        </div>
      </div>

      <!-- PREGUNTA AKINATOR Y CONTEXTO (GENERAL ANIME) -->
      <div class="form-group">
        <label>❓ Pregunta Akinator (General del Anime)</label>
        <div class="input-preg-wrapper" style="margin-bottom:12px;">
          <span class="preg-prefix">¿El hentai que buscas</span>
          <input type="text" class="input" id="animePregunta" value="${escapeAttr(currentAnime.pregunta_akinator || '')}" placeholder="trata sobre elfas..." oninput="markDirty(); renderUnsavedBanner()" />
          <span class="preg-suffix">?</span>
        </div>
        
        <label style="margin-top:12px;display:block;font-weight:600;color:var(--text-dim);font-size:12px;">🤖 Contexto IA (Resumen Global)</label>
        <textarea class="input" id="animeContextoIA" rows="3" placeholder="Resumen corto pero específico del hentai completo..." oninput="markDirty(); renderUnsavedBanner()" style="margin-bottom:24px;resize:vertical;">${escapeHtml(currentAnime.contexto_ia || '')}</textarea>
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

function buildStudioChip() {
  if (currentEstudioIds.size === 0) return '<span class="no-genres">Sin estudio asignado</span>'
  return [...currentEstudioIds].map(eid => {
    const st = allStudios.find(x => x.id_estudio === eid)
    if (!st) return ''
    return `<span class="genre-chip">
      ${escapeHtml(st.nombre)}
      <span class="chip-x" onclick="removeStudio(${eid})" title="Quitar">✕</span>
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
  const done  = ep && ep.estado_experto === 'completado'
  const partial = !done && (preg)
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
      <div class="ep-body experto-grid" style="grid-template-columns: 1fr;">
        <div class="form-group" style="margin-bottom:0;">
          <label>❓ Pregunta Akinator (Específica del Capítulo)</label>
          <div class="input-preg-wrapper" style="margin-bottom:12px;">
            <span class="preg-prefix">¿El hentai que buscas tiene</span>
            <input type="text" class="input preg-in"
              value="${escapeAttr(preg)}"
              placeholder="elfas masoquistas..."
              data-ep-id="${epId}"
              oninput="markDirty()" />
            <span class="preg-suffix">?</span>
          </div>
          
          <label style="display:block;font-weight:600;color:var(--text-dim);font-size:12px;">🤖 Contexto IA (Resumen del Capítulo)</label>
          <textarea class="input contexto-ia-in" rows="2" placeholder="Resumen de los eventos clave de este capítulo..." oninput="markDirty()" style="resize:vertical;">${escapeHtml(ep ? (ep.contexto_ia || '') : '')}</textarea>
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

function addStudio() {
  const sel = document.getElementById('studioSelect')
  const val = parseInt(sel.value)
  if (!val) return
  currentEstudioIds.add(val)
  markDirty()
  refreshStudioUI()
}

function removeStudio(id) {
  currentEstudioIds.delete(id)
  markDirty()
  refreshStudioUI()
}

function refreshStudioUI() {
  document.getElementById('studioWrap').innerHTML = buildStudioChip()
  const addRow = document.getElementById('studioAddRow')
  if (addRow) {
    addRow.style.display = 'flex'
  }
  const sel = document.getElementById('studioSelect')
  if (sel) {
    sel.innerHTML = `<option value="">+ Seleccionar estudio...</option>` +
      allStudios.filter(s => !currentEstudioIds.has(s.id_estudio))
        .map(s => `<option value="${s.id_estudio}">${escapeHtml(s.nombre)}</option>`).join('')
    sel.value = ''
  }
  renderUnsavedBanner()
}

async function createNewStudio() {
  const nombre = prompt('Ingresa el nombre del nuevo estudio:')
  if (!nombre || !nombre.trim()) return

  const cleanName = nombre.trim()
  const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  
  const maxId = allStudios.reduce((max, s) => Math.max(max, parseInt(s.id_estudio) || 0), 204)
  const nextId = maxId + 1

  const { data, error } = await db.from('estudios').insert([{ id_estudio: nextId, nombre: cleanName, slug }]).select()
  if (error) {
    showToast('Error al crear estudio: ' + error.message, 'error')
    return
  }
  
  if (data && data.length > 0) {
    const newStudio = data[0]
    allStudios.push(newStudio)
    allStudios.sort((a,b) => a.nombre.localeCompare(b.nombre))
    
    currentEstudioIds.add(newStudio.id_estudio)
    markDirty()
    refreshStudioUI()
    showToast(`Estudio "${newStudio.nombre}" creado y asignado. ¡Recuerda Guardar Cambios!`, 'success')
  }
}

// Banner de cambios no guardados en géneros y detalles
function renderUnsavedBanner() {
  const existing = document.getElementById('unsavedBanner')
  
  const anoInput = document.getElementById('animeAno')
  
  const currentAno = anoInput && anoInput.value ? parseInt(anoInput.value) : null
  const hasChanges = !setsEqual(currentGeneroIds, originalGeneroIds) ||
                     !setsEqual(currentEstudioIds, originalEstudioIds) ||
                     originalAnimeAno !== currentAno

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
    'margin-bottom:24px'
  ].join(';')
  banner.innerHTML = `
    <span>⚠️ <strong>Cambios no guardados</strong> en detalles o géneros</span>
    <button onclick="revertirDetalles()" style="
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
  // Insertar después de animeDetailsRow
  const row = document.getElementById('animeDetailsRow')
  if (row) row.parentElement.insertBefore(banner, row.nextSibling)
}

function revertirDetalles() {
  currentGeneroIds = new Set(originalGeneroIds)
  currentEstudioIds = new Set(originalEstudioIds)
  const anoInput = document.getElementById('animeAno')
  if (anoInput) anoInput.value = originalAnimeAno || ''
  const pregInput = document.getElementById('animePregunta')
  if (pregInput) pregInput.value = currentAnime.pregunta_akinator || ''
  
  markDirty()
  document.getElementById('unsavedBanner')?.remove()
  refreshGenreUI()
  refreshStudioUI()
  showToast('Cambios revertidos al estado original', 'info')
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

    // ── 1.2. Estudios ────────────────────────────────
    await db.from('anime_estudios').delete().eq('id_anime', currentAnime.id_anime)
    if (currentEstudioIds.size > 0) {
      const rows = [...currentEstudioIds].map(eid => ({
        id_anime:  currentAnime.id_anime,
        id_estudio: eid
      }))
      const { error } = await db.from('anime_estudios').insert(rows)
      if (error) throw error
    }

    // ── 2. Episodios ─────────────────────────────────
    const blocks = document.querySelectorAll('#episodesList .ep-block')
    for (const block of blocks) {
      const rawId   = block.dataset.epId
      const num     = parseInt(block.dataset.num)
      const pregIn  = block.querySelector('.preg-in')
      let preg    = pregIn?.value.trim() || ''
      if (preg && !preg.includes('¿El hentai que buscas tiene')) {
        preg = `¿El hentai que buscas tiene ${preg}?`
      }
      
      const ctxIn = block.querySelector('.contexto-ia-in')
      const ctxText = ctxIn?.value.trim() || null

      const estadoExperto = preg ? 'completado' : 'pendiente'
      let episodioId

      if (String(rawId).startsWith('new_')) {
        // Verificar que no exista ya ese número
        const { data: exists } = await db.from('episodios')
          .select('id_episodio').eq('id_anime', currentAnime.id_anime).eq('numero', num).maybeSingle()
        if (exists) {
          episodioId = exists.id_episodio
          await db.from('episodios').update({ pregunta_akinator: preg || null, contexto_ia: ctxText, estado_experto: estadoExperto })
            .eq('id_episodio', episodioId)
        } else {
          const { data: newEp, error: nErr } = await db.from('episodios').insert({
            id_anime: currentAnime.id_anime,
            numero: num,
            pregunta_akinator: preg || null,
            contexto_ia: ctxText,
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
          contexto_ia: ctxText,
          estado_experto:    estadoExperto
        }).eq('id_episodio', episodioId)
        if (uErr) throw uErr
      }

      // Actualizar indicador visual
      const statusEl = block.querySelector('.ep-status')
      if (statusEl) statusEl.textContent = estadoExperto === 'completado' ? '✅' : (preg ? '🔶' : '⚪')
      block.classList.toggle('ep-done', estadoExperto === 'completado')
      block.classList.toggle('ep-partial', estadoExperto !== 'completado' && !!preg)
    }

    // ── Actualizar Pregunta General y Contexto IA del Anime ──
    const newAnoInput = document.getElementById('animeAno')?.value
    const newAno = newAnoInput ? parseInt(newAnoInput) : null
    let nuevaPreguntaGeneral = document.getElementById('animePregunta')?.value.trim() || null
    let nuevoContextoIA = document.getElementById('animeContextoIA')?.value.trim() || null
    
    const updates = {}
    if (currentAnime['año'] !== newAno) updates['año'] = newAno
    if (currentAnime.pregunta_akinator !== nuevaPreguntaGeneral) updates.pregunta_akinator = nuevaPreguntaGeneral
    if (currentAnime.contexto_ia !== nuevoContextoIA) updates.contexto_ia = nuevoContextoIA

    if (Object.keys(updates).length > 0) {
      const { error: updErr } = await db.from('animes').update(updates).eq('id_anime', currentAnime.id_anime)
      if (updErr) throw updErr
      Object.assign(currentAnime, updates)
    }

    // Actualizar estado para la UI de géneros y detalles
    originalGeneroIds = new Set(currentGeneroIds)
    originalEstudioIds = new Set(currentEstudioIds)
    originalAnimeAno = currentAnime['año']
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
  const cache      = linksCache[ep.id_episodio] || { hls: null, mp4_sub: null, mp4_eng: null }
  
  const hlsUrl     = cache.hls?.url_video || ''
  const mp4SubUrl  = cache.mp4_sub?.url_video || ''
  const mp4EngUrl  = cache.mp4_eng?.url_video || ''

  const inputs = [hlsUrl, mp4SubUrl, mp4EngUrl]
  const filled = inputs.filter(url => url !== '').length
  const total = 3
  
  // Estado del link: activo por defecto, caido si ya fue marcado así
  const isActivo   = ep.estado_links !== 'caido'
  const isComplete = filled === total && isActivo
  const isPartial  = filled > 0 && !isComplete
  const done       = ep.estado_experto === 'completado'

  return `
    <div class="ep-block ${isComplete ? 'ep-done' : isPartial ? 'ep-partial' : ''}"
         data-ep-id="${ep.id_episodio}" data-num="${ep.numero}">
      <div class="ep-header" onclick="toggleEpisode(this.parentElement)">
        <span class="ep-num">Cap. ${ep.numero}</span>
        <span class="ep-label">${ep.titulo_episodio ? escapeHtml(ep.titulo_episodio) : `Cap\u00edtulo ${ep.numero}`}</span>
        <span class="ep-status" id="epStat_${ep.id_episodio}">
          ${isComplete ? '\u2705' : isPartial ? '\u26a0\ufe0f' : '\u26aa'}
          <small>${filled}/${total}</small>
        </span>
        ${!done ? '<span style="font-size:10px;color:var(--text-dim);margin-left:4px">Experto pendiente</span>' : ''}
        <span class="ep-chevron">\u25bc</span>
      </div>
      <div class="ep-body" style="display:flex; flex-direction:column; gap:20px;">
        
        <!-- ESTADO DEL LINK (activo / caido) -->
        <div class="form-group" style="margin-bottom:0;">
          <label style="margin-bottom:8px;display:block;">\ud83d\udce1 Estado del Link</label>
          <div style="display:flex; gap:10px; align-items:center;">
            <button type="button"
              class="link-status-btn ${isActivo ? 'link-activo' : ''}"
              id="btnActivo_${ep.id_episodio}"
              onclick="setLinkStatus(${ep.id_episodio}, 'activo', this)">
              \ud83d\udfe2 Activo
            </button>
            <button type="button"
              class="link-status-btn ${!isActivo ? 'link-caido' : ''}"
              id="btnCaido_${ep.id_episodio}"
              onclick="setLinkStatus(${ep.id_episodio}, 'caido', this)">
              \ud83d\udd34 Ca\u00eddo
            </button>
            <span style="font-size:11px;color:var(--text-dim);" id="linkStatusLabel_${ep.id_episodio}">
              ${isActivo ? 'Los links est\u00e1n funcionando correctamente' : '\u26a0\ufe0f Links ca\u00eddos \u2014 se necesita re-subida'}
            </span>
          </div>
        </div>

        <!-- HLS PREMIUM -->
        <div class="form-group" style="margin-bottom:0;">
          <label>\ud83d\udd17 HLS Premium (.m3u8) <span style="color:var(--text-dim);font-size:10px;font-weight:normal;">Servidor 14</span></label>
          <div class="server-field" style="border: 1px solid rgba(16, 185, 129, 0.4); background: rgba(16, 185, 129, 0.05);">
            <div class="server-label">
              <span class="sdot ${hlsUrl ? 'filled' : ''}" id="dot_${ep.id_episodio}_hls"></span>
              <span style="color:#10b981; font-weight:600;">HLS CLOUDFLARE</span>
            </div>
            <input type="url" class="input redes-in"
              value="${escapeAttr(hlsUrl)}"
              placeholder="https://pub-xxxx.r2.dev/hls/..."
              data-ep-id="${ep.id_episodio}"
              data-type="hls"
              data-link-id="${cache.hls?.id_link || ''}"
              oninput="markDirty(); onRedesInput(this)"
              onchange="validateUrlInput(this)" />
          </div>
        </div>

        <!-- MP4UPLOAD (SUB Y ENG) -->
        <div class="form-group" style="margin-bottom:0;">
          <label>\ud83d\udcfa MP4Upload (Archivos AV1 de Respaldo) <span style="color:var(--text-dim);font-size:10px;font-weight:normal;">Servidor 13</span></label>
          <p style="font-size:11px; color:var(--text-dim); margin-bottom:8px;">Pega el enlace de <strong>descarga</strong> (ej: https://www.mp4upload.com/xxxx). El reproductor se generar\u00e1 autom\u00e1ticamente.</p>
          <div class="server-grid">
            <!-- ES -->
            <div class="server-field">
              <div class="server-label">
                <span class="sdot ${mp4SubUrl ? 'filled' : ''}" id="dot_${ep.id_episodio}_mp4_sub"></span>
                <span style="color:#f472b6;">Espa\u00f1ol (SUB)</span>
              </div>
              <input type="url" class="input redes-in"
                value="${escapeAttr(mp4SubUrl)}"
                placeholder="https://www.mp4upload.com/..."
                data-ep-id="${ep.id_episodio}"
                data-type="mp4_sub"
                data-link-id="${cache.mp4_sub?.id_link || ''}"
                oninput="markDirty(); onRedesInput(this)"
                onchange="validateUrlInput(this)" />
            </div>

            <!-- ENG -->
            <div class="server-field">
              <div class="server-label">
                <span class="sdot ${mp4EngUrl ? 'filled' : ''}" id="dot_${ep.id_episodio}_mp4_eng"></span>
                <span style="color:#38bdf8;">Ingl\u00e9s (ENG)</span>
              </div>
              <input type="url" class="input redes-in"
                value="${escapeAttr(mp4EngUrl)}"
                placeholder="https://www.mp4upload.com/..."
                data-ep-id="${ep.id_episodio}"
                data-type="mp4_eng"
                data-link-id="${cache.mp4_eng?.id_link || ''}"
                oninput="markDirty(); onRedesInput(this)"
                onchange="validateUrlInput(this)" />
            </div>
          </div>
        </div>

      </div>
    </div>`
}

function onRedesInput(input) {
  const epId = input.dataset.epId
  const type = input.dataset.type
  const val  = input.value.trim()
  const filled = !!val

  const dot = document.getElementById(`dot_${epId}_${type}`)
  if (dot) dot.classList.toggle('filled', filled)

  const block  = input.closest('.ep-block')
  if (!block) return
  const inputs  = [...block.querySelectorAll('.redes-in')]
  const nFilled = inputs.filter(i => i.value.trim()).length
  const nTotal  = 3

  // Considerar estado del link para el icono
  const activoBtn = document.getElementById(`btnActivo_${epId}`)
  const isActivo  = activoBtn ? activoBtn.classList.contains('link-activo') : true
  const statEl    = document.getElementById(`epStat_${epId}`)

  const isComplete = nFilled === nTotal && isActivo
  if (statEl) {
    statEl.innerHTML = isComplete
      ? `\u2705 <small>${nFilled}/${nTotal}</small>`
      : nFilled > 0
        ? `\u26a0\ufe0f <small>${nFilled}/${nTotal}</small>`
        : `\u26aa <small>0/${nTotal}</small>`
  }

  block.classList.toggle('ep-done',    isComplete)
  block.classList.toggle('ep-partial', nFilled > 0 && !isComplete)
}

// Cambia el estado activo/caido del toggle y actualiza la UI
function setLinkStatus(epId, status, clickedBtn) {
  const block     = clickedBtn.closest('.ep-block')
  const activoBtn = document.getElementById(`btnActivo_${epId}`)
  const caidoBtn  = document.getElementById(`btnCaido_${epId}`)
  const label     = document.getElementById(`linkStatusLabel_${epId}`)

  activoBtn.classList.toggle('link-activo', status === 'activo')
  activoBtn.classList.toggle('link-caido',  false)
  caidoBtn.classList.toggle('link-caido',   status === 'caido')
  caidoBtn.classList.toggle('link-activo',  false)

  if (label) {
    label.textContent = status === 'activo'
      ? 'Los links est\u00e1n funcionando correctamente'
      : '\u26a0\ufe0f Links ca\u00eddos \u2014 se necesita re-subida'
  }

  // Guardar en dataset para que saveRedes lo lea
  block.dataset.linkStatus = status
  markDirty()

  // Actualizar icono del episodio
  const inputs  = block ? [...block.querySelectorAll('.redes-in')] : []
  const nFilled = inputs.filter(i => i.value.trim()).length
  const nTotal  = 3
  const isComplete = nFilled === nTotal && status === 'activo'
  const statEl  = document.getElementById(`epStat_${epId}`)
  if (statEl) {
    statEl.innerHTML = isComplete
      ? `\u2705 <small>${nFilled}/${nTotal}</small>`
      : nFilled > 0
        ? `\u26a0\ufe0f <small>${nFilled}/${nTotal}</small>`
        : `\u26aa <small>0/${nTotal}</small>`
  }
  if (block) {
    block.classList.toggle('ep-done',    isComplete)
    block.classList.toggle('ep-partial', nFilled > 0 && !isComplete)
  }
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
      const inputs = [...block.querySelectorAll('.redes-in')]
      let allFilled = true

      for (const input of inputs) {
        let url    = input.value.trim()
        const type   = input.dataset.type // 'hls', 'mp4_sub', 'mp4_eng'
        const linkId = input.dataset.linkId ? parseInt(input.dataset.linkId) : null
        
        let servId, idioma, esDescarga
        
        if (type === 'hls') {
            servId = 14
            idioma = 'sub'
            esDescarga = false
        } else if (type === 'mp4_sub') {
            servId = 13
            idioma = 'sub'
            esDescarga = true
            // Si por error pegan el embed, lo convertimos a descarga para la BD
            url = deriveDownloadLink('mp4upload', url) || url 
        } else if (type === 'mp4_eng') {
            servId = 13
            idioma = 'eng'
            esDescarga = true
            url = deriveDownloadLink('mp4upload', url) || url 
        }

        if (url && !validateUrl(url)) {
          showToast(`URL inválida en Cap. ${num} — ${type}`, 'error')
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
            es_descarga: esDescarga,
            idioma:      idioma
          }).select().single()
          if (error) throw error
          input.dataset.linkId = nl.id_link
          if (!linksCache[epId]) linksCache[epId] = { hls: null, mp4_sub: null, mp4_eng: null }
          linksCache[epId][type] = nl
        }
      }

      // Actualizar estado_links del episodio
      // ✅ 'completado' = todos los links llenos + toggle en 'activo'
      // 🔴 'caido'     = el de Redes lo marcó como caído manualmente
      // ⏳ 'pendiente' = faltan links
      const linkStatus = block.dataset.linkStatus
        || (currentEpisodios.find(e => e.id_episodio === epId)?.estado_links === 'caido' ? 'caido' : 'activo')
      let estadoLinks
      if (!allFilled) {
        estadoLinks = 'pendiente'
      } else if (linkStatus === 'caido') {
        estadoLinks = 'caido'
      } else {
        estadoLinks = 'completado'
      }
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
//  LETRAS DEL CATÁLOGO — REDES (tabla independiente)
// ─────────────────────────────────────────────────────
async function loadLetrasRedes() {
  // 1. Cargar asignaciones de Redes
  const { data: asigs } = await db.from('letras_redes').select('*')
  letrasRedesCache = {}
  ;(asigs || []).forEach(r => {
    letrasRedesCache[r.letra.toUpperCase()] = { grupo: r.grupo, completada: r.completada }
  })

  // 2. Contar animes por letra (reutiliza la misma lógica)
  const { data: titulosData } = await db.from('animes').select('titulo')
  animeCountByLetra = {}
  ;(titulosData || []).forEach(a => {
    const first = (a.titulo || '')[0]?.toUpperCase()
    const key = first && /[A-Z]/.test(first) ? first : '#'
    animeCountByLetra[key] = (animeCountByLetra[key] || 0) + 1
  })

  renderLetrasRedesGrid()
}

async function claimLetraRedes(letra) {
  if (!currentSession?.group) return
  const myGroup = currentSession.group
  const existing = letrasRedesCache[letra]

  // Letra completada → no se puede tocar
  if (existing?.completada) return

  // De otro grupo → bloqueada
  if (existing?.grupo && existing.grupo !== myGroup) return

  if (existing?.grupo === myGroup) {
    // Liberar mi letra
    const { error } = await db.from('letras_redes').delete().eq('letra', letra)
    if (error) { showToast('Error al liberar: ' + error.message, 'error'); return }
    delete letrasRedesCache[letra]
    showToast(`Letra "${letra}" liberada`, 'info')
  } else {
    // Reclamar
    const { error } = await db.from('letras_redes')
      .upsert({ letra, grupo: myGroup, completada: false })
    if (error) { showToast('Error al reclamar: ' + error.message, 'error'); return }
    letrasRedesCache[letra] = { grupo: myGroup, completada: false }
    showToast(`Letra "${letra}" asignada a Redes ${myGroup} ✅`, 'success')
  }
  renderLetrasRedesGrid()
}

async function checkCompletadasRedes() {
  const toCheck = Object.entries(letrasRedesCache)
    .filter(([, info]) => info.grupo && !info.completada)
    .map(([l]) => l)

  if (toCheck.length === 0) { showToast('No hay letras para verificar', 'info'); return }

  showToast('Verificando letras de Redes...', 'info')

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

    // Para Redes: verificar que TODOS los episodios tengan estado_links = 'completado'
    const [{ count: total }, { count: done }] = await Promise.all([
      db.from('episodios').select('*', { count: 'exact', head: true }).in('id_anime', ids),
      db.from('episodios').select('*', { count: 'exact', head: true })
        .in('id_anime', ids).eq('estado_links', 'completado')
    ])

    if (total && total > 0 && done === total) {
      await db.from('letras_redes').update({ completada: true }).eq('letra', letra)
      letrasRedesCache[letra].completada = true
      newDone++
    }
  }

  showToast(
    newDone > 0 ? `¡${newDone} letra${newDone > 1 ? 's' : ''} completada${newDone > 1 ? 's' : ''}! 🎉` : 'Ninguna completada aún',
    newDone > 0 ? 'success' : 'info'
  )
  renderLetrasRedesGrid()
}

function renderLetrasRedesGrid() {
  const gridEl    = document.getElementById('letrasGrid')
  const summaryEl = document.getElementById('letrasSummary')
  if (!gridEl) return

  const myGroup = currentSession?.group

  // ── Resumen por grupo (A, B, C, D) ──
  if (summaryEl) {
    const byGroup = { A: [], B: [], C: [], D: [] }
    Object.entries(letrasRedesCache).forEach(([l, info]) => {
      if (info.grupo && byGroup[info.grupo]) byGroup[info.grupo].push(l)
    })
    summaryEl.innerHTML = ['A', 'B', 'C', 'D'].map(g => {
      const c = GRUPO_COLORS[g]
      const letters = byGroup[g].sort().join(' · ') || '—'
      return `
        <div class="grupo-row" style="border-color:${c.border}">
          <span class="grupo-tag-sm" style="background:${c.bg};color:${c.text}">Redes ${g}</span>
          <span class="grupo-letras-sm">${letters}</span>
        </div>`
    }).join('')
  }

  // ── Grid de letras ──
  gridEl.innerHTML = LETRAS.map(letra => {
    const info        = letrasRedesCache[letra]
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
        ? `${letra} — Redes ${claimedBy} · ${count} animes${isMine ? ' (clic para liberar)' : ''}`
        : `${letra} — ${count} animes · Clic para reclamar`

    return `
      <div class="letra-cell ${completed ? 'lc-done' : isMine ? 'lc-mine' : isOthers ? 'lc-others' : 'lc-free'}"
           style="${bgStyle}"
           onclick="${canClick ? `claimLetraRedes('${letra}')` : ''}"
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
    if (match) return 'https://www.mp4upload.com/' + match[1];
  }
  else if (name.includes('mega')) {
    return url.replace('/embed/', '/file/');
  }
  else if (name.includes('yourupload')) {
    return url.replace('/embed/', '/watch/');
  }
  else if (name.includes('voe')) {
    const match = url.match(/\/e\/([^\/]+)$/);
    if (match) return url.replace('/e/' + match[1], '/d/' + match[1]);
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









