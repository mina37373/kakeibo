'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Page, Header } from '@/components/ui'
import { useTheme } from '@/lib/theme'

type CategoryTotal = { name: string; total: number; color: string; prevTotal: number; budget: number }
type MonthlyData = { month: string; expense: number; income: number }

// テーマのアクセントカラーを起点にパレット生成
function makeColors(accent: string): string[] {
  // CSS変数は実行時にしか取得できないので、固定パレットをCSS変数ベースで指定
  return [
    'var(--accent)',
    'var(--text2)',
    'var(--text3)',
    '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#6366f1'
  ]
}

export default function AnalyticsPage() {
  const router = useRouter()
  const { themeId } = useTheme()
  const [tab, setTab] = useState<'expense' | 'income' | 'trend' | 'yearly'>('expense')
  const [categoryTotals, setCategoryTotals] = useState<CategoryTotal[]>([])
  const [totalExpense, setTotalExpense] = useState(0)
  const [totalIncome, setTotalIncome] = useState(0)
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([])
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [loading, setLoading] = useState(true)
  const [accentColor, setAccentColor] = useState('#3b82f6')

  useEffect(() => {
    const color = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    if (color) setAccentColor(color)
  }, [themeId])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
      else fetchAnalytics()
    })
  }, [router, month, tab])

  const fetchAnalytics = async () => {
    setLoading(true)
    const startDate = `${month}-01`
    const endDate = `${month}-31`
    const prevMonth = (() => { const d = new Date(month + '-01'); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7) })()

    // 今月データ
    const { data } = await supabase
      .from('journal_entries')
      .select('debit_amount, credit_amount, accounts ( name, type ), transactions!inner ( date )')
      .gte('transactions.date', startDate)
      .lte('transactions.date', endDate)

    // 先月データ
    const { data: prevData } = await supabase
      .from('journal_entries')
      .select('debit_amount, credit_amount, accounts ( name, type ), transactions!inner ( date )')
      .gte('transactions.date', `${prevMonth}-01`)
      .lte('transactions.date', `${prevMonth}-31`)

    // 予算データ
    const { data: budgetData } = await supabase
      .from('budgets')
      .select('amount, accounts ( name )')
      .eq('year_month', month)

    const budgetMap: Record<string, number> = {}
    budgetData?.forEach((b: any) => {
      if (b.accounts?.name) budgetMap[b.accounts.name] = b.amount
    })

    if (data) {
      const expEntries = data.filter((e: any) => e.accounts?.type === 'expense' && e.debit_amount > 0)
      const incEntries = data.filter((e: any) => e.accounts?.type === 'income' && e.credit_amount > 0)

      const expTotals: Record<string, number> = {}
      let expTotal = 0
      expEntries.forEach((e: any) => {
        const name = e.accounts?.name ?? '不明'
        expTotals[name] = (expTotals[name] ?? 0) + e.debit_amount
        expTotal += e.debit_amount
      })

      const prevExpTotals: Record<string, number> = {}
      prevData?.filter((e: any) => e.accounts?.type === 'expense' && e.debit_amount > 0)
        .forEach((e: any) => {
          const name = e.accounts?.name ?? '不明'
          prevExpTotals[name] = (prevExpTotals[name] ?? 0) + e.debit_amount
        })

      const incTotals: Record<string, number> = {}
      let incTotal = 0
      incEntries.forEach((e: any) => {
        const name = e.accounts?.name ?? '不明'
        incTotals[name] = (incTotals[name] ?? 0) + e.credit_amount
        incTotal += e.credit_amount
      })

      setTotalExpense(expTotal)
      setTotalIncome(incTotal)

      const sourceMap = tab === 'income' ? incTotals : expTotals
      const COLORS = ['#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#6366f1', '#14b8a6', '#e11d48', '#0ea5e9']
      const sorted = Object.entries(sourceMap)
        .map(([name, total], i) => ({
          name, total,
          prevTotal: prevExpTotals[name] ?? 0,
          budget: budgetMap[name] ?? 0,
          color: i === 0 ? accentColor : COLORS[i % COLORS.length]
        }))
        .sort((a, b) => b.total - a.total)
      setCategoryTotals(sorted)
    }

    // 過去6ヶ月
    const months: string[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(month + '-01')
      d.setMonth(d.getMonth() - i)
      months.push(d.toISOString().slice(0, 7))
    }

    const { data: allData } = await supabase
      .from('journal_entries')
      .select('debit_amount, credit_amount, accounts ( type ), transactions!inner ( date )')
      .gte('transactions.date', months[0] + '-01')
      .lte('transactions.date', month + '-31')

    if (allData) {
      const result: MonthlyData[] = months.map(m => {
        const entries = allData.filter((e: any) => e.transactions?.date?.startsWith(m))
        const exp = entries.filter((e: any) => e.accounts?.type === 'expense' && e.debit_amount > 0)
          .reduce((s: number, e: any) => s + e.debit_amount, 0)
        const inc = entries.filter((e: any) => e.accounts?.type === 'income' && e.credit_amount > 0)
          .reduce((s: number, e: any) => s + e.credit_amount, 0)
        return { month: m.slice(5), expense: exp, income: inc }
      })
      setMonthlyData(result)
    }

    setLoading(false)
  }

  const grandTotal = tab === 'expense' ? totalExpense : totalIncome

  const renderPieChart = () => {
    if (categoryTotals.length === 0) return null
    const size = 200
    const r = 80
    const cx = size / 2
    const cy = size / 2
    let startAngle = -Math.PI / 2
    const slices = categoryTotals.map(cat => {
      const angle = grandTotal > 0 ? (cat.total / grandTotal) * 2 * Math.PI : 0
      const endAngle = startAngle + angle
      const x1 = cx + r * Math.cos(startAngle)
      const y1 = cy + r * Math.sin(startAngle)
      const x2 = cx + r * Math.cos(endAngle)
      const y2 = cy + r * Math.sin(endAngle)
      const largeArc = angle > Math.PI ? 1 : 0
      const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`
      const slice = { ...cat, d }
      startAngle = endAngle
      return slice
    })
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.map((s, i) => (
          <path key={i} d={s.d} fill={s.color} stroke="var(--bg)" strokeWidth="2" />
        ))}
        <circle cx={cx} cy={cy} r={45} fill="var(--bg2)" />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="10" fill="var(--text3)">合計</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="11" fontWeight="bold" fill="var(--text)">
          ¥{(grandTotal / 10000).toFixed(1)}万
        </text>
      </svg>
    )
  }

  const maxVal = Math.max(...monthlyData.map(m => Math.max(m.expense, m.income)), 1)
  const balance = totalIncome - totalExpense

  return (
    <Page>
      <Header title="集計・グラフ" backPath="/dashboard" />
      <main className="max-w-lg mx-auto p-4 flex flex-col gap-4">

        {/* 月選択 */}
        <div className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text3)' }}>対象月</label>
          <input
            type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="rounded-xl border px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)' }}
          />
        </div>

        {/* 収支サマリー */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border p-4 text-center" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
            <p className="text-xs mb-1" style={{ color: 'var(--text3)' }}>支出</p>
            <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>¥{totalExpense.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border p-4 text-center" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
            <p className="text-xs mb-1" style={{ color: 'var(--text3)' }}>収入</p>
            <p className="text-xl font-bold" style={{ color: 'var(--accent)' }}>¥{totalIncome.toLocaleString()}</p>
          </div>
        </div>
        <div className="rounded-2xl border p-4 text-center" style={{ backgroundColor: 'var(--bg2)', borderColor: balance >= 0 ? 'var(--accent)' : 'var(--border)' }}>
          <p className="text-xs mb-1" style={{ color: 'var(--text3)' }}>収支バランス</p>
          <p className="text-2xl font-bold" style={{ color: balance >= 0 ? 'var(--accent)' : 'var(--text)' }}>
            {balance >= 0 ? '+' : ''}¥{balance.toLocaleString()}
          </p>
        </div>

        {/* タブ */}
        <div className="grid grid-cols-4 rounded-2xl overflow-hidden border" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
          {(['expense', 'income', 'trend', 'yearly'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="py-2.5 text-xs font-medium transition-colors"
              style={{ backgroundColor: tab === t ? 'var(--accent)' : 'transparent', color: tab === t ? '#fff' : 'var(--text3)' }}>
              {t === 'expense' ? '支出' : t === 'income' ? '収入' : t === 'trend' ? '推移' : '年間'}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-center py-8" style={{ color: 'var(--text3)' }}>読み込み中...</p>
        ) : tab === 'yearly' ? (
          <div className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
            <h2 className="text-xs font-medium mb-3" style={{ color: 'var(--text3)' }}>{month.slice(0, 4)}年 年間合計</h2>
            <div className="flex flex-col gap-2">
              {monthlyData.map(m => (
                <div key={m.month} className="flex items-center gap-3">
                  <span className="text-xs w-8 shrink-0" style={{ color: 'var(--text3)' }}>{m.month}月</span>
                  <div className="flex-1 flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-full h-1.5" style={{ backgroundColor: 'var(--bg3)' }}>
                        <div className="rounded-full h-1.5 opacity-70" style={{ width: `${maxVal > 0 ? (m.expense / maxVal) * 100 : 0}%`, backgroundColor: 'var(--text2)' }} />
                      </div>
                      <span className="text-xs w-20 text-right" style={{ color: 'var(--text)' }}>¥{m.expense.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 rounded-full h-1.5" style={{ backgroundColor: 'var(--bg3)' }}>
                        <div className="rounded-full h-1.5" style={{ width: `${maxVal > 0 ? (m.income / maxVal) * 100 : 0}%`, backgroundColor: 'var(--accent)' }} />
                      </div>
                      <span className="text-xs w-20 text-right" style={{ color: 'var(--accent)' }}>¥{m.income.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t flex justify-between" style={{ borderColor: 'var(--border)' }}>
              <div className="text-center">
                <p className="text-xs" style={{ color: 'var(--text3)' }}>年間支出</p>
                <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>¥{monthlyData.reduce((s, m) => s + m.expense, 0).toLocaleString()}</p>
              </div>
              <div className="text-center">
                <p className="text-xs" style={{ color: 'var(--text3)' }}>年間収入</p>
                <p className="text-sm font-bold" style={{ color: 'var(--accent)' }}>¥{monthlyData.reduce((s, m) => s + m.income, 0).toLocaleString()}</p>
              </div>
              <div className="text-center">
                <p className="text-xs" style={{ color: 'var(--text3)' }}>年間収支</p>
                {(() => { const b = monthlyData.reduce((s, m) => s + m.income - m.expense, 0); return <p className="text-sm font-bold" style={{ color: b >= 0 ? 'var(--accent)' : '#f87171' }}>{b >= 0 ? '+' : ''}¥{b.toLocaleString()}</p> })()}
              </div>
            </div>
          </div>
        ) : tab === 'trend' ? (
          <div className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
            <h2 className="text-xs font-medium mb-4" style={{ color: 'var(--text3)' }}>過去6ヶ月の推移</h2>
            <div className="flex items-end gap-2" style={{ height: '140px' }}>
              {monthlyData.map(m => (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex gap-0.5 items-end" style={{ height: '120px' }}>
                    <div className="flex-1 rounded-t opacity-70"
                      style={{ height: `${maxVal > 0 ? (m.expense / maxVal) * 100 : 0}%`, minHeight: m.expense > 0 ? '2px' : '0', backgroundColor: 'var(--text3)' }} />
                    <div className="flex-1 rounded-t"
                      style={{ height: `${maxVal > 0 ? (m.income / maxVal) * 100 : 0}%`, minHeight: m.income > 0 ? '2px' : '0', backgroundColor: 'var(--accent)' }} />
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text3)' }}>{m.month}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-4 justify-center mt-2 text-xs" style={{ color: 'var(--text3)' }}>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded inline-block opacity-70" style={{ backgroundColor: 'var(--text3)' }} />支出
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded inline-block" style={{ backgroundColor: 'var(--accent)' }} />収入
              </span>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
            <h2 className="text-xs font-medium mb-3" style={{ color: 'var(--text3)' }}>
              {tab === 'expense' ? '支出' : '収入'}カテゴリ別内訳
            </h2>
            {categoryTotals.length === 0 ? (
              <p className="text-center py-4" style={{ color: 'var(--text3)' }}>この月のデータはありません</p>
            ) : (
              <>
                <div className="flex justify-center mb-4">{renderPieChart()}</div>
                <div className="flex flex-col gap-3">
                  {categoryTotals.map(cat => {
                    const diff = cat.total - cat.prevTotal
                    const hasBudget = cat.budget > 0
                    const budgetPct = hasBudget ? Math.round((cat.total / cat.budget) * 100) : 0
                    return (
                      <div key={cat.name}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full inline-block shrink-0" style={{ background: cat.color }} />
                            <span style={{ color: 'var(--text)' }}>{cat.name}</span>
                          </span>
                          <div className="text-right">
                            <span className="font-medium" style={{ color: 'var(--text)' }}>¥{cat.total.toLocaleString()}</span>
                            {cat.prevTotal > 0 && (
                              <span className="text-xs ml-2" style={{ color: diff > 0 ? '#f87171' : '#34d399' }}>
                                {diff > 0 ? '▲' : '▼'}¥{Math.abs(diff).toLocaleString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="rounded-full h-1.5 relative" style={{ backgroundColor: 'var(--bg3)' }}>
                          <div className="rounded-full h-1.5" style={{ width: `${grandTotal > 0 ? Math.min((cat.total / grandTotal) * 100, 100) : 0}%`, background: cat.color }} />
                          {hasBudget && (
                            <div className="absolute top-0 h-1.5 w-0.5 rounded" style={{ left: `${Math.min((cat.budget / (grandTotal || cat.budget)) * 100, 100)}%`, backgroundColor: 'var(--text2)' }} />
                          )}
                        </div>
                        <div className="flex justify-between text-xs mt-0.5">
                          <span style={{ color: 'var(--text3)' }}>{grandTotal > 0 ? Math.round((cat.total / grandTotal) * 100) : 0}%</span>
                          {hasBudget && (
                            <span style={{ color: budgetPct > 100 ? '#f87171' : 'var(--text3)' }}>
                              予算¥{cat.budget.toLocaleString()} ({budgetPct}%)
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </Page>
  )
}
