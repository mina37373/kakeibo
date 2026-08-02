'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Page, Header } from '@/components/ui'
import { useHousehold } from '@/lib/household'

type CreditCard = { id: string; name: string; account_id: string; closing_day: number | null; payment_day: number | null }
type BankAccount = { id: string; name: string; account_id: string }

const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
const fmtFull = (d: Date) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`

// 締め済みで次回引き落とし待ちのサイクルを計算
function getPendingCycle(closingDay: number, paymentDay: number) {
  const today = new Date()
  const y = today.getFullYear()
  const m = today.getMonth()

  const closingThisMonth = new Date(y, m, closingDay)

  let cycleStart: Date, cycleEnd: Date, paymentDate: Date

  if (today <= closingThisMonth) {
    // 締め日前 → 先々月締め+1 〜 先月締め が引き落とし待ち、今月paymentDayに引き落とし
    cycleEnd = new Date(y, m - 1, closingDay)
    cycleStart = new Date(y, m - 2, closingDay + 1)
    paymentDate = new Date(y, m, paymentDay)
  } else {
    // 締め日後 → 先月締め+1 〜 今月締め が引き落とし待ち、翌月paymentDayに引き落とし
    cycleEnd = closingThisMonth
    cycleStart = new Date(y, m - 1, closingDay + 1)
    paymentDate = new Date(y, m + 1, paymentDay)
  }

  return {
    periodLabel: `${fmt(cycleStart)} 〜 ${fmt(cycleEnd)}`,
    paymentLabel: fmtFull(paymentDate),
    cycleStartStr: cycleStart.toISOString().slice(0, 10),
    cycleEndStr: cycleEnd.toISOString().slice(0, 10),
    paymentDateStr: paymentDate.toISOString().slice(0, 10),
  }
}

// 現在進行中のサイクルを計算
function getBillingCycle(closingDay: number, paymentDay: number) {
  const today = new Date()
  const y = today.getFullYear()
  const m = today.getMonth()

  const closingThisMonth = new Date(y, m, closingDay)

  let cycleStart: Date, cycleEnd: Date, paymentDate: Date

  if (today <= closingThisMonth) {
    cycleEnd = closingThisMonth
    cycleStart = new Date(y, m - 1, closingDay + 1)
    paymentDate = new Date(y, m + 1, paymentDay)
  } else {
    cycleStart = new Date(y, m, closingDay + 1)
    cycleEnd = new Date(y, m + 1, closingDay)
    paymentDate = new Date(y, m + 2, paymentDay)
  }

  return {
    periodLabel: `${fmt(cycleStart)} 〜 ${fmt(cycleEnd)}`,
    paymentLabel: fmtFull(paymentDate),
    cycleStartStr: cycleStart.toISOString().slice(0, 10),
    cycleEndStr: cycleEnd.toISOString().slice(0, 10),
    paymentDateStr: paymentDate.toISOString().slice(0, 10),
  }
}

function CardCycleInfo({ c, card, pendingBalances, cycleBalances }: {
  c: ReturnType<typeof getBillingCycle>
  card: CreditCard
  pendingBalances: Record<string, number>
  cycleBalances: Record<string, number>
}) {
  const pending = card.closing_day && card.payment_day ? getPendingCycle(card.closing_day, card.payment_day) : null
  const pendingAmt = pendingBalances[card.id] ?? 0
  return (
    <div className="flex flex-col gap-3">
      {pending && (
        <div className="rounded-xl p-3 border" style={{ backgroundColor: 'var(--bg3)', borderColor: pendingAmt > 0 ? '#f87171' : 'var(--border)' }}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold" style={{ color: pendingAmt > 0 ? '#f87171' : 'var(--text3)' }}>
              🔔 引き落とし予定
            </span>
            <span className="text-base font-bold" style={{ color: pendingAmt > 0 ? '#f87171' : 'var(--text3)' }}>
              ¥{pendingAmt.toLocaleString()}
            </span>
          </div>
          <span className="text-xs" style={{ color: 'var(--text3)' }}>
            {pending.periodLabel}分 → {pending.paymentLabel}
          </span>
        </div>
      )}
      <div className="flex justify-between items-center">
        <span className="text-xs" style={{ color: 'var(--text3)' }}>今サイクル（{c.periodLabel}）</span>
        <span className="text-sm font-medium" style={{ color: 'var(--text2)' }}>¥{(cycleBalances[card.id] ?? 0).toLocaleString()}</span>
      </div>
      <div className="text-xs" style={{ color: 'var(--text3)' }}>
        毎月{card.closing_day}日締め / 翌月{card.payment_day}日払い
      </div>
    </div>
  )
}

export default function CreditPaymentPage() {
  const router = useRouter()
  const { householdId } = useHousehold()
  const [cards, setCards] = useState<CreditCard[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [pendingBalances, setPendingBalances] = useState<Record<string, number>>({}) // 締め済み引き落とし待ち
  const [cycleBalances, setCycleBalances] = useState<Record<string, number>>({}) // 今サイクル進行中
  const [selectedCardId, setSelectedCardId] = useState('')
  const [selectedBankPmId, setSelectedBankPmId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
      else fetchData()
    })
  }, [router])

  const fetchData = async () => {
    const { data: pms } = await supabase.from('payment_methods').select('*, accounts(id, name)').order('created_at')
    if (!pms) return

    const creditCards: CreditCard[] = pms.filter((p: any) => p.kind === 'credit_card').map((p: any) => ({
      id: p.id, name: p.name, account_id: p.accounts?.id,
      closing_day: p.closing_day, payment_day: p.payment_day,
    }))
    setCards(creditCards)
    setBankAccounts(pms.filter((p: any) => ['bank', 'emoney', 'cash'].includes(p.kind)).map((p: any) => ({
      id: p.id, name: p.name, account_id: p.accounts?.id,
    })))

    // 全仕訳を取得して残高計算
    const { data: entries } = await supabase
      .from('journal_entries')
      .select('debit_amount, credit_amount, account_id, transactions!inner(date)')

    if (entries) {
      const totalBal: Record<string, number> = {}
      const pendingBal: Record<string, number> = {}
      const cycleBal: Record<string, number> = {}

      creditCards.forEach(card => {
        if (!card.account_id) return
        const cardEntries = entries.filter((e: any) => e.account_id === card.account_id)

        // 累計残高（全期間: 未払い合計）
        const cr = cardEntries.reduce((s: number, e: any) => s + (e.credit_amount ?? 0), 0)
        const dr = cardEntries.reduce((s: number, e: any) => s + (e.debit_amount ?? 0), 0)
        totalBal[card.id] = Math.max(0, cr - dr)

        if (card.closing_day && card.payment_day) {
          // 締め済み・引き落とし待ちサイクル
          const pending = getPendingCycle(card.closing_day, card.payment_day)
          const pendingEntries = cardEntries.filter((e: any) => {
            const d = e.transactions?.date ?? ''
            return d >= pending.cycleStartStr && d <= pending.cycleEndStr && (e.credit_amount ?? 0) > 0
          })
          pendingBal[card.id] = pendingEntries.reduce((s: number, e: any) => s + e.credit_amount, 0)

          // 今の締めサイクル内の支出（進行中）
          const cycle = getBillingCycle(card.closing_day, card.payment_day)
          const cycleEntries = cardEntries.filter((e: any) => {
            const d = e.transactions?.date ?? ''
            return d >= cycle.cycleStartStr && d <= cycle.cycleEndStr && (e.credit_amount ?? 0) > 0
          })
          cycleBal[card.id] = cycleEntries.reduce((s: number, e: any) => s + e.credit_amount, 0)
        }
      })
      setBalances(totalBal)
      setPendingBalances(pendingBal)
      setCycleBalances(cycleBal)
    }
  }

  const selectedCard = cards.find(c => c.id === selectedCardId)
  const selectedBankPm = bankAccounts.find(b => b.id === selectedBankPmId)
  const cycle = selectedCard?.closing_day && selectedCard?.payment_day
    ? getBillingCycle(selectedCard.closing_day, selectedCard.payment_day) : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCard || !selectedBankPm || !amount) return
    setLoading(true)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const payAmt = Number(amount)
    const { data: txn } = await supabase.from('transactions')
      .insert({ date, description: `${selectedCard.name} 引き落とし`, created_by: session.user.id, household_id: householdId })
      .select().single()

    if (txn) {
      await supabase.from('journal_entries').insert([
        { transaction_id: txn.id, account_id: selectedCard.account_id, debit_amount: payAmt, credit_amount: 0 },
        { transaction_id: txn.id, account_id: selectedBankPm.account_id, debit_amount: 0, credit_amount: payAmt },
      ])
      setSuccess(true)
      setAmount('')
      fetchData()
    }
    setLoading(false)
  }

  return (
    <Page>
      <Header title="クレカ引き落とし" backPath="/dashboard" />
      <main className="max-w-lg mx-auto p-4 flex flex-col gap-4">

        {success && (
          <div className="rounded-2xl border p-4 text-center" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--accent)' }}>
            <p className="font-medium" style={{ color: 'var(--accent)' }}>✓ 引き落とし仕訳を登録しました</p>
            <button onClick={() => setSuccess(false)} className="text-xs mt-1" style={{ color: 'var(--text3)' }}>閉じる</button>
          </div>
        )}

        {/* カードごとの締め情報 */}
        {cards.map(card => {
          const c = card.closing_day && card.payment_day
            ? getBillingCycle(card.closing_day, card.payment_day) : null
          const ccBankMap: Record<string, string> = typeof window !== 'undefined'
            ? JSON.parse(localStorage.getItem('cc_bank_map') ?? '{}') : {}
          const debitBankName = ccBankMap[card.id]
            ? (bankAccounts.find(b => b.id === ccBankMap[card.id])?.name ?? null) : null
          return (
            <div key={card.id} className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>💳 {card.name}</p>
                  {debitBankName && <p className="text-xs" style={{ color: 'var(--text3)' }}>🏦 {debitBankName}</p>}
                </div>
                <span className="text-lg font-bold" style={{ color: 'var(--text)' }}>
                  ¥{(balances[card.id] ?? 0).toLocaleString()}
                </span>
              </div>
              {c ? (
                <CardCycleInfo
                  c={c}
                  card={card}
                  pendingBalances={pendingBalances}
                  cycleBalances={cycleBalances}
                />
              ) : (
                <p className="text-xs" style={{ color: 'var(--text3)' }}>設定から締め日・引き落とし日を設定してください</p>
              )}
            </div>
          )
        })}

        {cards.length === 0 && (
          <div className="rounded-2xl border p-6 text-center" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--text3)' }}>クレジットカードがありません</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>設定 → 支払い方法 から追加してください</p>
          </div>
        )}

        {/* 引き落とし処理フォーム */}
        {cards.length > 0 && (
          <form onSubmit={handleSubmit} className="rounded-2xl border p-4 flex flex-col gap-4"
            style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
            <p className="text-xs font-medium" style={{ color: 'var(--text2)' }}>引き落とし処理</p>

            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text3)' }}>クレジットカード</label>
              <select value={selectedCardId} onChange={e => {
                const cardId = e.target.value
                setSelectedCardId(cardId)
                // 引き落とし予定額（締め済みサイクル）を自動入力、なければ未払い合計
                const pendingAmt = pendingBalances[cardId]
                const totalAmt = balances[cardId]
                setAmount(String(pendingAmt && pendingAmt > 0 ? pendingAmt : totalAmt ?? ''))
                // 次回引き落とし日を自動セット
                const card = cards.find(c => c.id === cardId)
                if (card?.closing_day && card?.payment_day) {
                  setDate(getBillingCycle(card.closing_day, card.payment_day).paymentDateStr)
                } else {
                  setDate(new Date().toISOString().slice(0, 10))
                }
                // 引き落とし口座を自動セット
                const ccBankMap: Record<string, string> = JSON.parse(localStorage.getItem('cc_bank_map') ?? '{}')
                if (ccBankMap[cardId]) setSelectedBankPmId(ccBankMap[cardId])
              }}
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)' }}>
                <option value="">選択してください</option>
                {cards.map(c => <option key={c.id} value={c.id}>{c.name}（未払 ¥{(balances[c.id] ?? 0).toLocaleString()}）</option>)}
              </select>
            </div>

            {cycle && (
              <div className="rounded-xl p-3 text-xs flex flex-col gap-1" style={{ backgroundColor: 'var(--bg3)' }}>
                <p style={{ color: 'var(--text2)' }}>対象期間：{cycle.periodLabel}</p>
                <p style={{ color: 'var(--text3)' }}>引き落とし予定：{cycle.paymentLabel}</p>
              </div>
            )}

            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text3)' }}>引き落とし口座</label>
              <select value={selectedBankPmId} onChange={e => setSelectedBankPmId(e.target.value)}
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none"
                style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)' }}>
                <option value="">選択してください</option>
                {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text3)' }}>金額</label>
              <div className="flex items-center gap-2 rounded-xl border px-3 py-2.5"
                style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)' }}>
                <span style={{ color: 'var(--text3)' }}>¥</span>
                <input type="text" inputMode="numeric" value={amount ? Number(amount).toLocaleString() : ''} onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="0" className="flex-1 bg-transparent outline-none text-sm"
                  style={{ color: 'var(--text)' }} />
              </div>
            </div>

            <button type="submit" disabled={loading || !selectedCardId || !selectedBankPmId || !amount}
              className="w-full text-white rounded-2xl py-4 text-sm font-bold disabled:opacity-40"
              style={{ backgroundColor: 'var(--accent)' }}>
              {loading ? '処理中...' : '引き落とし仕訳を登録'}
            </button>
          </form>
        )}
      </main>
    </Page>
  )
}
