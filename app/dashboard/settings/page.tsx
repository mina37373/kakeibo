'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { THEMES, useTheme, type ThemeId } from '@/lib/theme'
import { Page, Header, Card, Btn, Input, Select } from '@/components/ui'
import { useHousehold } from '@/lib/household'
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

type Account = { id: string; name: string; type: string; display_order: number }
type PaymentMethod = { id: string; name: string; kind: string; closing_day?: number | null; payment_day?: number | null; sort_index?: number; debit_pm_id?: string }

const KIND_LABELS: Record<string, string> = {
  cash: '現金', emoney: '電子マネー', bank: '銀行口座', credit_card: 'クレジットカード',
}
const KIND_ICONS: Record<string, string> = {
  cash: '💴', emoney: '📱', bank: '🏦', credit_card: '💳',
}

function SortableItem({ id, children }: { id: string; children: (handle: React.ReactNode) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 10 : undefined }
  const handle = (
    <span {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing px-1 touch-none select-none"
      style={{ color: 'var(--text3)', fontSize: 16, lineHeight: 1 }}>≡</span>
  )
  return <div ref={setNodeRef} style={style}>{children(handle)}</div>
}

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  expense: { label: '支出カテゴリ', color: '#ef4444' },
  income:  { label: '収入カテゴリ', color: '#22c55e' },
}

