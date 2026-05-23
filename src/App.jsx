import { useState, useMemo } from 'react'
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from 'recharts'

// ── Constants ──────────────────────────────────────────────────────────────────

const RATES = { TWD: 1, USD: 32, JPY: 0.21 }

const TYPE_CFG = {
  cash:        { label: '現金',   color: '#22c55e', badge: 'bg-green-500/20 text-green-400' },
  stock:       { label: '股票',   color: '#3b82f6', badge: 'bg-blue-500/20 text-blue-400' },
  etf:         { label: 'ETF',    color: '#60a5fa', badge: 'bg-sky-500/20 text-sky-300' },
  crypto:      { label: '加密幣', color: '#f97316', badge: 'bg-orange-500/20 text-orange-400' },
  real_estate: { label: '不動產', color: '#a855f7', badge: 'bg-purple-500/20 text-purple-400' },
  debt:        { label: '負債',   color: '#ef4444', badge: 'bg-red-500/20 text-red-400' },
}

const TYPE_ORDER = ['cash', 'stock', 'etf', 'crypto', 'real_estate', 'debt']
const STOCK_TYPES = new Set(['stock', 'etf'])

const INITIAL_ACCOUNTS = [
  { id: 1, name: '台灣銀行存款', type: 'cash',  amount: 800000, currency: 'TWD', ticker: '',         shares: null },
  { id: 2, name: 'TSMC 股票',   type: 'stock', amount: 644000, currency: 'TWD', ticker: '2330.TW',  shares: 700 },
  { id: 3, name: 'VOO ETF',     type: 'etf',   amount: 8000,   currency: 'USD', ticker: 'VOO',      shares: 16 },
  { id: 4, name: 'Bitcoin',     type: 'crypto', amount: 3000,  currency: 'USD', ticker: '',         shares: null },
  { id: 5, name: '信用貸款',    type: 'debt',  amount: 500000, currency: 'TWD', ticker: '',         shares: null },
]

const BASE_HISTORY = [
  { date: '2025/12', value: 950000 },
  { date: '2026/01', value: 1050000 },
  { date: '2026/02', value: 1120000 },
  { date: '2026/03', value: 1200000 },
  { date: '2026/04', value: 1250000 },
  { date: '2026/05', value: 0 },
]
const PREV_MONTH_VALUE = BASE_HISTORY[BASE_HISTORY.length - 2].value

// ── Helpers ────────────────────────────────────────────────────────────────────

const toTWD = (amount, currency) => amount * (RATES[currency] ?? 1)
const fmt = (n) => Math.round(Math.abs(n)).toLocaleString('zh-TW')

async function fetchStockPrices(tickers) {
  const sym = encodeURIComponent(tickers.join(','))
  const base = `https://query1.finance.yahoo.com/v8/finance/quote?symbols=${sym}`
  const endpoints = [
    base,
    `https://query2.finance.yahoo.com/v8/finance/quote?symbols=${sym}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(base)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(base)}`,
  ]

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) continue
      const data = await res.json()
      const result = data.quoteResponse?.result
      if (!result?.length) continue
      const prices = {}
      result.forEach(q => {
        if (q.regularMarketPrice != null) {
          prices[q.symbol] = {
            price: q.regularMarketPrice,
            changePct: q.regularMarketChangePercent ?? 0,
            currency: q.currency,
          }
        }
      })
      if (Object.keys(prices).length > 0) return prices
    } catch {
      // try next endpoint
    }
  }
  throw new Error('無法取得股價資料')
}

// ── Badge ──────────────────────────────────────────────────────────────────────

