import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Candle, Chart, Quote } from '../types'

// MakeItCount piaci műszerfal: sáv a beviteli mező fölött, gyertyás chart panelben.
// Adat kulcs nélkül: CNBC nyilvános quote- és chart-végpont, Binance nyilvános API.

const PANE = 'mic-piac'
const REFRESH_MS = 5 * 60 * 1000
const CANDLES = 60
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'

const quotes = atom({ plugin: 'mic-piaci-muszerfal', key: 'quotes' } as const, null, { shape: 'quotes-1' })
const updatedAt = atom({ plugin: 'mic-piaci-muszerfal', key: 'updatedAt' } as const, null)
const error = atom({ plugin: 'mic-piaci-muszerfal', key: 'error' } as const, null)
const selected = atom({ plugin: 'mic-piaci-muszerfal', key: 'selected' } as const, 'spx')
const chart = atom({ plugin: 'mic-piaci-muszerfal', key: 'chart' } as const, null, { shape: 'chart-1' })
const isBandHidden = atom({ plugin: 'mic-piaci-muszerfal', key: 'isBandHidden' } as const, false)
const hangulat = atom({ plugin: 'mic-piaci-muszerfal', key: 'hangulat' } as const, null, { shape: 'hangulat-1' })
const hangulatError = atom({ plugin: 'mic-piaci-muszerfal', key: 'hangulatError' } as const, null)

// The sentiment index is computed by the hangulat-index skill; the mod only shows it.
const HANG_PANE = 'mic-hangulat'
const HANG_FILE = 'hangulat/hangulat-index.json'
const COMP_LABELS: Record<string, string> = {
  lendulet: 'Lendület (S&P 500 a 125 napos átlagához)',
  volatilitas: 'Volatilitás (VIX)',
  hitelpiac: 'Hitelpiac (high yield kötvények az állampapírhoz)',
  ai_lendulet: 'AI-lendület (félvezetők az S&P 500-hoz)',
  kripto: 'Kripto (BTC, 30 nap)',
}
const ZONE_COLORS: [number, string][] = [
  [24, '#c0392b'],
  [44, '#e67e22'],
  [55, '#9e9e9e'],
  [75, '#7cb342'],
  [100, '#2e7d32'],
]
function zoneColor(v: number): string {
  return (ZONE_COLORS.find(([cut]) => v <= cut) ?? ZONE_COLORS[4])[1]
}

// Instruments: CNBC symbols for indexes, Binance for Bitcoin.
const INSTRUMENTS: Record<string, { label: string; cnbc?: string; tv: string; decimals: number }> = {
  spx: { label: 'S&P 500', cnbc: '.SPX', tv: 'SP:SPX', decimals: 2 },
  ndx: { label: 'Nasdaq-100', cnbc: '.NDX', tv: 'NASDAQ:NDX', decimals: 2 },
  sox: { label: 'Félvezetők (SOX)', cnbc: '.SOX', tv: 'NASDAQ:SOX', decimals: 2 },
  vix: { label: 'VIX', cnbc: '.VIX', tv: 'CBOE:VIX', decimals: 2 },
  btc: { label: 'BTC', tv: 'BINANCE:BTCUSDT', decimals: 0 },
}
const BAND = ['spx', 'ndx', 'vix', 'btc']
const CHARTABLE = ['spx', 'sox', 'btc', 'vix']

