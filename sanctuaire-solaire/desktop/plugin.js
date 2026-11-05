// Le Sanctuaire Solaire — Hermes Desktop half.
// A pane under the conversation (and a full page in the sidebar) showing the panorama. The panorama runs in the
// SDK's sandboxed frame; this file feeds it the theme, the images (from the plugin's own routes) and the activity:
// instant tool / turn events from the app, plus the merged state of every Hermes process (crons, Discord…).
// Only tool NAMES are forwarded, never arguments, results or messages.
// 2026-11-05 ≈11:45, mis à jour ≈12:50 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5, pour Médéric Morin
// 2026-11-05 ≈12:50 : notifications natives du Shiba (modèle de secours, autorisation en attente sur la messagerie)
// 2026-11-05 ≈15:15 : choix de l'univers (Olympe, Clairière), notification « tour trop lourd »
// 2026-11-05 ≈16:10 : boucle, budget du jour (réglage gardé ici), image « Ma journée » à télécharger, replay de la journée
// Copyright 2026 Médéric Morin — Apache License 2.0
import { SandboxedFrame, ROUTES_AREA, SIDEBAR_NAV_AREA } from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'
import { jsx } from 'react/jsx-runtime'

const ID = 'sanctuaire-solaire'
const POLL_MS = 1500
const listeners = new Set()
const NOTIFY_GAP_MS = 120000
const lastNotify = {}
const KINDS = ['fallback', 'approval', 'heavy', 'loop', 'budget']
const SETTINGS_KEY = 'sanctuaire.settings'
const DEFAULT_WORLD = 'olympe'
const WORLD_KEY = 'sanctuaire.world'
const worldListeners = new Set()
let api = null
let bundles = {}
let worldsP = null
let world = readWorld()

function readWorld() {
  try { return (localStorage.getItem(WORLD_KEY) || DEFAULT_WORLD).replace(/[^a-z0-9_-]/g, '') || DEFAULT_WORLD } catch (e) { return DEFAULT_WORLD }
}

function setWorld(id) {
  if (typeof id !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(id) || id === world) return
  world = id
  try { localStorage.setItem(WORLD_KEY, id) } catch (e) { /* stockage indisponible */ }
  worldListeners.forEach(fn => { try { fn(id) } catch (e) { /* rien */ } })
}

// Settings of the panorama (daily budget and the day its alert was shown), kept by the app: the sandboxed frame has no storage.
function readSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}
    const out = {}
    if (typeof s.budget === 'number' && s.budget > 0 && s.budget < 1e5) out.budget = s.budget
    if (typeof s.budgetDay === 'string') out.budgetDay = s.budgetDay.slice(0, 40)
    return out
  } catch (e) { return {} }
}

function saveSettings(s) {
  if (!s || typeof s !== 'object') return
  const out = {}
  if (typeof s.budget === 'number' && s.budget > 0 && s.budget < 1e5) out.budget = Math.round(s.budget * 100) / 100
  if (typeof s.budgetDay === 'string') out.budgetDay = s.budgetDay.slice(0, 40)
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(out)) } catch (e) { /* stockage indisponible */ }
}

// The "My day" image made by the panorama: a PNG data URL, saved through the browser's own download.
function download(msg) {
  const url = typeof msg.url === 'string' ? msg.url : ''
  const name = typeof msg.name === 'string' && /^[a-z0-9-]{1,60}\.png$/.test(msg.name) ? msg.name : 'sanctuaire.png'
  if (!url.startsWith('data:image/png;base64,') || url.length > 15 * 1024 * 1024) return
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => a.remove(), 0)
}

// The worlds the backend knows. An older backend has no /themes route: then only the clearing exists.
function loadWorlds() {
  if (!worldsP) {
    worldsP = api.rest('/themes')
      .then(list => (Array.isArray(list) && list.length ? list : [{ id: 'sanctuaire', names: {} }]))
      .catch(() => [{ id: 'sanctuaire', names: {} }])
  }
  return worldsP
}

// The Shiba's alerts (fallback model, permission waiting on Discord/Telegram, heavy turn) as a native notification,
// at most one per kind every 2 minutes. Title and text are written by the panorama, never by the frame's caller.
function notify(msg) {
  const kind = KINDS.includes(msg.kind) ? msg.kind : null
  if (!kind || !api || !api.os || typeof api.os.notify !== 'function') return
  const now = Date.now()
  if (now - (lastNotify[kind] || 0) < NOTIFY_GAP_MS) return
  lastNotify[kind] = now
  const title = String(msg.title || 'Sanctuaire').slice(0, 80)
  const body = String(msg.body || '').slice(0, 240)
  Promise.resolve(api.os.notify({ title, body })).catch(() => {})
}

function emit(msg) {
  listeners.forEach(fn => {
    try { fn(msg) } catch (e) { /* une vue fermée ne bloque pas les autres */ }
  })
}

function assetNames(theme) {
  const names = new Set()
  JSON.stringify(theme).replace(/"([a-z0-9][a-z0-9-]{0,80}\.(?:webp|png|jpg|svg))"/g, (_, n) => { names.add(n); return _ })
  return [...names]
}