function Badge({ type }) {
  const { label, badge } = TYPE_CFG[type]
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${badge}`}>{label}</span>
  )
}

// ── Spinner ────────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin align-middle mr-1.5" />
  )
}

// ── Account Modal ──────────────────────────────────────────────────────────────

function AccountModal({ account, onSave, onClose }) {
  const [form, setForm] = useState(
    account
      ? {
          name: account.name,
          type: account.type,
          amount: String(account.amount),
          currency: account.currency,
          ticker: account.ticker ?? '',
          shares: account.shares != null ? String(account.shares) : '',
        }
      : { name: '', type: 'cash', amount: '', currency: 'TWD', ticker: '', shares: '' }
  )

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }))
  const isStockType = STOCK_TYPES.has(form.type)

  const handleSave = () => {
    if (!form.name.trim()) return
    if (isStockType) {
      if (!form.ticker.trim() || !form.shares) return
    } else {
      if (!form.amount) return
    }
    onSave({
      name: form.name.trim(),
      type: form.type,
      amount: isStockType ? (Number(form.amount) || 0) : Number(form.amount),
      currency: form.currency,
      ticker: isStockType ? form.ticker.toUpperCase().trim() : '',
      shares: isStockType && form.shares ? Number(form.shares) : null,
    })
  }

  const inputCls =
    'w-full bg-[#252525] border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-white/30 transition-colors text-sm'

  return (
    <div
      className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#1c1c1c] border border-white/10 rounded-2xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-white text-lg font-semibold">
          {account ? '編輯資產' : '新增資產'}
        </h2>

        <div className="space-y-3">
          <div>
            <label className="text-gray-400 text-xs block mb-1.5">名稱</label>
            <input value={form.name} onChange={set('name')} placeholder="資產名稱" className={inputCls} />
          </div>

          <div>
            <label className="text-gray-400 text-xs block mb-1.5">類型</label>
            <select value={form.type} onChange={set('type')} className={inputCls}>
              {Object.entries(TYPE_CFG).map(([k, cfg]) => (
                <option key={k} value={k}>{cfg.label}</option>
              ))}
            </select>
          </div>

          {!isStockType && (
            <>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-gray-400 text-xs block mb-1.5">金額（市值）</label>
                  <input
                    type="number"
                    value={form.amount}
                    onChange={set('amount')}
                    placeholder="0"
                    min="0"
                    className={inputCls}
                  />
                </div>
                <div className="w-24">
                  <label className="text-gray-400 text-xs block mb-1.5">幣別</label>
                  <select value={form.currency} onChange={set('currency')} className={inputCls}>
                    {Object.keys(RATES).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {form.currency !== 'TWD' && form.amount && (
                <p className="text-gray-600 text-xs pl-1">
                  ≈ NT$ {fmt(toTWD(Number(form.amount), form.currency))} TWD
                </p>
              )}
            </>
          )}

          {isStockType && (
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-gray-400 text-xs block mb-1.5">Ticker 代號</label>
                  <input
                    value={form.ticker}
                    onChange={set('ticker')}
                    placeholder="如 2330.TW、VOO"
                    className={inputCls}
                  />
                </div>
                <div className="w-28">
                  <label className="text-gray-400 text-xs block mb-1.5">持股數量</label>
                  <input
                    type="number"
                    value={form.shares}
                    onChange={set('shares')}
                    placeholder="0"
                    min="0"
                    step="any"
                    className={inputCls}
                  />
                </div>
              </div>
              <p className="text-gray-600 text-xs">儲存後點右上角「更新現價」自動計算市值</p>
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 bg-white/5 hover:bg-white/10 text-gray-300 rounded-xl py-2.5 transition-colors text-sm"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="flex-1 bg-white text-black font-semibold rounded-xl py-2.5 hover:bg-gray-100 transition-colors text-sm"
          >
            儲存
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Pie Tooltip ────────────────────────────────────────────────────────────────

function PieTooltip({ active, payload, totalAssets }) {
  if (!active || !payload?.length) return null
  const pct = totalAssets > 0 ? (payload[0].value / totalAssets * 100).toFixed(1) : '0.0'
  return (
    <div className="bg-[#1c1c1c] border border-white/10 rounded-xl px-3 py-2 shadow-xl">
      <p className="text-white font-medium text-sm">{payload[0].name}</p>
      <p className="text-gray-300 text-sm">NT$ {fmt(payload[0].value)}</p>
      <p className="text-gray-500 text-xs">{pct}%</p>
    </div>
  )
}

// ── Line Tooltip ───────────────────────────────────────────────────────────────

function LineTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[#1c1c1c] border border-white/10 rounded-xl px-3 py-2 shadow-xl">
      <p className="text-gray-400 text-xs mb-0.5">{label}</p>
      <p className="text-white font-semibold text-sm">NT$ {fmt(payload[0].value)}</p>
    </div>
  )
}

// ── Dashboard ──────────────────────────────────────────────────────────────────

function Dashboard({ accounts, netWorth, totalAssets, totalLiabilities }) {
  const [range, setRange] = useState('all')

  const monthlyChange = netWorth - PREV_MONTH_VALUE
  const monthlyChangePct = PREV_MONTH_VALUE ? (monthlyChange / PREV_MONTH_VALUE * 100) : 0
  const isUp = monthlyChange >= 0

  const historyData = useMemo(() => {
    const full = BASE_HISTORY.map((d, i) =>
      i === BASE_HISTORY.length - 1 ? { ...d, value: netWorth } : d
    )
    if (range === '1m') return full.slice(-2)
    if (range === '3m') return full.slice(-4)
    return full
  }, [range, netWorth])

  const pieData = useMemo(() => {
    const groups = {}
    accounts.forEach(acc => {
      if (acc.type === 'debt') return
      const v = toTWD(acc.amount, acc.currency)
      groups[acc.type] = (groups[acc.type] || 0) + v
    })
    return Object.entries(groups).map(([type, value]) => ({
      name: TYPE_CFG[type].label,
      value: Math.round(value),
      color: TYPE_CFG[type].color,
    }))
  }, [accounts])

  const fmtY = (v) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
    if (v >= 1_000) return `${Math.round(v / 1_000)}K`
    return v
  }

  return (
    <div className="space-y-4">
      {/* Net Worth Card */}
      <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-2xl p-6">
        <p className="text-gray-500 text-sm mb-2">總淨資產</p>
        <p className={`text-5xl font-bold tracking-tight mb-3 ${netWorth < 0 ? 'text-red-400' : 'text-white'}`}>
          NT$ {netWorth < 0 ? '-' : ''}{fmt(netWorth)}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium ${isUp ? 'text-green-400' : 'text-red-400'}`}>
            {isUp ? '↑' : '↓'} NT$ {fmt(monthlyChange)}
          </span>
          <span className={`text-sm ${isUp ? 'text-green-500/70' : 'text-red-500/70'}`}>
            ({isUp ? '+' : ''}{monthlyChangePct.toFixed(2)}%)
          </span>
          <span className="text-gray-600 text-xs">vs 上個月</span>
        </div>

        <div className="mt-5 flex gap-8 pt-4 border-t border-white/[0.06]">
          <div>
            <p className="text-gray-500 text-xs mb-1">資產總計</p>
            <p className="text-white font-semibold">NT$ {fmt(totalAssets)}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs mb-1">負債總計</p>
            <p className="text-red-400 font-semibold">NT$ {fmt(totalLiabilities)}</p>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Pie */}
        <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-2xl p-6">
          <h3 className="text-white font-semibold mb-4">資產配置</h3>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={54}
                    outerRadius={82}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <ReTooltip content={<PieTooltip totalAssets={totalAssets} />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2.5 mt-3">
                {pieData.map(entry => (
                  <div key={entry.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                      <span className="text-gray-300 text-sm">{entry.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-white text-sm font-medium">NT$ {fmt(entry.value)}</span>
                      <span className="text-gray-600 text-xs w-10 text-right">
                        {totalAssets > 0 ? (entry.value / totalAssets * 100).toFixed(1) : '0.0'}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-gray-600 text-sm text-center py-8">尚無資產資料</p>
          )}
        </div>

        {/* Line */}
        <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">淨資產趨勢</h3>
            <div className="flex gap-0.5 bg-white/5 rounded-lg p-0.5">
              {[['1m','1M'],['3m','3M'],['all','全部']].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setRange(key)}
                  className={`text-xs px-2.5 py-1 rounded-md transition-colors font-medium ${
                    range === key ? 'bg-white text-black' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={historyData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tickFormatter={fmtY}
                tick={{ fill: '#6b7280', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <ReTooltip content={<LineTooltip />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#3b82f6"
                strokeWidth={2.5}
                dot={{ fill: '#3b82f6', r: 4, strokeWidth: 0 }}
                activeDot={{ fill: '#93c5fd', r: 6, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

// ── Assets Tab ─────────────────────────────────────────────────────────────────

function Assets({ accounts, onAdd, onEdit, onDelete, fetchedPrices }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const openAdd = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (acc) => { setEditing(acc); setModalOpen(true) }
  const close = () => { setEditing(null); setModalOpen(false) }

  const handleSave = (data) => {
    if (editing) onEdit(editing.id, data)
    else onAdd(data)
    close()
  }

  const groups = useMemo(() => {
    const g = {}
    accounts.forEach(acc => {
      if (!g[acc.type]) g[acc.type] = []
      g[acc.type].push(acc)
    })
    return g
  }, [accounts])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white font-semibold">
          資產分類{' '}
          <span className="text-gray-600 font-normal text-sm">({accounts.length})</span>
        </h2>
        <button
          onClick={openAdd}
          className="bg-white text-black text-sm font-semibold px-4 py-2 rounded-xl hover:bg-gray-100 transition-colors"
        >
          + 新增
        </button>
      </div>

      {accounts.length === 0 && (
        <div className="bg-[#1a1a1a] border border-white/[0.08] rounded-2xl p-12 text-center">
          <p className="text-gray-500 text-sm">尚無資產，點擊「+ 新增」開始追蹤</p>
        </div>
      )}

      {TYPE_ORDER.filter(t => groups[t]).map(type => {
        const groupAccounts = groups[type]
        const groupTotal = groupAccounts.reduce((s, a) => s + toTWD(a.amount, a.currency), 0)
        return (
          <div key={type} className="bg-[#1a1a1a] border border-white/[0.08] rounded-2xl overflow-hidden">
            {/* Group header */}
            <div className="px-5 py-3 border-b border-white/[0.05] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge type={type} />
                <span className="text-gray-500 text-xs">{groupAccounts.length} 筆</span>
              </div>
              <span className={`text-sm font-semibold ${type === 'debt' ? 'text-red-400' : 'text-white'}`}>
                NT$ {fmt(groupTotal)}
              </span>
            </div>

            {/* Account rows */}
            <div className="divide-y divide-white/[0.04]">
              {groupAccounts.map(acc => {
                const pi = acc.ticker ? fetchedPrices[acc.ticker] : null
                const hasTickerShares = acc.ticker && acc.shares
                return (
                  <div key={acc.id} className="flex items-start justify-between px-5 py-4 gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-white font-medium text-sm">{acc.name}</p>
                      {hasTickerShares ? (
                        <p className="text-gray-600 text-xs mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono">{acc.ticker}</span>
                          <span>·</span>
                          <span>{Number(acc.shares).toLocaleString()} 股</span>
                          {pi && (
                            <>
                              <span>·</span>
                              <span className={`font-medium ${pi.changePct >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                                {pi.changePct >= 0 ? '+' : ''}{pi.changePct.toFixed(2)}%
                              </span>
                            </>
                          )}
                        </p>
                      ) : (
                        <p className="text-gray-600 text-xs mt-0.5">
                          {acc.currency} {Number(acc.amount).toLocaleString()}
                          {acc.currency !== 'TWD' && (
                            <span className="ml-1 text-gray-700">
                              · NT$ {fmt(toTWD(acc.amount, acc.currency))}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className={`font-semibold text-sm mr-2 ${type === 'debt' ? 'text-red-400' : 'text-white'}`}>
                        NT$ {fmt(toTWD(acc.amount, acc.currency))}
                      </span>
                      <button
                        onClick={() => openEdit(acc)}
                        className="text-gray-600 hover:text-white text-xs px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                      >
                        編輯
                      </button>
                      <button
                        onClick={() => onDelete(acc.id)}
                        className="text-gray-600 hover:text-red-400 text-xs px-2.5 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                      >
                        刪除
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {modalOpen && <AccountModal account={editing} onSave={handleSave} onClose={close} />}
    </div>
  )
}

// ── App Root ───────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState('dashboard')
  const [accounts, setAccounts] = useState(INITIAL_ACCOUNTS)
  const [nextId, setNextId] = useState(INITIAL_ACCOUNTS.length + 1)

  // Price fetch state
  const [fetchedPrices, setFetchedPrices] = useState({})
  const [fetching, setFetching] = useState(false)
  const [fetchStatus, setFetchStatus] = useState(null) // null | 'ok' | 'error'
  const [fetchTime, setFetchTime] = useState('')
  const [fetchError, setFetchError] = useState('')

  const totalAssets = useMemo(
    () => accounts.filter(a => a.type !== 'debt').reduce((s, a) => s + toTWD(a.amount, a.currency), 0),
    [accounts]
  )
  const totalLiabilities = useMemo(
    () => accounts.filter(a => a.type === 'debt').reduce((s, a) => s + toTWD(a.amount, a.currency), 0),
    [accounts]
  )
  const netWorth = totalAssets - totalLiabilities

  const addAccount = (data) => {
    setAccounts(prev => [...prev, { ...data, id: nextId }])
    setNextId(n => n + 1)
  }
  const editAccount = (id, data) => {
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, ...data } : a))
  }
  const deleteAccount = (id) => {
    setAccounts(prev => prev.filter(a => a.id !== id))
  }

  const handleUpdatePrices = async () => {
    if (fetching) return
    const eligible = accounts.filter(a => STOCK_TYPES.has(a.type) && a.ticker && a.shares)
    if (eligible.length === 0) {
      setFetchError('請先在股票/ETF 帳戶填入 Ticker 和股數')
      setFetchStatus('error')
      setTimeout(() => setFetchStatus(null), 4000)
      return
    }

    setFetching(true)
    setFetchStatus(null)
    setFetchError('')

    try {
      const tickers = [...new Set(eligible.map(a => a.ticker))]
      const prices = await fetchStockPrices(tickers)

      setFetchedPrices(prev => ({ ...prev, ...prices }))

      // Update amounts: price × shares
      setAccounts(prev => prev.map(acc => {
        if (!acc.ticker || !acc.shares) return acc
        const pi = prices[acc.ticker]
        if (!pi) return acc
        const newAmt = Math.round(pi.price * Number(acc.shares) * 100) / 100
        const newCurrency = (pi.currency && pi.currency in RATES) ? pi.currency : acc.currency
        return { ...acc, amount: newAmt, currency: newCurrency }
      }))

      const now = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
      setFetchTime(now)
      setFetchStatus('ok')
      setTimeout(() => setFetchStatus(null), 5000)
    } catch (err) {
      setFetchError(err.message)
      setFetchStatus('error')
      setTimeout(() => setFetchStatus(null), 5000)
    } finally {
      setFetching(false)
    }
  }

  // Derive button appearance
  const btnContent = fetching
    ? <><Spinner />更新中…</>
    : fetchStatus === 'ok'
    ? `✓ ${fetchTime} 已更新`
    : fetchStatus === 'error'
    ? '✗ 更新失敗'
    : '↻ 更新現價'

  const btnCls = fetching
    ? 'bg-white/10 text-gray-500 cursor-not-allowed'
    : fetchStatus === 'ok'
    ? 'bg-green-500/15 text-green-400 border border-green-500/30'
    : fetchStatus === 'error'
    ? 'bg-red-500/15 text-red-400 border border-red-500/30'
    : 'bg-white/[0.07] hover:bg-white/[0.12] text-gray-300 border border-white/10 hover:border-white/20'

  return (
    <div className="min-h-screen bg-[#0f0f0f]">
      <div className="max-w-2xl mx-auto px-4 pt-10 pb-16">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">淨資產追蹤</h1>
            <p className="text-gray-600 text-sm mt-0.5">Net Worth Tracker</p>
          </div>
          <button
            onClick={handleUpdatePrices}
            disabled={fetching}
            className={`text-sm font-medium px-3.5 py-2 rounded-xl transition-all mt-1 ${btnCls}`}
          >
            {btnContent}
          </button>
        </div>

        {/* Error hint below header */}
        {fetchStatus === 'error' && fetchError && (
          <p className="text-red-400/80 text-xs mb-4 pl-0.5">{fetchError}</p>
        )}

        {/* Tab Bar */}
        <div className={`flex gap-1 bg-white/[0.05] rounded-xl p-1 w-fit ${fetchStatus === 'error' && fetchError ? 'mt-0' : 'mt-6'} mb-6`}>
          {[['dashboard','儀表板'],['assets','資產分類']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === key ? 'bg-white text-black' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === 'dashboard' ? (
          <Dashboard
            accounts={accounts}
            netWorth={netWorth}
            totalAssets={totalAssets}
            totalLiabilities={totalLiabilities}
          />
        ) : (
          <Assets
            accounts={accounts}
            onAdd={addAccount}
            onEdit={editAccount}
            onDelete={deleteAccount}
            fetchedPrices={fetchedPrices}
          />
        )}
      </div>
    </div>
  )
}
