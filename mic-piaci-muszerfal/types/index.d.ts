export type Quote = {
  id: string
  label: string
  last: number
  change: number
  changePct: number
  decimals: number
}

export type Candle = { t: string; o: number; h: number; l: number; c: number }

export type Chart = { id: string; label: string; candles: Candle[]; fetchedAt: string }

export type Hangulat = {
  date: string
  index: number
  zone: string
  comps: Record<string, number>
  series: [string, number][]
}

declare module 'claude-code' {
  interface PluginState {
    'mic-piaci-muszerfal': {
      quotes: Quote[] | null
      updatedAt: string | null
      error: string | null
      selected: string
      chart: Chart | null
      isBandHidden: boolean
      hangulat: Hangulat | null
      hangulatError: string | null
    }
  }
}