async function loadAssets(names, themeId) {
  const out = {}
  let i = 0
  async function worker() {
    while (i < names.length) {
      const name = names[i++]
      try {
        const r = await api.rest('/asset?name=' + encodeURIComponent(name) + (themeId ? '&theme=' + encodeURIComponent(themeId) : ''), { timeoutMs: 60000 })
        if (r && typeof r.url === 'string' && r.url.startsWith('data:image/')) out[name] = r.url
      } catch (e) { /* image manquante : le personnage garde son image fixe */ }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  return out
}

function loadBundle(want) {
  if (!bundles[want]) {
    const p = (async () => {
      const worlds = await loadWorlds()
      const id = worlds.some(w => w.id === want) ? want : worlds[0].id
      const [frame, theme] = await Promise.all([api.rest('/frame'), api.rest('/theme?id=' + encodeURIComponent(id))])
      // The clearing keeps its images at the root of app/ (base ""); other worlds in their own folder.
      const folder = typeof theme.base === 'string' && theme.base.startsWith('themes/') ? id : ''
      const assets = await loadAssets(assetNames(theme), folder)
      return { src: 'data:text/html;charset=utf-8,' + encodeURIComponent(frame.html), theme, assets, worlds, world: id }
    })()
    bundles[want] = p
    p.catch(() => { delete bundles[want] })
  }
  return bundles[want]
}

function Panorama({ height }) {
  const ref = useRef(null)
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)
  const [want, setWant] = useState(world)

  useEffect(() => {
    worldListeners.add(setWant)
    return () => { worldListeners.delete(setWant) }
  }, [])

  useEffect(() => {
    let alive = true
    setData(null)
    loadBundle(want).then(b => { if (alive) setData(b) }, () => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [want])

  useEffect(() => {
    if (!data) return undefined
    let alive = true
    let started = false
    let timer = 0
    const post = msg => {
      const w = ref.current && ref.current.contentWindow
      if (w) w.postMessage(msg, '*')
    }
    const poll = () => {
      if (!alive) return
      if (document.hidden) { timer = setTimeout(poll, POLL_MS * 2); return }
      api.rest('/state')
        .then(st => post({ type: 'sanctuaire:state', state: st }), () => post({ type: 'sanctuaire:lost' }))
        .then(() => { if (alive) timer = setTimeout(poll, POLL_MS) })
    }
    const onMessage = ev => {
      const w = ref.current && ref.current.contentWindow
      if (!w || ev.source !== w || !ev.data || typeof ev.data.type !== 'string') return
      if (ev.data.type === 'sanctuaire:notify') { notify(ev.data); return }
      if (ev.data.type === 'sanctuaire:world') { setWorld(ev.data.id); return }
      if (ev.data.type === 'sanctuaire:settings') { saveSettings(ev.data.settings); return }
      if (ev.data.type === 'sanctuaire:download') { download(ev.data); return }
      if (ev.data.type === 'sanctuaire:timeline-request') {
        api.rest('/timeline', { timeoutMs: 30000 })
          .then(r => post({ type: 'sanctuaire:timeline', events: r && Array.isArray(r.events) ? r.events : [] }),
            () => post({ type: 'sanctuaire:timeline', events: [] }))
        return
      }
      if (ev.data.type !== 'sanctuaire:ready' || started) return
      started = true
      post({ type: 'sanctuaire:theme', theme: data.theme, assets: data.assets, worlds: data.worlds, world: data.world, settings: readSettings() })
      poll()
    }
    const live = msg => { if (started) post(msg) }
    window.addEventListener('message', onMessage)
    listeners.add(live)
    return () => {
      alive = false
      clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      listeners.delete(live)
    }
  }, [data])

  if (failed) {
    return jsx('div', {
      className: 'p-3 text-xs text-(--ui-text-tertiary)',
      children: 'Sanctuaire: the backend half is not enabled (hermes plugins enable sanctuaire-solaire, then restart Hermes).'
    })
  }
  if (!data) {
    return jsx('div', { className: 'p-3 text-xs text-(--ui-text-tertiary)', children: '☀ Sanctuaire…' })
  }
  return jsx(SandboxedFrame, {
    ref,
    src: data.src,
    title: 'Le Sanctuaire Solaire',
    style: { width: '100%', height, border: 0, display: 'block', background: '#142016' }
  }, data.world)
}

export default {
  id: ID,
  name: 'Le Sanctuaire Solaire',
  register(ctx) {
    api = ctx
    bundles = {}
    worldsP = null
    ctx.onEvent('tool.start', ev => {
      const name = ev && ev.payload && ev.payload.name
      if (typeof name === 'string') emit({ type: 'sanctuaire:event', kind: 'tool', name: name.slice(0, 80) })
    })
    ctx.onEvent('message.start', () => emit({ type: 'sanctuaire:event', kind: 'turn', busy: true }))
    ctx.onEvent('message.complete', () => emit({ type: 'sanctuaire:event', kind: 'turn', busy: false }))
    ctx.onDispose(() => { listeners.clear(); worldListeners.clear(); bundles = {}; worldsP = null })

    ctx.registerMany([
      {
        id: 'pane',
        area: 'panes',
        title: 'Sanctuaire',
        data: { placement: 'bottom', dock: { pane: 'workspace', pos: 'bottom' }, height: '240px' },
        render: () => jsx(Panorama, { height: '100%' })
      },
      {
        id: 'page',
        area: ROUTES_AREA,
        data: { path: '/sanctuaire' },
        render: () => jsx(Panorama, { height: '100%' })
      },
      {
        id: 'nav',
        area: SIDEBAR_NAV_AREA,
        data: { path: '/sanctuaire', label: 'Sanctuaire', codicon: 'sparkle' }
      }
    ])
  }
}
