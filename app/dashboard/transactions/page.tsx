'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Page, Header } from '@/components/ui'

type Transaction = {
  id: string; date: string; description: string; memo: string; created_at: string
  journal_entries: { debit_amount: number; credit_amount: number; memo?: string | null; accounts: { name: string; type: string } }[]
}

export default function TransactionsPage() {
  const router = useRouter()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'income' | 'transfer'>('all')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
      else fetchTransactions()
    })
  }, [router, month])

  useEffect(() => {
    if (query.trim() === '') { setSearching(false); return }
    const t = setTimeout(() => search(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  const fetchTransactions = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('transactions')
      .select(`*, journal_entries(debit_amount, credit_amount, memo, accounts(name, type))`)
      .gte('date', `${month}-01`).lte('date', `${month}-31`)
      .order('date', { ascending: false }).order('created_at', { ascending: false })
    if (data) setTransactions(data)
    setLoading(false)
  }

  const search = async (q: string) => {
    setSearching(true)
    setLoading(true)
    const { data } = await supabase
      .from('transactions')
      .select(`*, journal_entries(debit_amount, credit_amount, memo, accounts(name, type))`)
      .or(`description.ilike.%${q}%,memo.ilike.%${q}%`)
      .order('date', { ascending: false })
      .limit(100)
    if (data) setTransactions(data)
    setLoading(false)
  }

  const getAmount = (txn: Transaction) => {
    const exps = txn.journal_entries.filter(e => e.accounts?.type === 'expense' && e.debit_amount > 0)
    if (exps.length > 0) return { amount: exps.reduce((s, e) => s + e.debit_amount, 0), type: 'expense' as const, label: exps[0].accounts?.name }
    const incs = txn.journal_entries.filter(e => e.accounts?.type === 'income' && e.credit_amount > 0)
    if (incs.length > 0) return { amount: incs.reduce((s, e) => s + e.credit_amount, 0), type: 'income' as const, label: incs[0].accounts?.name }
    const tr = txn.journal_entries.find(e => e.accounts?.type === 'asset' && e.debit_amount > 0)
    if (tr) return { amount: tr.debit_amount, type: 'transfer' as const, label: '振替' }
    return { amount: 0, type: 'expense' as const, label: '' }
  }

  const filtered = typeFilter === 'all' ? transactions : transactions.filter(txn => getAmount(txn).type === typeFilter)

  const grouped: Record<string, Transaction[]> = {}
  filtered.forEach(txn => {
    if (!grouped[txn.date]) grouped[txn.date] = []
    grouped[txn.date].push(txn)
  })

  const monthInput = (
    <input
      type="month" value={month} onChange={e => { setMonth(e.target.value); setQuery(''); setSearching(false) }}
      className="w-auto rounded-lg border px-2 py-1.5 text-sm outline-none"
      style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)' }}
    />
  )

  return (
    <Page>
      <Header title="取引一覧" backPath="/dashboard" right={!searching ? monthInput : undefined} />
      <main className="max-w-lg mx-auto px-4 py-4 pb-24 flex flex-col gap-4">

        {/* 検索バー */}
        <div className="flex items-center gap-2 rounded-2xl border px-3 py-2.5"
          style={{ backgroundColor: 'var(--bg2)', borderColor: query ? 'var(--accent)' : 'var(--border)' }}>
          <span style={{ color: 'var(--text3)' }}>🔍</span>
          <input
            type="text" value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="お店・内容で検索..."
            className="flex-1 bg-transparent outline-none text-sm placeholder:opacity-40"
            style={{ color: 'var(--text)' }}
          />
          {query && (
            <button onClick={() => { setQuery(''); setSearching(false); fetchTransactions() }}
              className="text-xs px-2 py-0.5 rounded-lg"
              style={{ color: 'var(--text3)', backgroundColor: 'var(--bg3)' }}>✕</button>
          )}
        </div>

        {/* フィルターチップ */}
        <div className="flex gap-2">
          {([['all', '全部'], ['expense', '支出'], ['income', '収入'], ['transfer', '振替']] as const).map(([v, label]) => (
            <button key={v} onClick={() => setTypeFilter(v)}
              className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
              style={{
                backgroundColor: typeFilter === v ? 'var(--accent)' : 'var(--bg2)',
                borderColor: typeFilter === v ? 'var(--accent)' : 'var(--border)',
                color: typeFilter === v ? '#fff' : 'var(--text3)',
              }}>{label}</button>
          ))}
        </div>

        {searching && (
          <p className="text-xs px-1" style={{ color: 'var(--text3)' }}>「{query}」の検索結果 {loading ? '...' : `${filtered.length}件`}</p>
        )}

        {loading ? (
          <p className="text-center py-12" style={{ color: 'var(--text3)' }}>読み込み中...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="mb-4" style={{ color: 'var(--text3)' }}>{searching ? '該当する取引がありません' : 'この月の取引はありません'}</p>
            {!searching && <button onClick={() => router.push('/dashboard/new')} className="text-white rounded-xl px-6 py-3 text-sm font-medium" style={{ backgroundColor: 'var(--accent)' }}>
              取引を入力する
            </button>}
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {Object.entries(grouped).map(([date, txns]) => {
              const d = new Date(date + 'T00:00:00')
              return (
                <div key={date}>
                  <p className="text-xs font-medium mb-2" style={{ color: 'var(--text3)' }}>{d.getFullYear()}年{d.getMonth() + 1}月{d.getDate()}日</p>
                  <div className="flex flex-col gap-1.5">
                    {txns.map(txn => {
                      const { amount, type, label } = getAmount(txn)
                      return (
                        <div
                          key={txn.id}
                          onClick={() => {
                            const expEntries = txn.journal_entries.filter(e => e.accounts?.type === 'expense' && e.debit_amount > 0)
                            const isReceipt = expEntries.length > 1 || expEntries.some(e => e.memo)
                            router.push(isReceipt ? `/dashboard/new/receipt?edit=${txn.id}` : `/dashboard/transactions/${txn.id}`)
                          }}
                          className="rounded-xl border px-4 py-3 flex items-center gap-3 cursor-pointer transition-opacity active:opacity-70"
                          style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}
                        >
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs shrink-0"
                            style={{ backgroundColor: 'var(--bg3)', color: type === 'income' ? 'var(--accent)' : 'var(--text2)' }}>
                            {type === 'income' ? '収' : '支'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{txn.description || '（内容なし）'}</p>
                            <p className="text-xs" style={{ color: 'var(--text3)' }}>{label}</p>
                          </div>
                          <p className="font-semibold text-sm shrink-0" style={{ color: type === 'income' ? 'var(--accent)' : 'var(--text2)' }}>
                            {type === 'income' ? '+' : '-'}¥{amount.toLocaleString()}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
      <div className="fixed bottom-6 right-5">
        <button onClick={() => router.push('/dashboard/new')} className="text-white rounded-full w-14 h-14 text-2xl shadow-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent)' }}>＋</button>
      </div>
    </Page>
  )
}
