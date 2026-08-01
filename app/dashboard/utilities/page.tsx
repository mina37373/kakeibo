'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Page, Header } from '@/components/ui'

type Account = { id: string; name: string }
type MonthData = { month: string; amount: number }

const COLORS = [
  'var(--accent)', '#f87171', '#fb923c', '#facc15', '#4ade80', '#60a5fa', '#c084fc', '#f472b6'
]

export default function UtilitiesPage() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [data, setData] = useState<Record<string, MonthData[]>>({})
  const [months, setMonths] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
      else fetchAccounts()
    })
  }, [router])

  useEffect(() => {
    if (selected.length > 0) fetchData()
  }, [selected])

  const fetchAccounts = async () => {
    const { data } = await supabase.from('accounts').select('id, name').eq('type', 'expense').order('display_order')
    if (data) setAccounts(data)
  }

  const toggle = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const fetchData = async () => {
    setLoading(true)
    // 過去12ヶ月のリスト生成
    const now = new Date()
    const mList: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      mList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    setMonths(mList)

    const result: Record<string, MonthData[]> = {}

    for (const accId of selected) {
      const monthData: MonthData[] = []
      for (const m of mList) {
        const { data: entries } = await supabase
          .from('journal_entries')
          .select('debit_amount, transactions!inner(date)')
          .eq('account_id', accId)
          .gte('transactions.date', `${m}-01`)
          .lte('transactions.date', `${m}-31`)
        const total = (entries ?? []).reduce((s: number, e: any) => s + (e.debit_amount ?? 0), 0)
        monthData.push({ month: m, amount: total })
      }
      result[accId] = monthData
    }

    setData(result)
    setLoading(false)
  }

  const maxAmount = Math.max(
    1,
    ...selected.flatMap(id => (data[id] ?? []).map(d => d.amount))
  )

  const fmt = (m: string) => {
    const [y, mo] = m.split('-')
    return `${y === String(new Date().getFullYear()) ? '' : y + '/'}${Number(mo)}月`
  }

  // 選択されたカテゴリの平均・合計
  const stats = selected.map((id, i) => {
    const rows = data[id] ?? []
    const nonZero = rows.filter(r => r.amount > 0)
    const avg = nonZero.length > 0 ? Math.round(nonZero.reduce((s, r) => s + r.amount, 0) / nonZero.length) : 0
    const max = Math.max(...rows.map(r => r.amount), 0)
    const min = nonZero.length > 0 ? Math.min(...nonZero.map(r => r.amount)) : 0
    return { id, name: accounts.find(a => a.id === id)?.name ?? '', avg, max, min, color: COLORS[i % COLORS.length] }
  })

  return (
    <Page>
      <Header title="固定変動費の推移" backPath="/dashboard" />
      <main className="max-w-lg mx-auto p-4 flex flex-col gap-4">

        {/* カテゴリ選択 */}
        <div className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
          <p className="text-xs font-medium mb-3" style={{ color: 'var(--text2)' }}>追跡するカテゴリを選択</p>
          <div className="flex flex-wrap gap-2">
            {accounts.map((acc, i) => {
              const idx = selected.indexOf(acc.id)
              const isSelected = idx >= 0
              return (
                <button key={acc.id} onClick={() => toggle(acc.id)}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors"
                  style={{
                    backgroundColor: isSelected ? COLORS[idx % COLORS.length] : 'var(--bg3)',
                    borderColor: isSelected ? COLORS[idx % COLORS.length] : 'var(--border)',
                    color: isSelected ? '#fff' : 'var(--text)',
                  }}>
                  {acc.name}
                </button>
              )
            })}
          </div>
        </div>

        {selected.length === 0 && (
          <p className="text-sm text-center py-6" style={{ color: 'var(--text3)' }}>カテゴリを選択してください</p>
        )}

        {loading && <p className="text-sm text-center py-6" style={{ color: 'var(--text3)' }}>読み込み中...</p>}

        {/* グラフ */}
        {!loading && selected.length > 0 && months.length > 0 && (
          <div className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
            <p className="text-xs font-medium mb-4" style={{ color: 'var(--text2)' }}>過去12ヶ月の推移</p>

            {/* 凡例 */}
            <div className="flex flex-wrap gap-3 mb-4">
              {stats.map(s => (
                <div key={s.id} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-xs" style={{ color: 'var(--text2)' }}>{s.name}</span>
                </div>
              ))}
            </div>

            {/* バーグラフ */}
            <div className="overflow-x-auto">
              <div style={{ minWidth: `${months.length * 52}px` }}>
                <div className="flex items-end gap-1" style={{ height: '140px' }}>
                  {months.map(m => (
                    <div key={m} className="flex-1 flex flex-col items-center gap-0.5" style={{ minWidth: '44px' }}>
                      <div className="w-full flex gap-0.5 items-end" style={{ height: '120px' }}>
                        {selected.map((id, i) => {
                          const row = data[id]?.find(d => d.month === m)
                          const h = row?.amount ? Math.max(2, Math.round((row.amount / maxAmount) * 120)) : 0
                          return (
                            <div key={id} className="flex-1 rounded-t-sm transition-all"
                              style={{ height: `${h}px`, backgroundColor: COLORS[i % COLORS.length], opacity: 0.85 }} />
                          )
                        })}
                      </div>
                      <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text3)', fontSize: '10px' }}>{fmt(m)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 統計サマリー */}
        {!loading && stats.length > 0 && (
          <div className="flex flex-col gap-2">
            {stats.map(s => (
              <div key={s.id} className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{s.name}</p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[{ label: '平均', val: s.avg }, { label: '最高', val: s.max }, { label: '最低', val: s.min }].map(({ label, val }) => (
                    <div key={label} className="rounded-xl p-2.5 text-center" style={{ backgroundColor: 'var(--bg3)' }}>
                      <p className="text-xs" style={{ color: 'var(--text3)' }}>{label}</p>
                      <p className="text-sm font-bold mt-0.5" style={{ color: 'var(--text)' }}>¥{val.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 月別テーブル */}
        {!loading && selected.length > 0 && months.length > 0 && (
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <div className="px-4 py-3 border-b" style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)' }}>
              <p className="text-xs font-bold" style={{ color: 'var(--text2)' }}>月別明細</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ backgroundColor: 'var(--bg2)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg3)' }}>
                    <th className="px-3 py-2 text-left" style={{ color: 'var(--text3)' }}>月</th>
                    {stats.map(s => (
                      <th key={s.id} className="px-3 py-2 text-right" style={{ color: s.color }}>{s.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...months].reverse().map(m => (
                    <tr key={m} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="px-3 py-2" style={{ color: 'var(--text2)' }}>{fmt(m)}</td>
                      {selected.map((id, i) => {
                        const amt = data[id]?.find(d => d.month === m)?.amount ?? 0
                        return (
                          <td key={id} className="px-3 py-2 text-right font-medium"
                            style={{ color: amt > 0 ? 'var(--text)' : 'var(--text3)' }}>
                            {amt > 0 ? `¥${amt.toLocaleString()}` : '—'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </Page>
  )
}
