'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Page, Header } from '@/components/ui'
import { useHousehold } from '@/lib/household'

type Account = { id: string; name: string; type: string }
type TxnRow = {
  id: string; date: string; description: string; memo: string
  amount: number; kind: 'buy' | 'sell' | 'dividend' | 'other'
}

type ActionType = 'buy' | 'sell' | 'dividend' | null

const KIND_LABEL: Record<string, string> = { buy: '買付', sell: '売却', dividend: '配当', other: '取引' }
const KIND_COLOR: Record<string, string> = { buy: 'var(--accent)', sell: '#f87171', dividend: '#22c55e', other: 'var(--text3)' }

export default function InvestmentsPage() {
  const router = useRouter()
  const { householdId } = useHousehold()
  const [allAccounts, setAllAccounts] = useState<Account[]>([])
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [txns, setTxns] = useState<TxnRow[]>([])
  const [tab, setTab] = useState<'overview' | 'history'>('overview')
  const [action, setAction] = useState<ActionType>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [loading, setLoading] = useState(true)

  // 投資口座・配当収入科目の設定（localStorage）
  const [investAccountIds, setInvestAccountIds] = useState<string[]>([])
  const [dividendAccountIds, setDividendAccountIds] = useState<string[]>([])

  // フォーム
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [fromAccountId, setFromAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [savingAction, setSavingAction] = useState(false)

  const assetAccounts = allAccounts.filter(a => a.type === 'asset')
  const incomeAccounts = allAccounts.filter(a => a.type === 'income')
  const investAccounts = allAccounts.filter(a => investAccountIds.includes(a.id))
  const bankAccounts = assetAccounts.filter(a => !investAccountIds.includes(a.id))

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
      else init()
    })
  }, [router])

  const init = async () => {
    const ids: string[] = JSON.parse(localStorage.getItem('invest_account_ids') ?? '[]')
    const divIds: string[] = JSON.parse(localStorage.getItem('invest_dividend_ids') ?? '[]')
    setInvestAccountIds(ids)
    setDividendAccountIds(divIds)
    const { data: accs } = await supabase.from('accounts').select('id, name, type').order('display_order')
    if (accs) setAllAccounts(accs)
    await fetchBalances(ids)
    await fetchHistory(ids, divIds)
    setLoading(false)
  }

  const fetchBalances = async (ids: string[]) => {
    if (ids.length === 0) return
    const { data } = await supabase.from('journal_entries').select('account_id, debit_amount, credit_amount').in('account_id', ids)
    if (data) {
      const map: Record<string, number> = {}
      data.forEach((e: any) => {
        map[e.account_id] = (map[e.account_id] ?? 0) + (e.debit_amount ?? 0) - (e.credit_amount ?? 0)
      })
      setBalances(map)
    }
  }

  const fetchHistory = async (investIds: string[], divIds: string[]) => {
    if (investIds.length === 0 && divIds.length === 0) return
    const allIds = [...new Set([...investIds, ...divIds])]
    const { data } = await supabase
      .from('journal_entries')
      .select('account_id, debit_amount, credit_amount, transactions!inner(id, date, description, memo)')
      .in('account_id', allIds)
      .order('transactions(date)', { ascending: false })
      .limit(100)
    if (data) {
      const txnMap: Record<string, TxnRow> = {}
      data.forEach((e: any) => {
        const txnId = e.transactions?.id
        if (!txnId) return
        const isInvest = investIds.includes(e.account_id)
        const isDiv = divIds.includes(e.account_id)
        if (!txnMap[txnId]) {
          txnMap[txnId] = {
            id: txnId,
            date: e.transactions?.date ?? '',
            description: e.transactions?.description ?? '',
            memo: e.transactions?.memo ?? '',
            amount: 0,
            kind: 'other',
          }
        }
        const row = txnMap[txnId]
        if (isDiv && e.credit_amount > 0) { row.kind = 'dividend'; row.amount = e.credit_amount }
        else if (isInvest && e.debit_amount > 0) { row.kind = 'buy'; row.amount = e.debit_amount }
        else if (isInvest && e.credit_amount > 0) { row.kind = 'sell'; row.amount = e.credit_amount }
      })
      setTxns(Object.values(txnMap).sort((a, b) => b.date.localeCompare(a.date)))
    }
  }

  const saveSetup = (newInvestIds: string[], newDivIds: string[]) => {
    localStorage.setItem('invest_account_ids', JSON.stringify(newInvestIds))
    localStorage.setItem('invest_dividend_ids', JSON.stringify(newDivIds))
    setInvestAccountIds(newInvestIds)
    setDividendAccountIds(newDivIds)
    fetchBalances(newInvestIds)
    fetchHistory(newInvestIds, newDivIds)
  }

  const handleAction = async () => {
    if (!amount || !date) return
    setSavingAction(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const amt = Number(amount)

    const { data: txn } = await supabase.from('transactions')
      .insert({ date, description: description || (action === 'buy' ? '買付' : action === 'sell' ? '売却' : '配当'), created_by: session.user.id, household_id: householdId })
      .select().single()
    if (!txn) { setSavingAction(false); return }

    if (action === 'buy') {
      // 銀行 → 証券口座
      await supabase.from('journal_entries').insert([
        { transaction_id: txn.id, account_id: toAccountId, debit_amount: amt, credit_amount: 0 },
        { transaction_id: txn.id, account_id: fromAccountId, debit_amount: 0, credit_amount: amt },
      ])
    } else if (action === 'sell') {
      // 証券口座 → 銀行
      await supabase.from('journal_entries').insert([
        { transaction_id: txn.id, account_id: toAccountId, debit_amount: amt, credit_amount: 0 },
        { transaction_id: txn.id, account_id: fromAccountId, debit_amount: 0, credit_amount: amt },
      ])
    } else if (action === 'dividend') {
      // 配当: 銀行DR / 配当収入CR
      await supabase.from('journal_entries').insert([
        { transaction_id: txn.id, account_id: toAccountId, debit_amount: amt, credit_amount: 0 },
        { transaction_id: txn.id, account_id: fromAccountId, debit_amount: 0, credit_amount: amt },
      ])
    }

    setAmount(''); setDescription(''); setFromAccountId(''); setToAccountId('')
    setDate(new Date().toISOString().slice(0, 10))
    setAction(null)
    setSavingAction(false)
    await fetchBalances(investAccountIds)
    await fetchHistory(investAccountIds, dividendAccountIds)
  }

  const totalInvested = investAccounts.reduce((s, a) => s + (balances[a.id] ?? 0), 0)
  const inputStyle = { backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)' }

  if (loading) return <Page><Header title="投資管理" backPath="/dashboard" /><p className="text-center py-12" style={{ color: 'var(--text3)' }}>読み込み中...</p></Page>

  // 初期設定が未完了
  if (investAccountIds.length === 0 && !showSetup) {
    return (
      <Page>
        <Header title="投資管理" backPath="/dashboard" />
        <main className="max-w-lg mx-auto p-4 flex flex-col gap-4">
          <div className="rounded-2xl border p-6 text-center flex flex-col gap-4" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
            <p className="text-2xl">📈</p>
            <p className="font-medium" style={{ color: 'var(--text)' }}>投資口座を設定しましょう</p>
            <p className="text-sm" style={{ color: 'var(--text3)' }}>
              どの口座が証券口座か選択してください。まだ口座を作っていない場合は、設定 → 資産科目から先に追加してください。
            </p>
            <button onClick={() => setShowSetup(true)}
              className="w-full text-white rounded-xl py-3 text-sm font-medium"
              style={{ backgroundColor: 'var(--accent)' }}>設定する</button>
            <button onClick={() => router.push('/dashboard/settings')}
              className="text-sm" style={{ color: 'var(--text3)' }}>資産科目を追加 →</button>
          </div>
        </main>
      </Page>
    )
  }

  return (
    <Page>
      <Header title="投資管理" backPath="/dashboard" right={
        <button onClick={() => setShowSetup(!showSetup)} className="text-xs border rounded-lg px-3 py-1.5"
          style={{ color: 'var(--text3)', borderColor: 'var(--border)' }}>⚙ 設定</button>
      } />
      <main className="max-w-lg mx-auto p-4 flex flex-col gap-4">

        {/* 口座設定パネル */}
        {showSetup && (
          <div className="rounded-2xl border p-4 flex flex-col gap-4" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--accent)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>⚙ 投資口座の設定</p>
            <div>
              <p className="text-xs mb-2" style={{ color: 'var(--text3)' }}>証券口座（資産科目から選択）</p>
              <div className="flex flex-col gap-1.5">
                {assetAccounts.map(a => {
                  const checked = investAccountIds.includes(a.id)
                  return (
                    <label key={a.id} className="flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer"
                      style={{ backgroundColor: checked ? 'var(--bg3)' : 'var(--bg2)', borderColor: checked ? 'var(--accent)' : 'var(--border)' }}>
                      <input type="checkbox" checked={checked}
                        onChange={e => {
                          const next = e.target.checked
                            ? [...investAccountIds, a.id]
                            : investAccountIds.filter(id => id !== a.id)
                          saveSetup(next, dividendAccountIds)
                        }} className="w-4 h-4 accent-blue-500" />
                      <span className="text-sm" style={{ color: 'var(--text)' }}>{a.name}</span>
                    </label>
                  )
                })}
              </div>
            </div>
            <div>
              <p className="text-xs mb-2" style={{ color: 'var(--text3)' }}>配当収入科目（収入科目から選択）</p>
              <div className="flex flex-col gap-1.5">
                {incomeAccounts.map(a => {
                  const checked = dividendAccountIds.includes(a.id)
                  return (
                    <label key={a.id} className="flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer"
                      style={{ backgroundColor: checked ? 'var(--bg3)' : 'var(--bg2)', borderColor: checked ? '#22c55e' : 'var(--border)' }}>
                      <input type="checkbox" checked={checked}
                        onChange={e => {
                          const next = e.target.checked
                            ? [...dividendAccountIds, a.id]
                            : dividendAccountIds.filter(id => id !== a.id)
                          saveSetup(investAccountIds, next)
                        }} className="w-4 h-4 accent-green-500" />
                      <span className="text-sm" style={{ color: 'var(--text)' }}>{a.name}</span>
                    </label>
                  )
                })}
                {incomeAccounts.length === 0 && (
                  <p className="text-xs" style={{ color: 'var(--text3)' }}>設定 → 費用科目から収入科目を追加してください（例: 配当収入）</p>
                )}
              </div>
            </div>
            <button onClick={() => setShowSetup(false)}
              className="text-sm text-center" style={{ color: 'var(--accent)' }}>完了</button>
          </div>
        )}

        {/* 合計残高カード */}
        <div className="rounded-2xl border p-5" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
          <p className="text-xs mb-1" style={{ color: 'var(--text3)' }}>投資残高合計（元本ベース）</p>
          <p className="text-3xl font-bold" style={{ color: 'var(--accent)' }}>¥{totalInvested.toLocaleString()}</p>
          <div className="flex flex-col gap-2 mt-4">
            {investAccounts.map(a => (
              <div key={a.id} className="flex justify-between items-center">
                <span className="text-sm" style={{ color: 'var(--text2)' }}>{a.name}</span>
                <span className="text-sm font-medium" style={{ color: (balances[a.id] ?? 0) >= 0 ? 'var(--text)' : '#f87171' }}>
                  ¥{(balances[a.id] ?? 0).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* クイックアクション */}
        <div className="grid grid-cols-3 gap-2">
          {([
            { key: 'buy', label: '積立・買付', emoji: '📈' },
            { key: 'sell', label: '売却', emoji: '💰' },
            { key: 'dividend', label: '配当', emoji: '🎁' },
          ] as const).map(btn => (
            <button key={btn.key}
              onClick={() => { setAction(action === btn.key ? null : btn.key); setAmount(''); setFromAccountId(''); setToAccountId('') }}
              className="rounded-2xl border py-3 flex flex-col items-center gap-1 transition-all"
              style={{
                backgroundColor: action === btn.key ? 'var(--accent)' : 'var(--bg2)',
                borderColor: action === btn.key ? 'var(--accent)' : 'var(--border)',
                color: action === btn.key ? '#fff' : 'var(--text)',
              }}>
              <span>{btn.emoji}</span>
              <span className="text-xs font-medium">{btn.label}</span>
            </button>
          ))}
        </div>

        {/* アクションフォーム */}
        {action && (
          <div className="rounded-2xl border p-4 flex flex-col gap-3" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--accent)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
              {action === 'buy' ? '📈 積立・買付' : action === 'sell' ? '💰 売却' : '🎁 配当を記録'}
            </p>

            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="rounded-xl border px-3 py-2 text-sm outline-none"
              style={{ ...inputStyle, boxSizing: 'border-box' as const }} />

            <div className="flex items-center gap-2">
              <span style={{ color: 'var(--text3)' }}>¥</span>
              <input type="text" inputMode="numeric" value={amount ? Number(amount).toLocaleString() : ''} onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="金額" className="flex-1 rounded-xl border px-3 py-2 text-sm outline-none placeholder:opacity-40"
                style={inputStyle} />
            </div>

            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
              placeholder={action === 'buy' ? '例: オルカン、S&P500' : action === 'sell' ? '例: トヨタ売却' : '例: 配当金'}
              className="rounded-xl border px-3 py-2 text-sm outline-none placeholder:opacity-40"
              style={inputStyle} />

            {action === 'buy' && (
              <>
                <select value={fromAccountId} onChange={e => setFromAccountId(e.target.value)}
                  className="rounded-xl border px-3 py-2 text-sm outline-none" style={inputStyle}>
                  <option value="">引き落とし口座（銀行など）</option>
                  {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <select value={toAccountId} onChange={e => setToAccountId(e.target.value)}
                  className="rounded-xl border px-3 py-2 text-sm outline-none" style={inputStyle}>
                  <option value="">入金先（証券口座）</option>
                  {investAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </>
            )}
            {action === 'sell' && (
              <>
                <select value={fromAccountId} onChange={e => setFromAccountId(e.target.value)}
                  className="rounded-xl border px-3 py-2 text-sm outline-none" style={inputStyle}>
                  <option value="">売却元（証券口座）</option>
                  {investAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <select value={toAccountId} onChange={e => setToAccountId(e.target.value)}
                  className="rounded-xl border px-3 py-2 text-sm outline-none" style={inputStyle}>
                  <option value="">受取口座（銀行など）</option>
                  {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </>
            )}
            {action === 'dividend' && (
              <>
                <select value={fromAccountId} onChange={e => setFromAccountId(e.target.value)}
                  className="rounded-xl border px-3 py-2 text-sm outline-none" style={inputStyle}>
                  <option value="">配当収入科目</option>
                  {incomeAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <select value={toAccountId} onChange={e => setToAccountId(e.target.value)}
                  className="rounded-xl border px-3 py-2 text-sm outline-none" style={inputStyle}>
                  <option value="">受取口座（銀行・証券）</option>
                  {[...bankAccounts, ...investAccounts].map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </>
            )}

            <button onClick={handleAction}
              disabled={savingAction || !amount || !fromAccountId || !toAccountId}
              className="w-full text-white rounded-xl py-2.5 text-sm font-medium disabled:opacity-40"
              style={{ backgroundColor: 'var(--accent)' }}>
              {savingAction ? '登録中...' : '登録する'}
            </button>
          </div>
        )}

        {/* タブ */}
        <div className="flex rounded-2xl overflow-hidden border" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
          {([['overview', '概要'], ['history', '取引履歴']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className="flex-1 py-2.5 text-xs font-medium"
              style={{ backgroundColor: tab === id ? 'var(--accent)' : 'transparent', color: tab === id ? '#fff' : 'var(--text3)' }}>
              {label}
            </button>
          ))}
        </div>

        {/* 概要タブ */}
        {tab === 'overview' && (
          <div className="flex flex-col gap-3">
            {investAccounts.map(a => {
              const bal = balances[a.id] ?? 0
              const accountTxns = txns.filter(t => t.kind !== 'dividend')
              return (
                <div key={a.id} className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
                  <div className="flex justify-between items-center mb-1">
                    <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>{a.name}</p>
                    <p className="font-bold" style={{ color: bal >= 0 ? 'var(--accent)' : '#f87171' }}>¥{bal.toLocaleString()}</p>
                  </div>
                  <p className="text-xs" style={{ color: 'var(--text3)' }}>元本ベース残高</p>
                </div>
              )
            })}
            {dividendAccountIds.length > 0 && (
              <div className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
                <p className="text-xs mb-2" style={{ color: 'var(--text3)' }}>配当収入（累計）</p>
                <p className="font-bold text-lg" style={{ color: '#22c55e' }}>
                  ¥{txns.filter(t => t.kind === 'dividend').reduce((s, t) => s + t.amount, 0).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        )}

        {/* 取引履歴タブ */}
        {tab === 'history' && (
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            {txns.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: 'var(--text3)' }}>取引履歴はありません</p>
            ) : txns.map(t => (
              <div key={t.id} onClick={() => router.push(`/dashboard/transactions/${t.id}`)}
                className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 cursor-pointer active:opacity-70"
                style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs shrink-0"
                  style={{ backgroundColor: 'var(--bg3)', color: KIND_COLOR[t.kind] }}>
                  {t.kind === 'buy' ? '買' : t.kind === 'sell' ? '売' : t.kind === 'dividend' ? '配' : '他'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{t.description || '（内容なし）'}</p>
                  <p className="text-xs" style={{ color: 'var(--text3)' }}>{t.date} ・ {KIND_LABEL[t.kind]}</p>
                </div>
                <p className="text-sm font-semibold shrink-0" style={{ color: KIND_COLOR[t.kind] }}>
                  {t.kind === 'sell' || t.kind === 'dividend' ? '+' : '-'}¥{t.amount.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>
    </Page>
  )
}