export default function SettingsPage() {
  const router = useRouter()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [newAccountName, setNewAccountName] = useState('')
  const [newAccountType, setNewAccountType] = useState('expense')
  const [newPmName, setNewPmName] = useState('')
  const [newPmKind, setNewPmKind] = useState('cash')
  const [newClosingDay, setNewClosingDay] = useState('25')
  const [newPaymentDay, setNewPaymentDay] = useState('10')
  const [newDebitPmId, setNewDebitPmId] = useState('')
  const [tab, setTab] = useState<'accounts' | 'payments' | 'theme' | 'opening' | 'alert'>('accounts')
  const [pinnedIds, setPinnedIds] = useState<string[]>([])

  useEffect(() => {
    setPinnedIds(JSON.parse(localStorage.getItem('pinned_accounts') ?? '[]'))
    setRecurringAlertDays(Number(localStorage.getItem('alert_recurring_days') ?? 7))
    setRecurringUrgentDays(Number(localStorage.getItem('alert_recurring_urgent') ?? 1))
    setCreditAlertDays(Number(localStorage.getItem('alert_credit_days') ?? 7))
    setCreditUrgentDays(Number(localStorage.getItem('alert_credit_urgent') ?? 1))
  }, [])

  const togglePin = (id: string) => {
    const next = pinnedIds.includes(id) ? pinnedIds.filter(p => p !== id) : [...pinnedIds, id]
    setPinnedIds(next)
    localStorage.setItem('pinned_accounts', JSON.stringify(next))
  }
  const [recurringAlertDays, setRecurringAlertDays] = useState(7)
  const [recurringUrgentDays, setRecurringUrgentDays] = useState(1)
  const [creditAlertDays, setCreditAlertDays] = useState(7)
  const [creditUrgentDays, setCreditUrgentDays] = useState(1)
  const { themeId, setThemeId } = useTheme()
  const { householdId, inviteCode, members, joinHousehold } = useHousehold()
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const [joinSuccess, setJoinSuccess] = useState(false)
  const [joining, setJoining] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
      else fetchData()
    })
  }, [router])

  const fetchData = async () => {
    const { data: accs } = await supabase.from('accounts').select('*').order('display_order')
    if (accs) setAccounts(accs)
    const { data: pms } = await supabase.from('payment_methods').select('*').order('created_at')
    if (pms) {
      // Restore saved order from localStorage
      const savedOrder: string[] = JSON.parse(localStorage.getItem('pm_order') ?? '[]')
      if (savedOrder.length > 0) {
        const map = Object.fromEntries(pms.map((p: PaymentMethod) => [p.id, p]))
        const ordered = [
          ...savedOrder.filter(id => map[id]).map(id => map[id]),
          ...pms.filter((p: PaymentMethod) => !savedOrder.includes(p.id)),
        ]
        setPaymentMethods(ordered)
      } else {
        setPaymentMethods(pms)
      }
    }
  }

  const handleJoin = async () => {
    if (!joinCode.trim()) return
    setJoining(true); setJoinError('')
    const { error } = await joinHousehold(joinCode)
    if (error) setJoinError(error)
    else { setJoinSuccess(true); setJoinCode('') }
    setJoining(false)
  }

  const addAccount = async () => {
    if (!newAccountName.trim()) return
    await supabase.from('accounts').insert({ name: newAccountName.trim(), type: newAccountType, display_order: accounts.length, household_id: householdId })
    setNewAccountName('')
    fetchData()
  }

  const deleteAccount = async (id: string) => {
    if (!confirm('削除しますか？')) return
    await supabase.from('accounts').delete().eq('id', id)
    fetchData()
  }

  const addPaymentMethod = async () => {
    if (!newPmName.trim()) return
    const accountType = newPmKind === 'credit_card' ? 'liability' : 'asset'
    const { data: acc } = await supabase
      .from('accounts').insert({ name: newPmName.trim(), type: accountType, display_order: 99, household_id: householdId }).select().single()
    if (acc) {
      const { data: pm } = await supabase.from('payment_methods').insert({
        name: newPmName.trim(), kind: newPmKind, account_id: acc.id, household_id: householdId,
        closing_day: newPmKind === 'credit_card' ? Number(newClosingDay) : null,
        payment_day: newPmKind === 'credit_card' ? Number(newPaymentDay) : null,
      }).select().single()
      if (pm && newPmKind === 'credit_card' && newDebitPmId) {
        const map: Record<string, string> = JSON.parse(localStorage.getItem('cc_bank_map') ?? '{}')
        map[pm.id] = newDebitPmId
        localStorage.setItem('cc_bank_map', JSON.stringify(map))
      }
    }
    setNewPmName('')
    setNewDebitPmId('')
    fetchData()
  }

  const deletePaymentMethod = async (id: string) => {
    if (!confirm('削除しますか？')) return
    await supabase.from('payment_methods').delete().eq('id', id)
    fetchData()
  }

  const expenseAccounts = accounts.filter(a => a.type === 'expense')
  const incomeAccounts = accounts.filter(a => a.type === 'income')
  const assetAccounts = accounts.filter(a => a.type === 'asset')
  const liabilityAccounts = accounts.filter(a => a.type === 'liability')

  const [openingBalances, setOpeningBalances] = useState<Record<string, string>>({})
  const [openingSaving, setOpeningSaving] = useState(false)
  const [openingSaved, setOpeningSaved] = useState(false)

  // 既存の繰越仕訳を読み込む
  const fetchOpeningBalances = async () => {
    const { data } = await supabase
      .from('journal_entries')
      .select('account_id, debit_amount, credit_amount, transactions!inner(description)')
      .eq('transactions.description', '繰越残高')
    if (data) {
      const map: Record<string, string> = {}
      data.forEach((e: any) => {
        if (e.debit_amount > 0) map[e.account_id] = String(e.debit_amount)   // 資産
        if (e.credit_amount > 0) map[e.account_id] = String(e.credit_amount) // 負債
      })
      setOpeningBalances(map)
    }
  }

  useEffect(() => { if (tab === 'opening') fetchOpeningBalances() }, [tab])

  const saveOpeningBalances = async () => {
    setOpeningSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    // 既存の繰越仕訳をすべて削除してから再登録
    const { data: oldTxns } = await supabase
      .from('transactions').select('id').eq('description', '繰越残高')
    if (oldTxns && oldTxns.length > 0) {
      const ids = oldTxns.map((t: any) => t.id)
      await supabase.from('journal_entries').delete().in('transaction_id', ids)
      await supabase.from('transactions').delete().in('id', ids)
    }

    // 金額が入力されている口座のみ登録
    const liabilityIds = new Set(liabilityAccounts.map(a => a.id))
    for (const [accountId, amtStr] of Object.entries(openingBalances)) {
      const amt = Number(amtStr)
      if (!amt || amt <= 0) continue
      const { data: txn } = await supabase.from('transactions')
        .insert({ date: '2000-01-01', description: '繰越残高', created_by: session.user.id, household_id: householdId })
        .select().single()
      if (txn) {
        const isLiability = liabilityIds.has(accountId)
        await supabase.from('journal_entries').insert([
          // 資産: 借方に入れる / 負債: 貸方に入れる（残高増加の方向）
          {
            transaction_id: txn.id, account_id: accountId,
            debit_amount: isLiability ? 0 : amt,
            credit_amount: isLiability ? amt : 0,
          },
        ])
      }
    }
    setOpeningSaving(false)
    setOpeningSaved(true)
    setTimeout(() => setOpeningSaved(false), 2000)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  const handleAccountDragEnd = async (event: DragEndEvent, type: string) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const list = accounts.filter(a => a.type === type)
    const oldIdx = list.findIndex(a => a.id === active.id)
    const newIdx = list.findIndex(a => a.id === over.id)
    const reordered = arrayMove(list, oldIdx, newIdx)
    // optimistic update
    setAccounts(prev => {
      const others = prev.filter(a => a.type !== type)
      return [...others, ...reordered.map((a, i) => ({ ...a, display_order: i }))]
    })
    // DB更新
    await Promise.all(reordered.map((a, i) =>
      supabase.from('accounts').update({ display_order: i }).eq('id', a.id)
    ))
  }

  const handlePmDragEnd = (event: DragEndEvent, kind: string) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setPaymentMethods(prev => {
      const kindItems = prev.filter(p => p.kind === kind)
      const others = prev.filter(p => p.kind !== kind)
      const oldIdx = kindItems.findIndex(p => p.id === active.id)
      const newIdx = kindItems.findIndex(p => p.id === over.id)
      const reordered = arrayMove(kindItems, oldIdx, newIdx)
      const next = [...others, ...reordered]
      localStorage.setItem('pm_order', JSON.stringify(next.map(p => p.id)))
      return next
    })
  }

  const tabs = [
    { id: 'accounts', label: '費用科目' },
    { id: 'payments', label: '資産科目' },
    { id: 'opening', label: '繰越残高' },
    { id: 'theme', label: 'テーマ' },
    { id: 'alert', label: 'アラート' },
  ] as const

  return (
    <Page>
      <Header title="設定" backPath="/dashboard" />

      {/* タブ */}
      <div className="flex border-b" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex-1 py-3 text-xs font-medium transition-colors"
            style={{ color: tab === t.id ? 'var(--accent)' : 'var(--text3)', borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <main className="max-w-lg mx-auto p-4 flex flex-col gap-4">

        {/* 費用科目 */}
        {tab === 'accounts' && (
          <>
            <Card>
              <p className="text-xs font-medium mb-3" style={{ color: 'var(--text2)' }}>新しい科目を追加</p>
              <div className="flex gap-2 mb-2">
                <Select value={newAccountType} onChange={setNewAccountType}>
                  <option value="expense">支出</option>
                  <option value="income">収入</option>
                </Select>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newAccountName}
                  onChange={e => setNewAccountName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addAccount()}
                  placeholder="食費、給与..."
                  className="flex-1 rounded-xl border px-3 py-2 text-sm outline-none placeholder:opacity-40"
                  style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)' }}
                />
                <Btn onClick={addAccount}>追加</Btn>
              </div>
            </Card>

            {/* 支出科目 */}
            <div>
              <p className="text-xs font-semibold mb-2 px-1" style={{ color: '#ef4444' }}>支出科目</p>
              {expenseAccounts.length === 0 ? (
                <p className="text-sm text-center py-4" style={{ color: 'var(--text3)' }}>まだありません</p>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e => handleAccountDragEnd(e, 'expense')}>
                  <SortableContext items={expenseAccounts.map(a => a.id)} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-1.5">
                      {expenseAccounts.map(acc => (
                        <SortableItem key={acc.id} id={acc.id}>
                          {handle => (
                            <div className="rounded-xl border px-3 py-3 flex items-center gap-2"
                              style={{ backgroundColor: 'var(--bg2)', borderColor: pinnedIds.includes(acc.id) ? 'var(--accent)' : 'var(--border)' }}>
                              {handle}
                              <span className="w-2 h-2 rounded-full bg-red-500 inline-block shrink-0" />
                              <span className="text-sm flex-1" style={{ color: 'var(--text)' }}>{acc.name}</span>
                              <button onClick={() => togglePin(acc.id)} className="text-sm px-1" title="ピン留め">
                                {pinnedIds.includes(acc.id) ? '📌' : '📍'}
                              </button>
                              <button onClick={() => deleteAccount(acc.id)} className="text-xs opacity-40 hover:opacity-100" style={{ color: 'var(--text3)' }}>削除</button>
                            </div>
                          )}
                        </SortableItem>
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>

            {/* 収入科目 */}
            <div>
              <p className="text-xs font-semibold mb-2 px-1" style={{ color: '#22c55e' }}>収入科目</p>
              {incomeAccounts.length === 0 ? (
                <p className="text-sm text-center py-4" style={{ color: 'var(--text3)' }}>まだありません</p>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e => handleAccountDragEnd(e, 'income')}>
                  <SortableContext items={incomeAccounts.map(a => a.id)} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-1.5">
                      {incomeAccounts.map(acc => (
                        <SortableItem key={acc.id} id={acc.id}>
                          {handle => (
                            <div className="rounded-xl border px-3 py-3 flex items-center gap-2"
                              style={{ backgroundColor: 'var(--bg2)', borderColor: pinnedIds.includes(acc.id) ? 'var(--accent)' : 'var(--border)' }}>
                              {handle}
                              <span className="w-2 h-2 rounded-full bg-green-500 inline-block shrink-0" />
                              <span className="text-sm flex-1" style={{ color: 'var(--text)' }}>{acc.name}</span>
                              <button onClick={() => togglePin(acc.id)} className="text-sm px-1" title="ピン留め">
                                {pinnedIds.includes(acc.id) ? '📌' : '📍'}
                              </button>
                              <button onClick={() => deleteAccount(acc.id)} className="text-xs opacity-40 hover:opacity-100" style={{ color: 'var(--text3)' }}>削除</button>
                            </div>
                          )}
                        </SortableItem>
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </>
        )}

        {/* 支払い方法 */}
        {tab === 'payments' && (
          <>
            <Card>
              <p className="text-xs font-medium mb-3" style={{ color: 'var(--text2)' }}>新しい資産科目を追加</p>
              <div className="flex flex-col gap-2">
                <Select value={newPmKind} onChange={setNewPmKind}>
                  <option value="cash">現金</option>
                  <option value="emoney">電子マネー</option>
                  <option value="bank">銀行口座</option>
                  <option value="credit_card">クレジットカード</option>
                </Select>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newPmName}
                    onChange={e => setNewPmName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addPaymentMethod()}
                    placeholder="現金、PayPay、楽天カード..."
                    className="flex-1 rounded-xl border px-3 py-2 text-sm outline-none placeholder:opacity-40"
                    style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  />
                  <Btn onClick={addPaymentMethod}>追加</Btn>
                </div>
                {newPmKind === 'credit_card' && (
                  <div className="flex flex-col gap-2 mt-1">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="block text-xs mb-1" style={{ color: 'var(--text3)' }}>締め日</label>
                        <div className="flex items-center gap-1">
                          <input type="number" value={newClosingDay} onChange={e => setNewClosingDay(e.target.value)} min="1" max="31"
                            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                            style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)' }} />
                          <span className="text-xs shrink-0" style={{ color: 'var(--text3)' }}>日</span>
                        </div>
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs mb-1" style={{ color: 'var(--text3)' }}>引き落とし日</label>
                        <div className="flex items-center gap-1">
                          <input type="number" value={newPaymentDay} onChange={e => setNewPaymentDay(e.target.value)} min="1" max="31"
                            className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                            style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)' }} />
                          <span className="text-xs shrink-0" style={{ color: 'var(--text3)' }}>日</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs mb-1" style={{ color: 'var(--text3)' }}>引き落とし口座（省略可）</label>
                      <select value={newDebitPmId} onChange={e => setNewDebitPmId(e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm outline-none"
                        style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)' }}>
                        <option value="">未設定</option>
                        {paymentMethods.filter(p => ['bank', 'cash', 'emoney'].includes(p.kind)).map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {(['cash', 'bank', 'emoney', 'credit_card'] as const).map(kind => {
              const items = paymentMethods.filter(pm => pm.kind === kind)
              if (items.length === 0) return null
              return (
                <div key={kind}>
                  <p className="text-xs font-semibold mb-2 px-1" style={{ color: 'var(--text2)' }}>
                    {KIND_ICONS[kind]} {KIND_LABELS[kind]}
                  </p>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={e => handlePmDragEnd(e, kind)}>
                    <SortableContext items={items.map(p => p.id)} strategy={verticalListSortingStrategy}>
                      <div className="flex flex-col gap-1.5">
                        {items.map(pm => {
                          const ccBankMap: Record<string, string> = typeof window !== 'undefined'
                            ? JSON.parse(localStorage.getItem('cc_bank_map') ?? '{}') : {}
                          const linkedPm = pm.kind === 'credit_card' ? paymentMethods.find(p => p.id === ccBankMap[pm.id]) : null
                          return (
                            <SortableItem key={pm.id} id={pm.id}>
                              {handle => (
                                <div className="rounded-xl border px-3 py-3 flex items-center gap-2"
                                  style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
                                  {handle}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm" style={{ color: 'var(--text)' }}>{pm.name}</p>
                                    {pm.kind === 'credit_card' && pm.closing_day && (
                                      <p className="text-xs" style={{ color: 'var(--text3)' }}>
                                        締め{pm.closing_day}日 / 引き落とし{pm.payment_day}日
                                        {linkedPm ? ` / 🏦 ${linkedPm.name}` : ''}
                                      </p>
                                    )}
                                    {pm.kind === 'credit_card' && (
                                      <select
                                        value={ccBankMap[pm.id] ?? ''}
                                        onChange={e => {
                                          const map: Record<string, string> = JSON.parse(localStorage.getItem('cc_bank_map') ?? '{}')
                                          if (e.target.value) map[pm.id] = e.target.value
                                          else delete map[pm.id]
                                          localStorage.setItem('cc_bank_map', JSON.stringify(map))
                                          // force re-render
                                          setPaymentMethods(prev => [...prev])
                                        }}
                                        className="mt-1 w-full rounded-lg border px-2 py-1 text-xs outline-none"
                                        style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text3)' }}>
                                        <option value="">引き落とし口座：未設定</option>
                                        {paymentMethods.filter(p => ['bank', 'cash', 'emoney'].includes(p.kind)).map(p => (
                                          <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                      </select>
                                    )}
                                  </div>
                                  <button onClick={() => deletePaymentMethod(pm.id)} className="text-xs opacity-40 hover:opacity-100 shrink-0" style={{ color: 'var(--text3)' }}>削除</button>
                                </div>
                              )}
                            </SortableItem>
                          )
                        })}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>
              )
            })}
          </>
        )}

        {/* 繰越残高 */}
        {tab === 'opening' && (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
              <p className="text-xs" style={{ color: 'var(--text3)' }}>アプリ使い始め時点の各口座の残高を入力してください。貸借対照表の残高に反映されます。</p>
            </div>

            {/* 資産口座 */}
            {assetAccounts.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-2 px-1" style={{ color: 'var(--accent)' }}>資産口座</p>
                <div className="flex flex-col gap-2">
                  {assetAccounts.map(acc => (
                    <div key={acc.id} className="rounded-xl border px-4 py-3 flex items-center gap-3"
                      style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
                      <span className="text-sm flex-1" style={{ color: 'var(--text)' }}>{acc.name}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-sm" style={{ color: 'var(--text3)' }}>¥</span>
                        <input type="number" value={openingBalances[acc.id] ?? ''}
                          onChange={e => setOpeningBalances(prev => ({ ...prev, [acc.id]: e.target.value }))}
                          placeholder="0"
                          className="w-32 rounded-xl border px-3 py-2 text-sm outline-none text-right"
                          style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 負債口座（クレカなど） */}
            {liabilityAccounts.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-2 px-1" style={{ color: '#f87171' }}>クレジットカード・ローン（残高 = 未払い額）</p>
                <div className="flex flex-col gap-2">
                  {liabilityAccounts.map(acc => (
                    <div key={acc.id} className="rounded-xl border px-4 py-3 flex items-center gap-3"
                      style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
                      <span className="text-sm flex-1" style={{ color: 'var(--text)' }}>{acc.name}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-sm" style={{ color: '#f87171' }}>¥</span>
                        <input type="number" value={openingBalances[acc.id] ?? ''}
                          onChange={e => setOpeningBalances(prev => ({ ...prev, [acc.id]: e.target.value }))}
                          placeholder="0"
                          className="w-32 rounded-xl border px-3 py-2 text-sm outline-none text-right"
                          style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: '#f87171' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {assetAccounts.length === 0 && liabilityAccounts.length === 0 && (
              <p className="text-sm text-center py-4" style={{ color: 'var(--text3)' }}>資産科目を先に追加してください</p>
            )}
            <button onClick={saveOpeningBalances} disabled={openingSaving}
              className="w-full text-white rounded-2xl py-4 text-sm font-bold disabled:opacity-40"
              style={{ backgroundColor: 'var(--accent)' }}>
              {openingSaved ? '✓ 保存しました' : openingSaving ? '保存中...' : '繰越残高を保存'}
            </button>
          </div>
        )}

        {/* テーマ */}
        {tab === 'theme' && (
          <div className="flex flex-col gap-6">
            {['ライト', 'くすみ', 'パステル', '原色', 'ビビッド', 'ダーク', 'フルカラー'].map(category => (
              <div key={category}>
                <p className="text-xs font-semibold mb-2 px-1" style={{ color: 'var(--text2)' }}>{category}</p>
                <div className="grid grid-cols-2 gap-2">
                  {THEMES.filter(t => t.category === category).map(theme => (
                    <button
                      key={theme.id}
                      onClick={() => setThemeId(theme.id)}
                      className="flex items-center gap-3 p-3 rounded-xl border text-left transition-all active:scale-95"
                      style={{
                        backgroundColor: 'var(--bg2)',
                        borderColor: themeId === theme.id ? 'var(--accent)' : 'var(--border)',
                        boxShadow: themeId === theme.id ? '0 0 0 1px var(--accent)' : 'none',
                      }}
                    >
                      <div className="w-8 h-8 rounded-lg shrink-0 border" style={{ background: theme.preview, borderColor: 'var(--border)' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{theme.label}</p>
                        {themeId === theme.id && <p className="text-xs" style={{ color: 'var(--accent)' }}>✓ 選択中</p>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === 'alert' && (
          <div className="flex flex-col gap-4">
            {/* 定期支払いアラート */}
            <div className="rounded-2xl border p-4 flex flex-col gap-4" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
              <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>🏦 銀行引き落とし（定期支払い）</p>
              <div>
                <label className="block text-xs mb-2" style={{ color: 'var(--text3)' }}>何日前から表示する？</label>
                <div className="flex gap-2 flex-wrap">
                  {[3, 5, 7, 10, 14].map(d => (
                    <button key={d} type="button"
                      onClick={() => { setRecurringAlertDays(d); localStorage.setItem('alert_recurring_days', String(d)) }}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium border"
                      style={{
                        backgroundColor: recurringAlertDays === d ? 'var(--accent)' : 'var(--bg3)',
                        borderColor: recurringAlertDays === d ? 'var(--accent)' : 'var(--border)',
                        color: recurringAlertDays === d ? '#fff' : 'var(--text)',
                      }}>{d}日前</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs mb-2" style={{ color: 'var(--text3)' }}>何日前から強調（黄色）表示？</label>
                <div className="flex gap-2 flex-wrap">
                  {[0, 1, 2, 3].map(d => (
                    <button key={d} type="button"
                      onClick={() => { setRecurringUrgentDays(d); localStorage.setItem('alert_recurring_urgent', String(d)) }}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium border"
                      style={{
                        backgroundColor: recurringUrgentDays === d ? 'var(--accent)' : 'var(--bg3)',
                        borderColor: recurringUrgentDays === d ? 'var(--accent)' : 'var(--border)',
                        color: recurringUrgentDays === d ? '#fff' : 'var(--text)',
                      }}>{d === 0 ? '当日のみ' : `${d}日前から`}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* クレカアラート */}
            <div className="rounded-2xl border p-4 flex flex-col gap-4" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
              <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>💳 クレジットカード引き落とし</p>
              <div>
                <label className="block text-xs mb-2" style={{ color: 'var(--text3)' }}>何日前から表示する？</label>
                <div className="flex gap-2 flex-wrap">
                  {[3, 5, 7, 10, 14].map(d => (
                    <button key={d} type="button"
                      onClick={() => { setCreditAlertDays(d); localStorage.setItem('alert_credit_days', String(d)) }}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium border"
                      style={{
                        backgroundColor: creditAlertDays === d ? 'var(--accent)' : 'var(--bg3)',
                        borderColor: creditAlertDays === d ? 'var(--accent)' : 'var(--border)',
                        color: creditAlertDays === d ? '#fff' : 'var(--text)',
                      }}>{d}日前</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs mb-2" style={{ color: 'var(--text3)' }}>何日前から強調（黄色）表示？</label>
                <div className="flex gap-2 flex-wrap">
                  {[0, 1, 2, 3].map(d => (
                    <button key={d} type="button"
                      onClick={() => { setCreditUrgentDays(d); localStorage.setItem('alert_credit_urgent', String(d)) }}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium border"
                      style={{
                        backgroundColor: creditUrgentDays === d ? 'var(--accent)' : 'var(--bg3)',
                        borderColor: creditUrgentDays === d ? 'var(--accent)' : 'var(--border)',
                        color: creditUrgentDays === d ? '#fff' : 'var(--text)',
                      }}>{d === 0 ? '当日のみ' : `${d}日前から`}</button>
                  ))}
                </div>
              </div>
            </div>

            <p className="text-xs text-center" style={{ color: 'var(--text3)' }}>設定はこの端末に保存されます</p>
          </div>
        )}

      </main>
    </Page>
  )
}
