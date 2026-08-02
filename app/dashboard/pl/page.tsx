'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Page, Header } from '@/components/ui'

type CategoryRow = { accountId: string; name: string; amount: number }
type DetailLine = { memo: string; amount: number }
type DetailEntry = { txnId: string; date: string; description: string; total: number; lines: DetailLine[] }

export default function PLPage() {
  const router = useRouter()
  const today = new Date()
  const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const [startDate, setStartDate] = useState(firstOfMonth)
  const [endDate, setEndDate] = useState(todayStr)
  const [incomeRows, setIncomeRows] = useState<CategoryRow[]>([])
  const [expenseRows, setExpenseRows] = useState<CategoryRow[]>([])
  const [totalIncome, setTotalIncome] = useState(0)
  const [totalExpense, setTotalExpense] = useState(0)
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [details, setDetails] = useState<DetailEntry[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
      else fetchPL()
    })
  }, [router, startDate, endDate])

  const fetchPL = async () => {
    setLoading(true)
    setOpenId(null)
    const { data } = await supabase
      .from('journal_entries')
      .select('debit_amount, credit_amount, account_id, accounts(id, name, type), transactions!inner(date)')
      .gte('transactions.date', startDate)
      .lte('transactions.date', endDate)

    if (data) {
      const incMap: Record<string, { name: string; amount: number; accountId: string }> = {}
      const expMap: Record<string, { name: string; amount: number; accountId: string }> = {}
      let incTotal = 0, expTotal = 0

      data.forEach((e: any) => {
        const type = e.accounts?.type
        const name = e.accounts?.name ?? '不明'
        const accountId = e.account_id
        if (type === 'income' && e.credit_amount > 0) {
          if (!incMap[accountId]) incMap[accountId] = { name, amount: 0, accountId }
          incMap[accountId].amount += e.credit_amount
          incTotal += e.credit_amount
        }
        if (type === 'expense' && e.debit_amount > 0) {
          if (!expMap[accountId]) expMap[accountId] = { name, amount: 0, accountId }
          expMap[accountId].amount += e.debit_amount
          expTotal += e.debit_amount
        }
      })

      setIncomeRows(Object.values(incMap).map(v => ({ accountId: v.accountId, name: v.name, amount: v.amount })).sort((a, b) => b.amount - a.amount))
      setExpenseRows(Object.values(expMap).map(v => ({ accountId: v.accountId, name: v.name, amount: v.amount })).sort((a, b) => b.amount - a.amount))
      setTotalIncome(incTotal)
      setTotalExpense(expTotal)
    }
    setLoading(false)
  }

  const [expandedTxn, setExpandedTxn] = useState<string | null>(null)

  const toggleDetail = async (accountId: string, type: 'income' | 'expense') => {
    if (openId === accountId) { setOpenId(null); setExpandedTxn(null); return }
    setOpenId(accountId)
    setDetails([])
    setDetailLoading(true)
    setExpandedTxn(null)
    const amtField = type === 'income' ? 'credit_amount' : 'debit_amount'
    const { data } = await supabase
      .from('journal_entries')
      .select('debit_amount, credit_amount, memo, transactions!inner(id, date, description)')
      .eq('account_id', accountId)
      .gte('transactions.date', startDate)
      .lte('transactions.date', endDate)
      .order('transactions(date)', { ascending: false })
    if (data) {
      // 同一取引（txnId）でグループ化
      const grouped: Record<string, DetailEntry> = {}
      data.filter((e: any) => (e[amtField] ?? 0) > 0).forEach((e: any) => {
        const txnId = e.transactions?.id
        if (!grouped[txnId]) {
          grouped[txnId] = {
            txnId,
            date: e.transactions?.date ?? '',
            description: e.transactions?.description ?? '',
            total: 0,
            lines: [],
          }
        }
        grouped[txnId].total += e[amtField] ?? 0
        grouped[txnId].lines.push({ memo: e.memo ?? '', amount: e[amtField] ?? 0 })
      })
      setDetails(Object.values(grouped))
    }
    setDetailLoading(false)
  }

  const net = totalIncome - totalExpense

  const renderRows = (rows: CategoryRow[], type: 'income' | 'expense') =>
    rows.map(row => (
      <div key={row.accountId}>
        <div
          onClick={() => toggleDetail(row.accountId, type)}
          className="flex justify-between items-center px-4 py-2.5 border-b cursor-pointer active:opacity-70"
          style={{ borderColor: 'var(--border)' }}
        >
          <span className="text-sm flex items-center gap-1.5" style={{ color: 'var(--text2)' }}>
            {row.name}
            <span className="text-xs" style={{ color: 'var(--text3)' }}>{openId === row.accountId ? '▲' : '▼'}</span>
          </span>
          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>¥{row.amount.toLocaleString()}</span>
        </div>
        {openId === row.accountId && (
          <div style={{ backgroundColor: 'var(--bg3)' }}>
            {detailLoading ? (
              <p className="text-xs text-center py-3" style={{ color: 'var(--text3)' }}>読み込み中...</p>
            ) : details.length === 0 ? (
              <p className="text-xs text-center py-3" style={{ color: 'var(--text3)' }}>明細なし</p>
            ) : details.map((d, i) => (
              <div key={i} className="border-b" style={{ borderColor: 'var(--border)' }}>
                {/* グループ行：同日・同店・合計 */}
                <div
                  onClick={() => setExpandedTxn(expandedTxn === d.txnId ? null : d.txnId)}
                  className="flex justify-between items-center px-6 py-2 cursor-pointer active:opacity-70"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{d.description || '（内容なし）'}</p>
                    <p className="text-xs" style={{ color: 'var(--text3)' }}>{d.date}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <span className="text-xs font-medium" style={{ color: type === 'income' ? 'var(--accent)' : 'var(--text2)' }}>
                      ¥{d.total.toLocaleString()}
                    </span>
                    {d.lines.length > 1 && <span className="text-[10px]" style={{ color: 'var(--text3)' }}>{expandedTxn === d.txnId ? '▲' : '▼'}</span>}
                  </div>
                </div>
                {/* 展開：内容・各金額 */}
                {expandedTxn === d.txnId && (
                  <div className="pb-1" style={{ backgroundColor: 'var(--bg2)' }}>
                    {d.lines.map((line, j) => (
                      <div key={j} className="flex justify-between items-center px-8 py-1">
                        <p className="text-xs" style={{ color: 'var(--text3)' }}>{line.memo || `明細${j + 1}`}</p>
                        <p className="text-xs" style={{ color: 'var(--text3)' }}>¥{line.amount.toLocaleString()}</p>
                      </div>
                    ))}
                    <div className="px-6 pt-1">
                      <button onClick={() => router.push(`/dashboard/transactions/${d.txnId}?from=pl`)}
                        className="text-xs" style={{ color: 'var(--accent)' }}>
                        取引詳細 →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    ))

  return (
    <Page>
      <Header title="損益計算書" backPath="/dashboard" right={
        <button onClick={() => window.print()} className="no-print text-xs border rounded-lg px-3 py-1.5"
          style={{ color: 'var(--text3)', borderColor: 'var(--border)' }}>🖨 印刷/PDF</button>
      } />
      <main className="max-w-lg mx-auto p-4 flex flex-col gap-4">

        <div className="rounded-2xl border p-4 flex gap-3" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
          <div className="flex-1">
            <label className="block text-xs mb-1" style={{ color: 'var(--text3)' }}>開始日</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
              style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)' }} />
          </div>
          <div className="flex-1">
            <label className="block text-xs mb-1" style={{ color: 'var(--text3)' }}>終了日</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
              style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)' }} />
          </div>
        </div>

        {loading ? (
          <p className="text-center py-8" style={{ color: 'var(--text3)' }}>読み込み中...</p>
        ) : (
          <>
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div className="px-4 py-3 border-b" style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)' }}>
                <p className="text-xs font-bold" style={{ color: 'var(--accent)' }}>収入の部</p>
              </div>
              <div style={{ backgroundColor: 'var(--bg2)' }}>
                {incomeRows.length === 0 ? (
                  <p className="text-sm text-center py-4" style={{ color: 'var(--text3)' }}>データなし</p>
                ) : renderRows(incomeRows, 'income')}
                <div className="flex justify-between px-4 py-3 border-t" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg3)' }}>
                  <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>収入合計</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>¥{totalIncome.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div className="px-4 py-3 border-b" style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)' }}>
                <p className="text-xs font-bold" style={{ color: 'var(--text2)' }}>支出の部</p>
              </div>
              <div style={{ backgroundColor: 'var(--bg2)' }}>
                {expenseRows.length === 0 ? (
                  <p className="text-sm text-center py-4" style={{ color: 'var(--text3)' }}>データなし</p>
                ) : renderRows(expenseRows, 'expense')}
                <div className="flex justify-between px-4 py-3 border-t" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg3)' }}>
                  <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>支出合計</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>¥{totalExpense.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border p-5" style={{ backgroundColor: 'var(--bg2)', borderColor: net >= 0 ? 'var(--accent)' : 'var(--border)' }}>
              <div className="flex justify-between items-center">
                <span className="font-bold" style={{ color: 'var(--text)' }}>当期収支</span>
                <span className="text-2xl font-bold" style={{ color: net >= 0 ? 'var(--accent)' : 'var(--text)' }}>
                  {net >= 0 ? '+' : ''}¥{net.toLocaleString()}
                </span>
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
                {net >= 0 ? '黒字' : '赤字'} / 収入{totalIncome > 0 ? Math.round((totalExpense / totalIncome) * 100) : 0}%を支出
              </p>
            </div>
          </>
        )}
      </main>
    </Page>
  )
}