// Hungarian number format: thin space thousands, comma decimals.
function fmt(n: number, decimals: number): string {
  const fixed = Math.abs(n).toFixed(decimals)
  const [int, frac] = fixed.split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return (n < 0 ? '-' : '') + grouped + (frac ? ',' + frac : '')
}
function pct(n: number): string {
  return (n > 0 ? '+' : '') + fmt(n, 2) + '%'
}
function num(s: unknown): number {
  return typeof s === 'number' ? s : parseFloat(String(s).replace(/[,%+]/g, ''))
}
function hhmm(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString('hu-HU', {
      timeZone: 'Europe/Budapest',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    const d = new Date(ms)
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`
  }
}

async function getJson($: any, url: string): Promise<any> {
  const res = await $.http.fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url.split('?')[0]}`)
  return JSON.parse(res.text)
}

async function fetchQuotes($: any): Promise<Quote[]> {
  const ids = BAND.filter(id => INSTRUMENTS[id].cnbc)
  const syms = ids.map(id => INSTRUMENTS[id].cnbc).join('%7C')
  const cnbc = await getJson(
    $,
    `https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=${syms}&requestMethod=itv&noform=1&exthrs=1&output=json`,
  )
  const rows: any[] = cnbc?.FormattedQuoteResult?.FormattedQuote ?? []
  const out: Quote[] = []
  for (const id of ids) {
    const r = rows.find(x => x.symbol === INSTRUMENTS[id].cnbc)
    if (!r) continue
    out.push({
      id,
      label: INSTRUMENTS[id].label,
      last: num(r.last),
      change: num(r.change),
      changePct: num(r.change_pct),
      decimals: INSTRUMENTS[id].decimals,
    })
  }
  const btc = await getJson($, 'https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT')
  out.push({
    id: 'btc',
    label: 'BTC',
    last: num(btc.lastPrice),
    change: num(btc.priceChange),
    changePct: num(btc.priceChangePercent),
    decimals: 0,
  })
  return BAND.map(id => out.find(q => q.id === id)).filter(Boolean) as Quote[]
}

async function fetchCandles($: any, id: string): Promise<Candle[]> {
  if (id === 'btc') {
    const rows: any[] = await getJson(
      $,
      `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=${CANDLES}`,
    )
    return rows.map(r => ({
      t: new Date(r[0]).toISOString().slice(0, 10),
      o: num(r[1]),
      h: num(r[2]),
      l: num(r[3]),
      c: num(r[4]),
    }))
  }
  const sym = INSTRUMENTS[id].cnbc as string
  const d = await getJson($, `https://ts-api.cnbc.com/harmony/app/charts/1Y.json?symbol=${encodeURIComponent(sym)}`)
  const bars: any[] = d?.barData?.priceBars ?? []
  return bars.slice(-CANDLES).map(b => {
    const t = String(b.tradeTime)
    return { t: `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`, o: num(b.open), h: num(b.high), l: num(b.low), c: num(b.close) }
  })
}

// Real OHLC candles as SVG (no smoothing, no invented points).
function candleSvg(c: Candle[], decimals: number): string {
  const W = 640, H = 260, L = 8, R = 70, T = 12, B = 26
  const hi = Math.max(...c.map(x => x.h))
  const lo = Math.min(...c.map(x => x.l))
  const span = hi - lo || 1
  const y = (v: number) => T + ((hi - v) / span) * (H - T - B)
  const step = (W - L - R) / c.length
  const body = Math.max(2, step * 0.62)
  const parts: string[] = []
  for (const [k, v] of [[hi, 'max'], [lo, 'min'], [c[c.length - 1].c, 'last']] as const) {
    const yy = y(v as number)
    parts.push(
      `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="#8884" stroke-dasharray="${k === 'last' ? '0' : '3 3'}"/>`,
      `<text x="${W - R + 6}" y="${yy + 4}" font-size="11" fill="#888" font-family="system-ui">${fmt(v as number, decimals)}</text>`,
    )
  }
  c.forEach((x, i) => {
    const cx = L + step * i + step / 2
    const up = x.c >= x.o
    const col = up ? '#2e9e5b' : '#d64545'
    const top = y(Math.max(x.o, x.c))
    const h = Math.max(1, Math.abs(y(x.o) - y(x.c)))
    parts.push(
      `<line x1="${cx}" x2="${cx}" y1="${y(x.h)}" y2="${y(x.l)}" stroke="${col}" stroke-width="1"/>`,
      `<rect x="${cx - body / 2}" y="${top}" width="${body}" height="${h}" fill="${col}"/>`,
    )
  })
  parts.push(
    `<text x="${L}" y="${H - 8}" font-size="11" fill="#888" font-family="system-ui">${c[0].t}</text>`,
    `<text x="${W - R}" y="${H - 8}" font-size="11" fill="#888" font-family="system-ui" text-anchor="end">${c[c.length - 1].t}</text>`,
  )
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${parts.join('')}</svg>`
}

// Semicircle gauge 0-100 with the five zones and a needle.
function gaugeSvg(v: number, zone: string): string {
  const W = 320, H = 190, cx = 160, cy = 160, r = 120, sw = 26
  const pt = (val: number, rr: number) => {
    const a = Math.PI * (1 - val / 100)
    return [cx + rr * Math.cos(a), cy - rr * Math.sin(a)]
  }
  const parts: string[] = []
  let from = 0
  for (const [cut, col] of ZONE_COLORS) {
    const [x1, y1] = pt(from, r)
    const [x2, y2] = pt(cut, r)
    parts.push(`<path d="M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}" stroke="${col}" stroke-width="${sw}" fill="none"/>`)
    from = cut
  }
  const [nx, ny] = pt(v, r - 8)
  parts.push(
    `<line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="#888" stroke-width="4" stroke-linecap="round"/>`,
    `<circle cx="${cx}" cy="${cy}" r="7" fill="#888"/>`,
    `<text x="${cx}" y="${cy - 34}" text-anchor="middle" font-size="40" font-weight="700" fill="${zoneColor(v)}" font-family="system-ui">${fmt(v, 0)}</text>`,
    `<text x="${cx}" y="${cy + 26}" text-anchor="middle" font-size="15" fill="#888" font-family="system-ui">${zone}</text>`,
  )
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H + 12}" width="${W}" height="${H + 12}">${parts.join('')}</svg>`
}

// Index history as a line over the zone bands, lowest points labelled.
function historySvg(series: [string, number][]): string {
  const W = 640, H = 220, L = 30, R = 10, T = 10, B = 24
  const x = (i: number) => L + (i / Math.max(1, series.length - 1)) * (W - L - R)
  const y = (v: number) => T + ((100 - v) / 100) * (H - T - B)
  const parts: string[] = []
  let from = 0
  for (const [cut, col] of ZONE_COLORS) {
    parts.push(`<rect x="${L}" y="${y(cut)}" width="${W - L - R}" height="${y(from) - y(cut)}" fill="${col}" opacity="0.12"/>`)
    from = cut
  }
  for (const g of [0, 25, 50, 75, 100]) {
    parts.push(`<text x="${L - 6}" y="${y(g) + 4}" text-anchor="end" font-size="10" fill="#888" font-family="system-ui">${g}</text>`)
  }
  const d = series.map(([, v], i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  parts.push(`<path d="${d}" stroke="#4a7bd0" stroke-width="1.6" fill="none"/>`)
  // Label the deepest point of the window and the lowest point of the last 30 days.
  const pts = series.map(([t, v], i) => ({ t, v, i }))
  const deepest = pts.reduce((a, b) => (b.v < a.v ? b : a))
  const recent = pts.slice(-30).reduce((a, b) => (b.v < a.v ? b : a))
  const lows = Math.abs(recent.i - deepest.i) < 40 ? [deepest] : [deepest, recent]
  for (const p of lows) {
    parts.push(
      `<circle cx="${x(p.i)}" cy="${y(p.v)}" r="3.5" fill="#c0392b"/>`,
      `<text x="${x(p.i) + (x(p.i) > W * 0.85 ? -6 : 0)}" y="${y(p.v) - 8}" text-anchor="${x(p.i) > W * 0.85 ? 'end' : x(p.i) < W * 0.15 ? 'start' : 'middle'}" font-size="10" fill="#888" font-family="system-ui">${p.t} · ${fmt(p.v, 0)}</text>`,
    )
  }
  parts.push(
    `<text x="${L}" y="${H - 6}" font-size="10" fill="#888" font-family="system-ui">${series[0][0]}</text>`,
    `<text x="${W - R}" y="${H - 6}" text-anchor="end" font-size="10" fill="#888" font-family="system-ui">${series[series.length - 1][0]}</text>`,
  )
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${parts.join('')}</svg>`
}

async function loadHangulat($: any): Promise<void> {
  try {
    const d = JSON.parse(await $.fs.read(HANG_FILE))
    const L = d.latest
    const comps: Record<string, number> = {}
    for (const k of Object.keys(COMP_LABELS)) if (typeof L[k] === 'number') comps[k] = L[k]
    const full = (d.series as any[]).filter(r => r.n === undefined || r.n === 5).slice(-630)
    const series: [string, number][] = full.map(r => [r.date, r.index])
    await update($, hangulat, () => ({ date: L.date, index: L.index, zone: L.zone, comps, series }))
    await update($, hangulatError, () => null)
  } catch {
    await update($, hangulat, () => null)
    await update($, hangulatError, () => `Nincs ${HANG_FILE} ebben a mappában. Futtasd a hangulat-index skillt.`)
  }
}

let alertedDay = ''

async function refresh($: any): Promise<void> {
  try {
    const list = await fetchQuotes($)
    await update($, quotes, () => list)
    await update($, updatedAt, () => hhmm(Date.now()))
    await update($, error, () => null)
    const day = new Date().toISOString().slice(0, 10)
    const btc = list.find(q => q.id === 'btc')
    const vix = list.find(q => q.id === 'vix')
    const alerts: string[] = []
    if (btc && btc.changePct <= -5) alerts.push(`BTC 24 óra alatt ${pct(btc.changePct)}`)
    if (vix && vix.last >= 25) alerts.push(`VIX ${fmt(vix.last, 2)} (25 fölött)`)
    if (alerts.length && alertedDay !== day) {
      alertedDay = day
      $.ui.toast(`Piaci riasztás: ${alerts.join(', ')}`)
    }
  } catch (err) {
    await update($, error, () => String((err as Error)?.message ?? err).slice(0, 160))
  }
}

async function loadChart($: any, id: string): Promise<void> {
  await update($, selected, () => id)
  try {
    const candles = await fetchCandles($, id)
    const c: Chart = { id, label: INSTRUMENTS[id].label, candles, fetchedAt: hhmm(Date.now()) }
    await update($, chart, () => c)
  } catch (err) {
    await update($, error, () => String((err as Error)?.message ?? err).slice(0, 160))
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'piac', description: 'Piaci műszerfal: gyertyás chart panelben' })
    await $.command.register({ name: 'hangulat', description: 'A MIC hangulat-index panelben (a hangulat-index skill eredménye)' })
    void refresh($)
    void loadHangulat($)
    $.clock.every(REFRESH_MS, () => void refresh($))
    return next(e)
  })

  on('command.run', { command: 'hangulat' }, async $ => {
    await loadHangulat($)
    await $.ui.open({ id: HANG_PANE, title: 'MIC hangulat-index' })
    return { text: 'MIC hangulat-index megnyitva.' }
  })

  // Re-read the index after every turn, so a fresh skill run shows up by itself.
  on('turn.complete', async ($, e, next) => {
    void loadHangulat($)
    return next(e)
  })

  on('command.run', { command: 'piac' }, async $ => {
    await update($, isBandHidden, () => false)
    void loadChart($, await read($, selected))
    await $.ui.open({ id: PANE, title: 'Piaci műszerfal' })
    return { text: 'Piaci műszerfal megnyitva.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, quotes)
    if (e.props.hasSurvey || !list || (await read($, isBandHidden))) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const at = await read($, updatedAt)
    const hang = await read($, hangulat)
    return (
      <Box flexDirection="row" gap={2} flexWrap="wrap" alignItems="center">
        {list.map(q => (
          <Text>
            <Text weight="semibold">{q.label}</Text> <Text tabular>{fmt(q.last, q.decimals)}</Text>{' '}
            <Text color={q.changePct >= 0 ? 'green' : 'red'} tabular>
              {pct(q.changePct)}
            </Text>
          </Text>
        ))}
        {hang && (
          <Text>
            <Text weight="semibold">Hangulat</Text>{' '}
            <Text color={hang.index <= 44 ? 'red' : hang.index >= 56 ? 'green' : undefined} tabular>
              {fmt(hang.index, 0)} ({hang.zone})
            </Text>
          </Text>
        )}
        <Text dimColor>{at ? `frissítve ${at}` : ''}</Text>
        {hang && (
          <Button key="hangulat" label="Hangulat" onPress={async () => {
            await loadHangulat($)
            await $.ui.open({ id: HANG_PANE, title: 'MIC hangulat-index' })
          }} />
        )}
        <Button key="chart" label="Chart" onPress={async () => {
          void loadChart($, await read($, selected))
          await $.ui.open({ id: PANE, title: 'Piaci műszerfal' })
        }} />
        <Button key="refresh" label="Frissít" onPress={() => void refresh($)} />
        <Button key="hide" label="Elrejt" role="dismiss" onPress={() => update($, isBandHidden, () => true)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: HANG_PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const Svg = ($.ui.resolve(e) as any).Svg
    const h = await read($, hangulat)
    const err = await read($, hangulatError)
    if (!h) {
      return (
        <Box flexDirection="column" gap={1}>
          <Text>{err ?? 'Betöltés…'}</Text>
          <Button key="reload" label="Újraolvas" onPress={() => void loadHangulat($)} />
        </Box>
      )
    }
    return (
      <Box flexDirection="column" gap={1}>
        <Text dimColor>Utolsó adat: {h.date}. 0 = extrém félelem, 100 = extrém mohóság.</Text>
        {Svg && <Svg source={gaugeSvg(h.index, h.zone)} alt={`MIC hangulat-index: ${fmt(h.index, 0)}, ${h.zone}`} />}
        <Box flexDirection="column">
          {Object.entries(h.comps).map(([k, v]) => (
            <Text>
              <Text color={zoneColor(v)} tabular>{fmt(v, 0).padStart(3, ' ')}</Text> {COMP_LABELS[k] ?? k}
            </Text>
          ))}
        </Box>
        {Svg && h.series.length > 1 && (
          <Svg source={historySvg(h.series)} alt={`A MIC hangulat-index ${h.series[0][0]} óta, a két legmélyebb ponttal`} />
        )}
        <Text dimColor>
          Minden komponens a saját elmúlt 252 kereskedési napjához mért helyezés (percentilis). Ez hangulatmérő, nem jóslat és nem tanács.
        </Text>
        <Button key="reload" label="Újraolvas" onPress={() => void loadHangulat($)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text, Link } = $.ui.resolve(e)
    const Svg = ($.ui.resolve(e) as any).Svg
    const sel = await read($, selected)
    const c = await read($, chart)
    const err = await read($, error)
    const inst = INSTRUMENTS[sel]
    const shown = c && c.id === sel ? c : null
    const first = shown?.candles[0]
    const last = shown?.candles[shown.candles.length - 1]
    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {CHARTABLE.map(id => (
            <Button key={`sel-${id}`} label={INSTRUMENTS[id].label} variant={id === sel ? 'primary' : 'secondary'} onPress={() => void loadChart($, id)} />
          ))}
        </Box>
        {!shown && <Text dimColor>Betöltés…</Text>}
        {shown && Svg && (
          <Svg source={candleSvg(shown.candles, inst.decimals)} alt={`${inst.label}, utolsó ${shown.candles.length} napi gyertya`} />
        )}
        {shown && !Svg && <Text dimColor>Ez a felület nem rajzol SVG-t, a chart a desktop appban látszik.</Text>}
        {shown && first && last && (
          <Text>
            {inst.label}: {fmt(last.c, inst.decimals)} ({last.t}), {shown.candles.length} nap alatt{' '}
            <Text color={last.c >= first.c ? 'green' : 'red'}>{pct((last.c / first.c - 1) * 100)}</Text>
          </Text>
        )}
        <Text dimColor>
          Napi gyertyák: {sel === 'btc' ? 'Binance BTCUSDT' : 'CNBC'}, lekérve {shown?.fetchedAt ?? '-'}. A legutolsó gyertya még alakulhat.
        </Text>
        <Link href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(inst.tv)}`} label="Megnyitás TradingView-ban" />
        {err && <Text color="red">Hiba: {err}</Text>}
      </Box>
    )
  })
}
