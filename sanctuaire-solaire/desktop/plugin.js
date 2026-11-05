// Le Sanctuaire Solaire — Hermes Desktop half.
// A pane under the conversation (and a full page in the sidebar) showing the panorama. The panorama runs in the
// SDK's sandboxed frame; this file feeds it the theme, the images (from the plugin's own routes) and the activity:
// instant tool / turn events from the app, plus the merged state of every Hermes process (crons, Discord…).
// Only tool NAMES are forwarded, never arguments, results or messages.
// 2026-11-05 ≈11:45 (Europe/Zurich) — Claude (Cowork) — Anthropic, Claude Opus 5.5, pour Médéric Morin
// Copyright 2026 Médéric Morin — Apache License 2.0
import { SandboxedFrame, ROUTES_AREA, SIDEBAR_NAV_AREA } from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'
import { jsx } from 'react/jsx-runtime'

const ID = 'sanctuaire-solaire'
const POLL_MS = 1500
const listeners = new Set()
let api = null
let bundle = null

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

async function loadAssets(names) {
  const out = {}
  let i = 0
  async function worker() {
    while (i < names.length) {
      const name = names[i++]
      try {
        const r = await api.rest('/asset?name=' + encodeURIComponent(name), { timeoutMs: 60000 })
        if (r && typeof r.url === 'string' && r.url.startsWith('data:image/')) out[name] = r.url
      } catch (e) { /* image manquante : le personnage garde son image fixe */ }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  return out
}

function loadBundle() {
  if (!bundle) {
    bundle = (async () => {
      const [frame, theme] = await Promise.all([api.rest('/frame'), api.rest('/theme?id=sanctuaire')])
      const assets = await loadAssets(assetNames(theme))
      return { src: 'data:text/html;charset=utf-8,' + encodeURIComponent(frame.html), theme, assets }
    })()
    bundle.catch(() => { bundle = null })
  }
  return bundle
}

function Panorama({ height }) {
  const ref = useRef(null)
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    loadBundle().then(b => { if (alive) setData(b) }, () => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])

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
      if (!w || ev.source !== w || !ev.data || ev.data.type !== 'sanctuaire:ready' || started) return
      started = true
      post({ type: 'sanctuaire:theme', theme: data.theme, assets: data.assets })
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
  })
}

export default {
  id: ID,
  name: 'Le Sanctuaire Solaire',
  register(ctx) {
    api = ctx
    bundle = null
    ctx.onEvent('tool.start', ev => {
      const name = ev && ev.payload && ev.payload.name
      if (typeof name === 'string') emit({ type: 'sanctuaire:event', kind: 'tool', name: name.slice(0, 80) })
    })
    ctx.onEvent('message.start', () => emit({ type: 'sanctuaire:event', kind: 'turn', busy: true }))
    ctx.onEvent('message.complete', () => emit({ type: 'sanctuaire:event', kind: 'turn', busy: false }))
    ctx.onDispose(() => { listeners.clear(); bundle = null })

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
