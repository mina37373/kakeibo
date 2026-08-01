'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Page, Header } from '@/components/ui'
import { useHousehold } from '@/lib/household'

type Account = { id: string; name: string }
type BudgetItem = {
  id: string
  account_id: string
  year_month: string
  amount: number
  accounts?: { name: string }
  actual?: number
}

export default function BudgetPage() {
  const router = useRouter()
  const [budgets, setBudgets] = useState<BudgetItem[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [newAccountId, setNewAccountId] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const { householdId } = useHousehold()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
      else fetchData()
    })
  }, [router, month])

  const fetchData = async () => {
    const { data: accs } = await supabase.from('accounts').select('*').eq('type', 'expense').order('display_order')
    if (accs) setAccounts(accs)

    const { data: buds } = await supabase.from('budgets').select('*, accounts(name)').eq('year_month', month)

    const { data: entries } = await supabase
      .from('journal_entries')
      .select('debit_amount, account_id, transactions!inner(date)')
      .gte('transactions.date', `${month}-01`)
      .lte('transactions.date', `${month}-31`)
      .gt('debit_amount', 0)

    const actualMap: Record<string, number> = {}
    if (entries) entries.forEach((e: any) => {
      actualMap[e.account_id] = (actualMap[e.account_id] ?? 0) + e.debit_amount
    })

    setBudgets(buds ? buds.map(b => ({ ...b, actual: actualMap[b.account_id] ?? 0 })) : [])
  }

  const handleAdd = async () => {
    if (!newAccountId || !newAmount) return
    await supabase.from('budgets').upsert({
      account_id: newAccountId, year_month: month, amount: Number(newAmount), household_id: householdId,
    }, { onConflict: 'account_id,year_month' })
    setNewAccountId(''); setNewAmount('')
    fetchData()
  }

  const handleUpdate = async (id: string) => {
    await supabase.from('budgets').update({ amount: Number(editAmount) }).eq('id', id)
    setEditingId(null); fetchData()
  }

  const handleDelete = async (id: string) => {
    await supabase.from('budgets').delete().eq('id', id)
    fetchData()
  }

  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0)
  const totalActual = budgets.reduce((s, b) => s + (b.actual ?? 0), 0)
  const totalOver = totalActual > totalBudget

  const monthInput = (
    <input type="month" value={month} onChange={e => setMonth(e.target.value)}
      className="w-auto rounded-lg border px-2 py-1.5 text-sm outline-none"
      style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)' }} />
  )

  return (
    <Page>
      <Header title="予算管理" backPath="/dashboard" right={monthInput} />
      <main className="max-w-lg mx-auto p-4 flex flex-col gap-4">

        {/* サマリー */}
        <div className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
          <div className="flex justify-between mb-3">
            <div>
              <p className="text-xs" style={{ color: 'var(--text3)' }}>予算合計</p>
              <p className="font-bold text-lg" style={{ color: 'var(--text)' }}>¥{totalBudget.toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-xs" style={{ color: 'var(--text3)' }}>実績合計</p>
              <p className="font-bold text-lg" style={{ color: totalOver ? 'var(--text)' : 'var(--accent)' }}>
                ¥{totalActual.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="rounded-full h-2" style={{ backgroundColor: 'var(--bg3)' }}>
            <div className="rounded-full h-2 transition-all" style={{
              width: `${totalBudget > 0 ? Math.min((totalActual / totalBudget) * 100, 100) : 0}%`,
              backgroundColor: 'var(--accent)',
              opacity: totalOver ? 0.5 : 1,
            }} />
          </div>
        </div>

        {/* 予算追加 */}
        <div className="rounded-2xl border p-4 flex flex-col gap-3" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
          <p className="text-xs font-medium" style={{ color: 'var(--text2)' }}>予算を追加</p>
          <select value={newAccountId} onChange={e => setNewAccountId(e.target.value)}
            className="rounded-xl border px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)' }}>
            <option value="">カテゴリを選択</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <div className="flex gap-2">
            <div className="flex items-center flex-1 rounded-xl border px-3 py-2"
              style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)' }}>
              <span className="mr-1 text-sm" style={{ color: 'var(--text3)' }}>¥</span>
              <input type="text" inputMode="numeric" value={newAmount ? Number(newAmount).toLocaleString() : ''} onChange={e => setNewAmount(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="予算金額"
                className="flex-1 bg-transparent outline-none text-sm placeholder:opacity-40"
                style={{ color: 'var(--text)' }} />
            </div>
            <button onClick={handleAdd}
              className="text-white rounded-xl px-4 text-sm font-medium"
              style={{ backgroundColor: 'var(--accent)' }}>追加</button>
          </div>
        </div>

        {/* 予算一覧 */}
        <div className="flex flex-col gap-2">
          {budgets.length === 0 ? (
            <p className="text-center py-8" style={{ color: 'var(--text3)' }}>この月の予算はまだありません</p>
          ) : budgets.map(b => {
            const actual = b.actual ?? 0
            const ratio = b.amount > 0 ? (actual / b.amount) * 100 : 0
            const over = actual > b.amount
            return (
              <div key={b.id} className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>{b.accounts?.name}</p>
                  <div className="flex items-center gap-2">
                    {editingId === b.id ? (
                      <>
                        <input type="text" inputMode="numeric" value={editAmount ? Number(editAmount).toLocaleString() : ''} onChange={e => setEditAmount(e.target.value.replace(/[^0-9]/g, ''))}
                          className="w-28 rounded-lg border px-2 py-1 text-sm outline-none"
                          style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)' }} />
                        <button onClick={() => handleUpdate(b.id)} className="text-sm" style={{ color: 'var(--accent)' }}>保存</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setEditingId(b.id); setEditAmount(String(b.amount)) }}
                          className="text-xs" style={{ color: 'var(--text3)' }}>編集</button>
                        <button onClick={() => handleDelete(b.id)}
                          className="text-xs" style={{ color: 'var(--text3)' }}>削除</button>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex justify-between text-xs mb-2">
                  <span style={{ color: over ? 'var(--text)' : 'var(--accent)' }}>実績 ¥{actual.toLocaleString()}</span>
                  <span style={{ color: 'var(--text3)' }}>予算 ¥{b.amount.toLocaleString()}</span>
                </div>
                <div className="rounded-full h-1.5" style={{ backgroundColor: 'var(--bg3)' }}>
                  <div className="rounded-full h-1.5 transition-all"
                    style={{ width: `${Math.min(ratio, 100)}%`, backgroundColor: 'var(--accent)', opacity: over ? 0.5 : 1 }} />
                </div>
                <p className="text-xs mt-1 text-right" style={{ color: over ? 'var(--text2)' : 'var(--text3)' }}>
                  {over ? `¥${(actual - b.amount).toLocaleString()} オーバー` : `残り ¥${(b.amount - actual).toLocaleString()}`}
                </p>
              </div>
            )
          })}
        </div>
      </main>
    </Page>
  )
}
