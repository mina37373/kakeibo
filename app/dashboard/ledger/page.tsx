'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Page, Header } from '@/components/ui'

type Account = { id: string; name: string; type: string }
type LedgerEntry = {
  id: string
  txnId: string
  date: string
  description: string
  debit_amount: number
  credit_amount: number
  balance: number
  counterpart: string
}

const TYPE_LABEL: Record<string, string> = {
  expense: '支出', income: '収入', asset: '資産', liability: '負債',
}

export default function LedgerPage() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const today = new Date()
  const firstOfMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const [startDate, setStartDate] = useState(firstOfMonth)
  const [endDate, setEndDate] = useState(todayStr)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
      else fetchAccounts()
    })
  }, [router])

  useEffect(() => {
    if (selectedId) fetchLedger()
  }, [selectedId, startDate, endDate])

  const fetchAccounts = async () => {
    const { data } = await supabase.from('accounts').select('id, name, type').order('type').order('display_order')
    if (data) {
      setAccounts(data)
      if (data.length > 0) setSelectedId(data[0].id)
    }
  }

  const fetchLedger = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('journal_entries')
      .select(`
        id, debit_amount, credit_amount,
        transactions!inner(id, date, description),
        accounts(name)
      `)
      .eq('account_id', selectedId)
      .gte('transactions.date', startDate)
      .lte('transactions.date', endDate)
      .order('transactions(date)', { ascending: true })

    if (data) {
      let balance = 0
      const rows: LedgerEntry[] = data.map((e: any) => {
        balance += (e.debit_amount ?? 0) - (e.credit_amount ?? 0)
        return {
          id: e.id,
          txnId: e.transactions?.id ?? '',
          date: e.transactions?.date ?? '',
          description: e.transactions?.description ?? '',
          debit_amount: e.debit_amount ?? 0,
          credit_amount: e.credit_amount ?? 0,
          balance,
          counterpart: '',
        }
      })
      setEntries(rows)
    }
    setLoading(false)
  }

  const selectedAccount = accounts.find(a => a.id === selectedId)
  const totalDebit = entries.reduce((s, e) => s + e.debit_amount, 0)
  const totalCredit = entries.reduce((s, e) => s + e.credit_amount, 0)

  return (
    <Page>
      <Header title="総勘定元帳" backPath="/dashboard" right={
        <button onClick={() => window.print()} className="no-print text-xs border rounded-lg px-3 py-1.5"
          style={{ color: 'var(--text3)', borderColor: 'var(--border)' }}>🖨 印刷/PDF</button>
      } />
      <main className="max-w-lg mx-auto p-4 flex flex-col gap-4">

        {/* 日付範囲 */}
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

        {/* 科目選択 */}
        <div className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text3)' }}>勘定科目</label>
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
            className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
            style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)' }}>
            {['expense', 'income', 'asset', 'liability'].map(type => {
              const group = accounts.filter(a => a.type === type)
              if (group.length === 0) return null
              return (
                <optgroup key={type} label={TYPE_LABEL[type] ?? type}>
                  {group.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </optgroup>
              )
            })}
          </select>
        </div>

        {/* 元帳テーブル */}
        {loading ? (
          <p className="text-center py-8" style={{ color: 'var(--text3)' }}>読み込み中...</p>
        ) : (
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            {/* ヘッダー */}
            <div className="px-4 py-3 border-b flex items-center justify-between"
              style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)' }}>
              <p className="text-xs font-bold" style={{ color: 'var(--accent)' }}>
                {selectedAccount?.name}（{TYPE_LABEL[selectedAccount?.type ?? ''] ?? ''}）
              </p>
              <p className="text-xs" style={{ color: 'var(--text3)' }}>{entries.length}件</p>
            </div>

            {/* カラムヘッダー */}
            <div className="grid text-xs px-4 py-2 border-b" style={{ gridTemplateColumns: '3fr 2fr 2fr 2fr', borderColor: 'var(--border)', backgroundColor: 'var(--bg2)' }}>
              {['日付・内容', '借方', '貸方', '残高'].map(h => (
                <span key={h} style={{ color: 'var(--text3)' }}>{h}</span>
              ))}
            </div>

            {/* 行 */}
            <div style={{ backgroundColor: 'var(--bg2)' }}>
              {entries.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: 'var(--text3)' }}>この月の仕訳はありません</p>
              ) : entries.map(e => (
                <div key={e.id} onClick={() => router.push(`/dashboard/transactions/${e.txnId}`)}
                  className="grid px-4 py-2.5 border-b last:border-b-0 items-center cursor-pointer active:opacity-70"
                  style={{ gridTemplateColumns: '3fr 2fr 2fr 2fr', borderColor: 'var(--border)' }}>
                  <div>
                    <p className="text-xs font-medium" style={{ color: 'var(--text)' }}>{e.description || '（内容なし）'}</p>
                    <p className="text-xs" style={{ color: 'var(--text3)' }}>{e.date}</p>
                  </div>
                  <span className="text-xs" style={{ color: e.debit_amount > 0 ? 'var(--text)' : 'var(--text3)' }}>
                    {e.debit_amount > 0 ? `¥${e.debit_amount.toLocaleString()}` : '—'}
                  </span>
                  <span className="text-xs" style={{ color: e.credit_amount > 0 ? 'var(--accent)' : 'var(--text3)' }}>
                    {e.credit_amount > 0 ? `¥${e.credit_amount.toLocaleString()}` : '—'}
                  </span>
                  <span className="text-xs font-medium" style={{ color: e.balance >= 0 ? 'var(--text)' : 'var(--text2)' }}>
                    ¥{e.balance.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>

            {/* 合計 */}
            {entries.length > 0 && (
              <div className="grid px-4 py-3 border-t" style={{ gridTemplateColumns: '3fr 2fr 2fr 2fr', borderColor: 'var(--border)', backgroundColor: 'var(--bg3)' }}>
                <span className="text-xs font-bold" style={{ color: 'var(--text)' }}>合計</span>
                <span className="text-xs font-bold" style={{ color: 'var(--text)' }}>¥{totalDebit.toLocaleString()}</span>
                <span className="text-xs font-bold" style={{ color: 'var(--accent)' }}>¥{totalCredit.toLocaleString()}</span>
                <span className="text-xs font-bold" style={{ color: 'var(--text)' }}>¥{(totalDebit - totalCredit).toLocaleString()}</span>
              </div>
            )}
          </div>
        )}
      </main>
    </Page>
  )
}
