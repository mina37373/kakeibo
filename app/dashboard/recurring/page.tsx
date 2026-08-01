'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Page, Header } from '@/components/ui'
import { useHousehold } from '@/lib/household'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

type Account = { id: string; name: string; type: string }
type PaymentMethod = { id: string; name: string }
type Recurring = {
  id: string; name: string; amount: number; frequency: string
  day_of_month: number; is_active: boolean
  expense_account_id: string; payment_method_id: string
  accounts?: { name: string }; payment_methods?: { name: string }
}

const isVariable = (rec: Recurring) => rec.amount === 0

function SortableCard({ id, children }: { id: string; children: (handle: React.ReactNode) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const handle = (
    <span {...attributes} {...listeners}
      className="cursor-grab active:cursor-grabbing touch-none select-none shrink-0 self-start mt-0.5"
      style={{ color: 'var(--text3)', fontSize: 18, lineHeight: 1, paddingRight: 6 }}>≡</span>
  )
  return <div ref={setNodeRef} style={style}>{children(handle)}</div>
}

export default function RecurringPage() {
  const router = useRouter()
  const [recurrings, setRecurrings] = useState<Recurring[]>([])
  const [order, setOrder] = useState<string[]>([]) // localStorage で順番管理
  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([])
  const [assetAccounts, setAssetAccounts] = useState<Account[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [recurringKind, setRecurringKind] = useState<'expense' | 'transfer'>('expense')
  const [name, setName] = useState('')
  const [amountType, setAmountType] = useState<'fixed' | 'variable'>('fixed')
  const [amount, setAmount] = useState('')
  const [frequency, setFrequency] = useState('monthly')
  const [dayOfMonth, setDayOfMonth] = useState('1')
  const [expenseAccountId, setExpenseAccountId] = useState('')
  const [paymentMethodId, setPaymentMethodId] = useState('')
  const [transferToAccountId, setTransferToAccountId] = useState('')
  const [execAmounts, setExecAmounts] = useState<Record<string, string>>({})
  const [transferIds, setTransferIdsState] = useState<string[]>([])
  const { householdId } = useHousehold()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  const loadTransferIds = () => {
    const ids: string[] = JSON.parse(localStorage.getItem('recurring_transfer_ids') ?? '[]')
    setTransferIdsState(ids)
    return ids
  }
  const saveTransferIds = (ids: string[]) => {
    localStorage.setItem('recurring_transfer_ids', JSON.stringify(ids))
    setTransferIdsState(ids)
  }
  const loadOrder = () => {
    const o: string[] = JSON.parse(localStorage.getItem('recurring_order') ?? '[]')
    setOrder(o)
    return o
  }
  const saveOrder = (o: string[]) => {
    localStorage.setItem('recurring_order', JSON.stringify(o))
    setOrder(o)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
      else fetchData()
    })
  }, [router])

  const fetchData = async () => {
    loadTransferIds()
    loadOrder()
    const { data: recs } = await supabase
      .from('recurring_transactions')
      .select('*, accounts(name), payment_methods(name)')
      .order('created_at')
    if (recs) setRecurrings(recs)
    const { data: accs } = await supabase.from('accounts').select('*').order('display_order')
    if (accs) {
      setExpenseAccounts(accs.filter((a: Account) => a.type === 'expense'))
      setAssetAccounts(accs.filter((a: Account) => a.type === 'asset'))
    }
    const { data: pms } = await supabase.from('payment_methods').select('*')
    if (pms) setPaymentMethods(pms)
  }

  // orderに従って並び替えたrecurrings
  const sortedRecurrings = (list: Recurring[]) => {
    if (order.length === 0) return list
    const map = Object.fromEntries(list.map(r => [r.id, r]))
    const sorted = order.filter(id => map[id]).map(id => map[id])
    const rest = list.filter(r => !order.includes(r.id))
    return [...sorted, ...rest]
  }

  const handleDragEnd = (event: DragEndEvent, list: Recurring[]) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = list.map(r => r.id)
    const oldIdx = ids.indexOf(active.id as string)
    const newIdx = ids.indexOf(over.id as string)
    // 全体orderを更新
    const allIds = sortedAll.map(r => r.id)
    const globalOldIdx = allIds.indexOf(active.id as string)
    const globalNewIdx = allIds.indexOf(over.id as string)
    saveOrder(arrayMove(allIds, globalOldIdx, globalNewIdx))
  }

  const openAddForm = () => {
    setEditingId(null)
    setRecurringKind('expense')
    setName(''); setAmountType('fixed'); setAmount(''); setFrequency('monthly'); setDayOfMonth('1')
    setExpenseAccountId(''); setPaymentMethodId(''); setTransferToAccountId('')
    setShowForm(true)
  }

  const openEditForm = (rec: Recurring) => {
    setEditingId(rec.id)
    setRecurringKind(transferIds.includes(rec.id) ? 'transfer' : 'expense')
    setName(rec.name)
    setAmountType(isVariable(rec) ? 'variable' : 'fixed')
    setAmount(isVariable(rec) ? '' : String(rec.amount))
    setFrequency(rec.frequency)
    setDayOfMonth(String(rec.day_of_month))
    setExpenseAccountId(rec.expense_account_id)
    setPaymentMethodId(rec.payment_method_id)
    setTransferToAccountId(rec.expense_account_id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSave = async () => {
    if (!name) return
    if (recurringKind === 'expense' && (!expenseAccountId || !paymentMethodId)) return
    if (recurringKind === 'transfer' && (!transferToAccountId || !paymentMethodId)) return
    if (amountType === 'fixed' && !amount) return

    const saveAmount = amountType === 'variable' ? 0 : Number(amount)
    const saveExpenseId = recurringKind === 'transfer' ? transferToAccountId : expenseAccountId

    let savedId: string | null = null
    if (editingId) {
      await supabase.from('recurring_transactions').update({
        name, amount: saveAmount, frequency,
        day_of_month: Number(dayOfMonth),
        expense_account_id: saveExpenseId,
        payment_method_id: paymentMethodId,
      }).eq('id', editingId)
      savedId = editingId
    } else {
      const { data } = await supabase.from('recurring_transactions').insert({
        name, amount: saveAmount, frequency,
        day_of_month: Number(dayOfMonth),
        expense_account_id: saveExpenseId,
        payment_method_id: paymentMethodId,
        household_id: householdId,
      }).select().single()
      savedId = data?.id ?? null
    }

    if (savedId) {
      const ids = transferIds.filter(id => id !== savedId)
      if (recurringKind === 'transfer') ids.push(savedId)
      saveTransferIds(ids)
    }

    setShowForm(false); setEditingId(null)
    fetchData()
  }

  const handleExecute = async (rec: Recurring, execAmount?: number) => {
    const amt = isVariable(rec) ? execAmount : rec.amount
    if (!amt || amt <= 0) return
    const today = new Date().toISOString().slice(0, 10)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: pmFull } = await supabase.from('payment_methods').select('*, accounts(id)').eq('id', rec.payment_method_id).single()
    const { data: txn } = await supabase.from('transactions').insert({ date: today, description: rec.name, created_by: session.user.id }).select().single()
    if (txn && pmFull) {
      await supabase.from('journal_entries').insert([
        { transaction_id: txn.id, account_id: rec.expense_account_id, debit_amount: amt, credit_amount: 0 },
        { transaction_id: txn.id, account_id: pmFull.accounts?.id, debit_amount: 0, credit_amount: amt },
      ])
      await supabase.from('recurring_transactions').update({ last_executed_date: today }).eq('id', rec.id)
      setExecAmounts(prev => { const n = { ...prev }; delete n[rec.id]; return n })
      alert(`「${rec.name}」¥${amt.toLocaleString()} を登録しました`)
      fetchData()
    }
  }

  const handleToggle = async (rec: Recurring) => {
    await supabase.from('recurring_transactions').update({ is_active: !rec.is_active }).eq('id', rec.id)
    fetchData()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('削除しますか？')) return
    await supabase.from('recurring_transactions').delete().eq('id', id)
    saveTransferIds(transferIds.filter(i => i !== id))
    saveOrder(order.filter(i => i !== id))
    fetchData()
  }

  const inputStyle = { backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)' }

  const sortedAll = sortedRecurrings(recurrings)
  const transfers = sortedAll.filter(r => transferIds.includes(r.id))
  const nonTransfers = sortedAll.filter(r => !transferIds.includes(r.id))
  const fixed = nonTransfers.filter(r => !isVariable(r))
  const variable = nonTransfers.filter(r => isVariable(r))

  // 固定費合計（アクティブなもの）
  const fixedTotal = fixed.filter(r => r.is_active).reduce((s, r) => s + r.amount, 0)

  const renderButtons = (rec: Recurring, isVar = false) => (
    <div className="flex gap-2 mt-3">
      <button onClick={() => isVar ? handleExecute(rec, Number(execAmounts[rec.id] ?? 0)) : handleExecute(rec)}
        disabled={isVar && (!execAmounts[rec.id] || Number(execAmounts[rec.id]) <= 0)}
        className="flex-1 rounded-xl py-2 text-sm font-medium border disabled:opacity-40"
        style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--accent)' }}>
        今月分を登録
      </button>
      <button onClick={() => openEditForm(rec)} className="px-3 py-2 border rounded-xl text-sm"
        style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>編集</button>
      <button onClick={() => handleToggle(rec)} className="px-3 py-2 border rounded-xl text-sm"
        style={{ borderColor: 'var(--border)', color: 'var(--text2)' }}>
        {rec.is_active ? '停止' : '再開'}
      </button>
      <button onClick={() => handleDelete(rec.id)} className="px-3 py-2 border rounded-xl text-sm"
        style={{ borderColor: 'var(--border)', color: 'var(--text3)' }}>削除</button>
    </div>
  )

  return (
    <Page>
      <Header title="定期支払い" backPath="/dashboard" right={
        <button onClick={openAddForm} className="text-white rounded-xl px-4 py-2 text-sm font-medium"
          style={{ backgroundColor: 'var(--accent)' }}>＋ 追加</button>
      } />
      <main className="max-w-lg mx-auto p-4 flex flex-col gap-4">

        {/* フォーム */}
        {showForm && (
          <div className="rounded-2xl border p-4 flex flex-col gap-3"
            style={{ backgroundColor: 'var(--bg2)', borderColor: editingId ? 'var(--accent)' : 'var(--border)' }}>
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-sm" style={{ color: 'var(--text)' }}>
                {editingId ? '✏️ 編集' : '新しい定期登録'}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-xs" style={{ color: 'var(--text3)' }}>✕ キャンセル</button>
            </div>

            <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
              {(['expense', 'transfer'] as const).map(k => (
                <button key={k} type="button" onClick={() => setRecurringKind(k)}
                  className="flex-1 py-2 text-xs font-medium transition-colors"
                  style={{ backgroundColor: recurringKind === k ? 'var(--accent)' : 'var(--bg3)', color: recurringKind === k ? '#fff' : 'var(--text3)' }}>
                  {k === 'expense' ? '💸 支出' : '↔️ 振替'}
                </button>
              ))}
            </div>

            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder={recurringKind === 'expense' ? '例: 水道代、電気代' : '例: 積み立て、貯蓄'}
              className="rounded-xl border px-3 py-2 text-sm outline-none placeholder:opacity-40"
              style={inputStyle} />

            <div className="flex rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
              {(['fixed', 'variable'] as const).map(t => (
                <button key={t} type="button" onClick={() => setAmountType(t)}
                  className="flex-1 py-2 text-xs font-medium transition-colors"
                  style={{ backgroundColor: amountType === t ? 'var(--accent)' : 'var(--bg3)', color: amountType === t ? '#fff' : 'var(--text3)' }}>
                  {t === 'fixed' ? '固定（同じ金額）' : '変動（毎回入力）'}
                </button>
              ))}
            </div>

            {amountType === 'fixed' && (
              <div className="flex gap-2 items-center">
                <span style={{ color: 'var(--text3)' }}>¥</span>
                <input type="text" inputMode="numeric" value={amount ? Number(amount).toLocaleString() : ''} onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="金額" className="flex-1 rounded-xl border px-3 py-2 text-sm outline-none placeholder:opacity-40"
                  style={inputStyle} />
              </div>
            )}
            {amountType === 'variable' && (
              <p className="text-xs px-1" style={{ color: 'var(--text3)' }}>「今月分を登録」するときに金額を入力します</p>
            )}

            <div className="flex gap-2">
              <select value={frequency} onChange={e => setFrequency(e.target.value)}
                className="flex-1 rounded-xl border px-3 py-2 text-sm outline-none" style={inputStyle}>
                <option value="monthly">毎月</option>
                <option value="yearly">毎年</option>
              </select>
              <div className="flex items-center gap-1">
                <input type="number" value={dayOfMonth} onChange={e => setDayOfMonth(e.target.value)}
                  min="1" max="31" className="w-16 rounded-xl border px-3 py-2 text-sm outline-none" style={inputStyle} />
                <span className="text-sm" style={{ color: 'var(--text3)' }}>日</span>
              </div>
            </div>

            {recurringKind === 'expense' ? (
              <>
                <select value={expenseAccountId} onChange={e => setExpenseAccountId(e.target.value)}
                  className="rounded-xl border px-3 py-2 text-sm outline-none" style={inputStyle}>
                  <option value="">費用科目を選択</option>
                  {expenseAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <select value={paymentMethodId} onChange={e => setPaymentMethodId(e.target.value)}
                  className="rounded-xl border px-3 py-2 text-sm outline-none" style={inputStyle}>
                  <option value="">支払い口座を選択</option>
                  {paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </>
            ) : (
              <>
                <select value={paymentMethodId} onChange={e => setPaymentMethodId(e.target.value)}
                  className="rounded-xl border px-3 py-2 text-sm outline-none" style={inputStyle}>
                  <option value="">振替元（出る口座）</option>
                  {paymentMethods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select value={transferToAccountId} onChange={e => setTransferToAccountId(e.target.value)}
                  className="rounded-xl border px-3 py-2 text-sm outline-none" style={inputStyle}>
                  <option value="">振替先（入る口座）</option>
                  {assetAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </>
            )}

            <button onClick={handleSave}
              className="w-full text-white rounded-xl py-2.5 text-sm font-medium"
              style={{ backgroundColor: 'var(--accent)' }}>
              {editingId ? '変更を保存' : '登録する'}
            </button>
          </div>
        )}

        {recurrings.length === 0 && !showForm && (
          <p className="text-center py-8" style={{ color: 'var(--text3)' }}>定期支払いはまだありません</p>
        )}

        {/* 固定費 */}
        {fixed.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-xs font-semibold" style={{ color: 'var(--text2)' }}>💸 固定費</p>
              <p className="text-xs font-semibold" style={{ color: 'var(--text2)' }}>
                合計 <span className="text-sm" style={{ color: 'var(--accent)' }}>¥{fixedTotal.toLocaleString()}</span>
                <span style={{ color: 'var(--text3)', fontWeight: 'normal' }}>/月</span>
              </p>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e => handleDragEnd(e, fixed)}>
              <SortableContext items={fixed.map(r => r.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-3">
                  {fixed.map(rec => (
                    <SortableCard key={rec.id} id={rec.id}>
                      {handle => (
                        <div className="rounded-2xl border p-4"
                          style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)', opacity: rec.is_active ? 1 : 0.6 }}>
                          <div className="flex items-start gap-2">
                            {handle}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between mb-1">
                                <div>
                                  <p className="font-medium" style={{ color: 'var(--text)' }}>{rec.name}</p>
                                  <p className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>
                                    {rec.frequency === 'monthly' ? '毎月' : '毎年'}{rec.day_of_month}日 ・ {rec.accounts?.name} ・ {rec.payment_methods?.name}
                                  </p>
                                </div>
                                <p className="font-bold shrink-0 ml-2" style={{ color: 'var(--text)' }}>¥{rec.amount.toLocaleString()}</p>
                              </div>
                              {renderButtons(rec)}
                            </div>
                          </div>
                        </div>
                      )}
                    </SortableCard>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}

        {/* 変動費 */}
        {variable.length > 0 && (
          <div>
            <p className="text-xs font-semibold mb-2 px-1" style={{ color: 'var(--text2)' }}>📊 変動費</p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e => handleDragEnd(e, variable)}>
              <SortableContext items={variable.map(r => r.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-3">
                  {variable.map(rec => (
                    <SortableCard key={rec.id} id={rec.id}>
                      {handle => (
                        <div className="rounded-2xl border p-4"
                          style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)', opacity: rec.is_active ? 1 : 0.6 }}>
                          <div className="flex items-start gap-2">
                            {handle}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between mb-3">
                                <div>
                                  <p className="font-medium" style={{ color: 'var(--text)' }}>{rec.name}</p>
                                  <p className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>
                                    {rec.frequency === 'monthly' ? '毎月' : '毎年'}{rec.day_of_month}日ごろ ・ {rec.accounts?.name} ・ {rec.payment_methods?.name}
                                  </p>
                                </div>
                                <span className="text-xs px-2 py-1 rounded-lg shrink-0 ml-2" style={{ backgroundColor: 'var(--bg3)', color: 'var(--text3)' }}>変動</span>
                              </div>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-sm" style={{ color: 'var(--text3)' }}>¥</span>
                                <input type="text" inputMode="numeric" value={execAmounts[rec.id] ? Number(execAmounts[rec.id]).toLocaleString() : ''} onChange={e => setExecAmounts(prev => ({ ...prev, [rec.id]: e.target.value.replace(/[^0-9]/g, '') }))}
                                  placeholder="今月の金額を入力"
                                  className="flex-1 rounded-xl border px-3 py-2 text-sm outline-none placeholder:opacity-40"
                                  style={inputStyle} />
                              </div>
                              {renderButtons(rec, true)}
                            </div>
                          </div>
                        </div>
                      )}
                    </SortableCard>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}

        {/* 振替 */}
        {transfers.length > 0 && (
          <div>
            <p className="text-xs font-semibold mb-2 px-1" style={{ color: 'var(--text2)' }}>↔️ 振替</p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e => handleDragEnd(e, transfers)}>
              <SortableContext items={transfers.map(r => r.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-3">
                  {transfers.map(rec => (
                    <SortableCard key={rec.id} id={rec.id}>
                      {handle => (
                        <div className="rounded-2xl border p-4"
                          style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)', opacity: rec.is_active ? 1 : 0.6 }}>
                          <div className="flex items-start gap-2">
                            {handle}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between mb-1">
                                <div>
                                  <p className="font-medium" style={{ color: 'var(--text)' }}>{rec.name}</p>
                                  <p className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>
                                    {rec.frequency === 'monthly' ? '毎月' : '毎年'}{rec.day_of_month}日 ・ {rec.payment_methods?.name} → {rec.accounts?.name}
                                  </p>
                                </div>
                                {rec.amount > 0
                                  ? <p className="font-bold shrink-0 ml-2" style={{ color: 'var(--accent)' }}>¥{rec.amount.toLocaleString()}</p>
                                  : <span className="text-xs px-2 py-1 rounded-lg shrink-0 ml-2" style={{ backgroundColor: 'var(--bg3)', color: 'var(--text3)' }}>変動</span>
                                }
                              </div>
                              {isVariable(rec) && (
                                <div className="flex items-center gap-2 my-2">
                                  <span className="text-sm" style={{ color: 'var(--text3)' }}>¥</span>
                                  <input type="number" value={execAmounts[rec.id] ?? ''}
                                    onChange={e => setExecAmounts(prev => ({ ...prev, [rec.id]: e.target.value }))}
                                    placeholder="今月の金額を入力"
                                    className="flex-1 rounded-xl border px-3 py-2 text-sm outline-none placeholder:opacity-40"
                                    style={inputStyle} />
                                </div>
                              )}
                              {renderButtons(rec, isVariable(rec))}
                            </div>
                          </div>
                        </div>
                      )}
                    </SortableCard>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}
      </main>
    </Page>
  )
}
