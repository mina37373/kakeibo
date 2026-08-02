'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Page, Header } from '@/components/ui'

type AccountBalance = { id: string; name: string; type: string; balance: number }
type DetailLine = { memo: string; amount: number; sign: '+' | '-' }
type DetailEntry = { txnId: string; date: string; description: string; total: number; sign: '+' | '-'; lines: DetailLine[] }

export default function BalanceSheetPage() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<AccountBalance[]>([])
  const [loading, setLoading] = useState(true)
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const [startDate, setStartDate] = useState('2000-01-01')
  const [endDate, setEndDate] = useState(todayStr)
  const [openId, setOpenId] = useState<string | null>(null)
  const [openType, setOpenType] = useState<'asset' | 'liability'>('asset')
  const [details, setDetails] = useState<DetailEntry[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [expandedTxn, setExpandedTxn] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
      else fetchData()
    })
  }, [router, startDate, endDate])

  const fetchData = async () => {
    setLoading(true)
    const { data: accs } = await supabase.from('accounts').select('id, name, type').order('display_order')
    const { data: entries } = await supabase
      .from('journal_entries')
      .select('account_id, debit_amount, credit_amount, transactions!inner(date)')
      .gte('transactions.date', startDate)
      .lte('transactions.date', endDate)
    if (accs && entries) {
      const debitMap: Record<string, number> = {}
      const creditMap: Record<string, number> = {}
      entries.forEach((e: any) => {
        debitMap[e.account_id] = (debitMap[e.account_id] ?? 0) + (e.debit_amount ?? 0)
        creditMap[e.account_id] = (creditMap[e.account_id] ?? 0) + (e.credit_amount ?? 0)
      })
      const typeOrder: Record<string, number> = { asset: 0, liability: 1 }
      setAccounts(accs
        .filter((a: any) => a.type === 'asset' || a.type === 'liability')
        .sort((a: any, b: any) => (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9))
        .map((a: any) => {
          const d = debitMap[a.id] ?? 0
          const c = creditMap[a.id] ?? 0
          const balance = a.type === 'asset' ? d - c : c - d
          return { id: a.id, name: a.name, type: a.type, balance }
        }))
    }
    setLoading(false)
  }

  const toggleDetail = async (accountId: string, accountType: 'asset' | 'liability') => {
    if (openId === accountId) { setOpenId(null); setExpandedTxn(null); return }
    setOpenId(accountId)
    setOpenType(accountType)
    setDetails([])
    setDetailLoading(true)
    setExpandedTxn(null)
    const { data } = await supabase
      .from('journal_entries')
      .select('debit_amount, credit_amount, memo, transactions!inner(id, date, description, memo)')
      .eq('account_id', accountId)
      .gte('transactions.date', startDate)
      .lte('transactions.date', endDate)
      .order('transactions(date)', { ascending: false })
    if (data) {
      const grouped: Record<string, DetailEntry> = {}
      data.forEach((e: any) => {
        const txnId = e.transactions?.id
        const debit = e.debit_amount ?? 0
        const credit = e.credit_amount ?? 0
        if (debit === 0 && credit === 0) return
        // 資産は借方増(+)・貸方減(-), 負債は貸方増(+)・借方減(-)
        const amount = accountType === 'asset' ? debit - credit : credit - debit
        const sign: '+' | '-' = amount >= 0 ? '+' : '-'
        if (!grouped[txnId]) {
          grouped[txnId] = {
            txnId,
            date: e.transactions?.date ?? '',
            description: e.transactions?.description ?? '',
            total: 0,
            sign: '+',
            lines: [],
          }
        }
        grouped[txnId].total += amount
        const lineMemo = e.memo || e.transactions?.memo || ''
        grouped[txnId].lines.push({ memo: lineMemo, amount: Math.abs(amount), sign })
      })
      const result = Object.values(grouped).map(g => ({ ...g, sign: g.total >= 0 ? '+' as const : '-' as const, total: Math.abs(g.total) }))
      setDetails(result)
    }
    setDetailLoading(false)
  }

  const assets = accounts.filter(a => a.type === 'asset')
  const liabilities = accounts.filter(a => a.type === 'liability')
  const totalAssets = assets.reduce((s, a) => s + a.balance, 0)
  const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0)
  const netWorth = totalAssets - totalLiabilities

  const renderAccountRows = (list: AccountBalance[], type: 'asset' | 'liability') => list.map(a => (
    <div key={a.id}>
      <div onClick={() => toggleDetail(a.id, type)}
        className="flex justify-between items-center px-4 py-3 border-b cursor-pointer active:opacity-70"
        style={{ borderColor: 'var(--border)' }}>
        <span className="text-sm flex items-center gap-1.5" style={{ color: 'var(--text2)' }}>
          {a.name}
          <span className="text-xs" style={{ color: 'var(--text3)' }}>{openId === a.id ? '▲' : '▼'}</span>
        </span>
        <span className="text-sm font-medium" style={{ color: a.balance < 0 ? '#f87171' : a.type === 'liability' && a.balance > 0 ? '#f87171' : 'var(--text)' }}>
          {a.balance < 0 ? `-¥${Math.abs(a.balance).toLocaleString()}` : a.balance > 0 ? `¥${a.balance.toLocaleString()}` : '—'}
        </span>
      </div>
      {openId === a.id && (
        <div style={{ backgroundColor: 'var(--bg3)' }}>
          {detailLoading ? (
            <p className="text-xs text-center py-3" style={{ color: 'var(--text3)' }}>読み込み中...</p>
          ) : details.length === 0 ? (
            <p className="text-xs text-center py-3" style={{ color: 'var(--text3)' }}>明細なし</p>
          ) : details.map((d, i) => (
            <div key={i} className="border-b" style={{ borderColor: 'var(--border)' }}>
              <div
                onClick={() => setExpandedTxn(expandedTxn === d.txnId ? null : d.txnId)}
                className="flex justify-between items-center px-6 py-2 cursor-pointer active:opacity-70"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{d.description || '（内容なし）'}</p>
                  <p className="text-xs" style={{ color: 'var(--text3)' }}>{d.date}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <span className="text-xs font-medium" style={{ color: d.sign === '+' ? 'var(--accent)' : '#f87171' }}>
                    {d.sign === '+' ? '+' : '-'}¥{d.total.toLocaleString()}
                  </span>
                  {(d.lines.length > 1 || d.lines.some(l => l.memo)) && (
                    <span className="text-[10px]" style={{ color: 'var(--text3)' }}>{expandedTxn === d.txnId ? '▲' : '▼'}</span>
                  )}
                </div>
              </div>
              {expandedTxn === d.txnId && (
                <div className="pb-1" style={{ backgroundColor: 'var(--bg2)' }}>
                  {d.lines.map((line, j) => (
                    <div key={j} className="flex justify-between items-center px-8 py-1">
                      <p className="text-xs" style={{ color: 'var(--text3)' }}>{line.memo || '（内容なし）'}</p>
                      <p className="text-xs" style={{ color: line.sign === '+' ? 'var(--text3)' : '#f87171' }}>
                        {line.sign === '-' ? '-' : ''}¥{line.amount.toLocaleString()}
                      </p>
                    </div>
                  ))}
                  <div className="px-6 pt-1">
                    <button onClick={() => router.push(`/dashboard/transactions/${d.txnId}?from=balance-sheet`)}
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
      <Header title="貸借対照表" backPath="/dashboard" right={
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
                <p className="text-xs font-bold" style={{ color: 'var(--accent)' }}>資産の部</p>
              </div>
              <div style={{ backgroundColor: 'var(--bg2)' }}>
                {assets.length === 0 ? <p className="text-sm text-center py-4" style={{ color: 'var(--text3)' }}>データなし</p>
                  : renderAccountRows(assets, 'asset')}
                <div className="flex justify-between items-center px-4 py-3 border-t"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg3)' }}>
                  <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>資産合計</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>¥{totalAssets.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div className="px-4 py-3 border-b" style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)' }}>
                <p className="text-xs font-bold" style={{ color: 'var(--text2)' }}>負債の部</p>
              </div>
              <div style={{ backgroundColor: 'var(--bg2)' }}>
                {liabilities.length === 0 ? <p className="text-sm text-center py-4" style={{ color: 'var(--text3)' }}>データなし</p>
                  : renderAccountRows(liabilities, 'liability')}
                <div className="flex justify-between items-center px-4 py-3 border-t"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg3)' }}>
                  <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>負債合計</span>
                  <span className="text-sm font-bold" style={{ color: totalLiabilities > 0 ? '#f87171' : 'var(--text3)' }}>
                    {totalLiabilities < 0 ? `-¥${Math.abs(totalLiabilities).toLocaleString()}` : `¥${totalLiabilities.toLocaleString()}`}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border p-5"
              style={{ backgroundColor: 'var(--bg2)', borderColor: netWorth >= 0 ? 'var(--accent)' : '#f87171' }}>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs" style={{ color: 'var(--text3)' }}>資産 − 負債</p>
                  <p className="font-bold mt-0.5" style={{ color: 'var(--text)' }}>純資産</p>
                </div>
                <span className="text-2xl font-bold" style={{ color: netWorth >= 0 ? 'var(--accent)' : '#f87171' }}>
                  {netWorth >= 0 ? '' : '-'}¥{Math.abs(netWorth).toLocaleString()}
                </span>
              </div>
              {totalAssets > 0 && (
                <>
                  <div className="mt-3 rounded-xl overflow-hidden h-2" style={{ backgroundColor: 'var(--bg3)' }}>
                    <div className="h-full" style={{ width: `${Math.min(100, (totalLiabilities / totalAssets) * 100)}%`, backgroundColor: '#f87171' }} />
                  </div>
                  <p className="text-xs mt-1.5" style={{ color: 'var(--text3)' }}>
                    負債比率 {Math.round((totalLiabilities / totalAssets) * 100)}%
                  </p>
                </>
              )}
            </div>
          </>
        )}
      </main>
    </Page>
  )
}
