'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Page } from '@/components/ui'

type RecurringAlert = { id: string; name: string; amount: number; day_of_month: number; daysUntil: number; kind: 'recurring' | 'credit' }
type CreditAlert = { id: string; name: string; paymentDay: number; daysUntil: number; estimatedAmount: number }

export default function DashboardPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [monthTotal, setMonthTotal] = useState(0)
  const [monthIncome, setMonthIncome] = useState(0)
  const [recurringAlerts, setRecurringAlerts] = useState<RecurringAlert[]>([])
  const [creditAlerts, setCreditAlerts] = useState<CreditAlert[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
      else { setEmail(session.user.email ?? ''); fetchMonthTotal(); fetchRecurringAlerts(); fetchCreditAlerts() }
    })
  }, [router])

  const fetchRecurringAlerts = async () => {
    const todayDate = new Date().getDate()
    const { data: pms } = await supabase.from('payment_methods').select('id, kind')
    const bankIds = new Set((pms ?? []).filter((p: any) => p.kind === 'bank').map((p: any) => p.id))
    const { data } = await supabase.from('recurring_transactions')
      .select('id, name, amount, day_of_month, payment_method_id').eq('is_active', true)
    if (data) {
      const alerts = data
        .filter((r: any) => bankIds.has(r.payment_method_id))
        .map((r: any) => {
          const daysUntil = r.day_of_month >= todayDate ? r.day_of_month - todayDate : (new Date(new Date().getFullYear(), new Date().getMonth() + 1, r.day_of_month).getDate() + (31 - todayDate))
          return { ...r, daysUntil: r.day_of_month >= todayDate ? r.day_of_month - todayDate : 31 - todayDate + r.day_of_month, kind: 'recurring' as const }
        })
        .filter((r: any) => r.daysUntil <= 7)
        .sort((a: any, b: any) => a.daysUntil - b.daysUntil)
      setRecurringAlerts(alerts)
    }
  }

  const fetchCreditAlerts = async () => {
    const today = new Date()
    const todayDate = today.getDate()
    const { data: pms } = await supabase.from('payment_methods').select('id, name, kind, closing_day, payment_day')
    const cards = (pms ?? []).filter((p: any) => p.kind === 'credit_card' && p.closing_day && p.payment_day)
    const alerts: CreditAlert[] = []
    for (const card of cards) {
      const daysUntil = card.payment_day >= todayDate ? card.payment_day - todayDate : 31 - todayDate + card.payment_day
      if (daysUntil > 7) continue
      // 前回締め日〜今回締め日の利用額を集計
      const prevClosing = new Date(today.getFullYear(), today.getMonth() - 1, card.closing_day + 1)
      const thisClosing = new Date(today.getFullYear(), today.getMonth(), card.closing_day)
      const from = prevClosing.toISOString().slice(0, 10)
      const to = thisClosing.toISOString().slice(0, 10)
      const { data: entries } = await supabase
        .from('journal_entries')
        .select('credit_amount, transactions!inner(date)')
        .eq('account_id', card.id)
        .gte('transactions.date', from)
        .lte('transactions.date', to)
      const estimated = (entries ?? []).reduce((s: number, e: any) => s + (e.credit_amount ?? 0), 0)
      alerts.push({ id: card.id, name: card.name, paymentDay: card.payment_day, daysUntil, estimatedAmount: estimated })
    }
    setCreditAlerts(alerts.sort((a, b) => a.daysUntil - b.daysUntil))
  }

  const fetchMonthTotal = async () => {
    const month = new Date().toISOString().slice(0, 7)
    const { data } = await supabase
      .from('journal_entries')
      .select('debit_amount, credit_amount, accounts(type), transactions!inner(date)')
      .gte('transactions.date', `${month}-01`)
      .lte('transactions.date', `${month}-31`)
    if (data) {
      const exp = data.filter((e: any) => e.accounts?.type === 'expense' && e.debit_amount > 0).reduce((s: number, e: any) => s + e.debit_amount, 0)
      const inc = data.filter((e: any) => e.accounts?.type === 'income' && e.credit_amount > 0).reduce((s: number, e: any) => s + e.credit_amount, 0)
      setMonthTotal(exp); setMonthIncome(inc)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const balance = monthIncome - monthTotal
  const now = new Date()
  const monthLabel = `${now.getFullYear()}年${now.getMonth() + 1}月`

  const menuGroups = [
    {
      label: '入力・確認',
      items: [
        { icon: '＋', label: '収支を入力', path: '/dashboard/new', accent: true },
        { icon: '≡', label: '取引一覧', path: '/dashboard/transactions' },
        { icon: '💳', label: 'クレカ引き落とし', path: '/dashboard/credit-payment' },
        { icon: '↻', label: '定期支払い', path: '/dashboard/recurring' },
      ],
    },
    {
      label: '分析・レポート',
      items: [
        { icon: '◎', label: '集計・グラフ', path: '/dashboard/analytics' },
        { icon: '◈', label: '予算管理', path: '/dashboard/budget' },
        { icon: '📉', label: '固定変動費', path: '/dashboard/utilities' },
        { icon: '📈', label: '投資管理', path: '/dashboard/investments' },
        { icon: '📊', label: '損益計算書', path: '/dashboard/pl' },
        { icon: '🏦', label: '貸借対照表', path: '/dashboard/balance-sheet' },
        { icon: '📒', label: '総勘定元帳', path: '/dashboard/ledger' },
      ],
    },
    {
      label: 'その他',
      items: [
        { icon: '↓', label: 'エクスポート', path: '/dashboard/export' },
        { icon: '⚙', label: '設定', path: '/dashboard/settings' },
      ],
    },
  ]

  return (
    <Page>
      <div className="px-5 pt-12 pb-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-xs" style={{ color: 'var(--text3)' }}>{email}</p>
            <h1 className="text-xl font-bold mt-0.5" style={{ color: 'var(--text)' }}>家計簿</h1>
          </div>
          <button onClick={handleLogout} className="text-xs border rounded-lg px-3 py-1.5" style={{ color: 'var(--text3)', borderColor: 'var(--border)' }}>
            ログアウト
          </button>
        </div>

        {/* 引き落とし・クレカアラート */}
      {(recurringAlerts.length > 0 || creditAlerts.length > 0) && (
        <div className="px-5 pb-2 flex flex-col gap-2">
          {recurringAlerts.map(r => {
            const urgent = r.daysUntil === 0
            const label = urgent ? '今日が引き落とし日' : r.daysUntil === 1 ? '明日が引き落とし日' : `${r.daysUntil}日後に引き落とし`
            return (
              <button key={r.id} onClick={() => router.push('/dashboard/recurring')}
                className="w-full text-left rounded-2xl border px-4 py-3 flex items-center gap-3"
                style={{ backgroundColor: urgent ? '#fef3c7' : 'var(--bg2)', borderColor: urgent ? '#f59e0b' : 'var(--border)' }}>
                <span className="text-lg">{urgent ? '🔔' : '🏦'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold" style={{ color: urgent ? '#92400e' : 'var(--text2)' }}>{label}</p>
                  <p className="text-sm truncate" style={{ color: urgent ? '#78350f' : 'var(--text)' }}>
                    {r.name}{r.amount > 0 ? `　¥${r.amount.toLocaleString()}` : '　（金額変動）'}
                  </p>
                </div>
                <span className="text-xs" style={{ color: urgent ? '#92400e' : 'var(--text3)' }}>›</span>
              </button>
            )
          })}
          {creditAlerts.map(c => {
            const urgent = c.daysUntil === 0
            const label = urgent ? '今日がクレカ引き落とし日' : c.daysUntil === 1 ? '明日がクレカ引き落とし日' : `${c.daysUntil}日後にクレカ引き落とし`
            return (
              <button key={c.id} onClick={() => router.push('/dashboard/credit-payment')}
                className="w-full text-left rounded-2xl border px-4 py-3 flex items-center gap-3"
                style={{ backgroundColor: urgent ? '#fef3c7' : '#fdf4ff', borderColor: urgent ? '#f59e0b' : '#d8b4fe' }}>
                <span className="text-lg">💳</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold" style={{ color: urgent ? '#92400e' : '#7c3aed' }}>{label}</p>
                  <p className="text-sm truncate" style={{ color: urgent ? '#78350f' : 'var(--text)' }}>
                    {c.name}　{c.estimatedAmount > 0 ? `約¥${c.estimatedAmount.toLocaleString()}` : '金額確認してください'}
                  </p>
                </div>
                <span className="text-xs" style={{ color: urgent ? '#92400e' : '#7c3aed' }}>›</span>
              </button>
            )
          })}
        </div>
      )}

      {/* 収支カード */}
        <div className="rounded-2xl border p-5" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
          <p className="text-xs mb-1" style={{ color: 'var(--text3)' }}>{monthLabel}</p>
          <div className="mb-4">
            <p className="text-xs" style={{ color: 'var(--text2)' }}>収支バランス</p>
            <p className="text-3xl font-bold mt-0.5" style={{ color: balance >= 0 ? 'var(--accent)' : 'var(--text)' }}>
              {balance >= 0 ? '+' : ''}¥{balance.toLocaleString()}
            </p>
          </div>
          <div className="flex gap-3">
            <div className="flex-1 rounded-xl p-3" style={{ backgroundColor: 'var(--bg3)' }}>
              <p className="text-xs" style={{ color: 'var(--text3)' }}>収入</p>
              <p className="font-semibold text-sm mt-0.5" style={{ color: 'var(--accent)' }}>¥{monthIncome.toLocaleString()}</p>
            </div>
            <div className="flex-1 rounded-xl p-3" style={{ backgroundColor: 'var(--bg3)' }}>
              <p className="text-xs" style={{ color: 'var(--text3)' }}>支出</p>
              <p className="font-semibold text-sm mt-0.5" style={{ color: 'var(--text2)' }}>¥{monthTotal.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      <main className="px-5 pb-6 flex flex-col gap-5">
        {menuGroups.map(group => (
          <div key={group.label}>
            <p className="text-xs font-semibold mb-2 px-1" style={{ color: 'var(--text3)' }}>{group.label}</p>
            <div className="grid grid-cols-4 gap-2">
              {group.items.map(menu => (
                <button
                  key={menu.path}
                  onClick={() => router.push(menu.path)}
                  className="rounded-2xl border px-1 py-3 flex flex-col items-center gap-1.5 active:opacity-70 transition-opacity"
                  style={{
                    backgroundColor: (menu as any).accent ? 'var(--accent)' : 'var(--bg2)',
                    borderColor: (menu as any).accent ? 'var(--accent)' : 'var(--border)',
                    color: (menu as any).accent ? '#fff' : 'var(--text)',
                  }}
                >
                  <span className="text-base">{menu.icon}</span>
                  <span className="text-xs font-medium text-center leading-tight">{menu.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </main>

      <div className="fixed bottom-6 right-5">
        <button
          onClick={() => router.push('/dashboard/new')}
          className="text-white rounded-full w-14 h-14 text-2xl shadow-lg flex items-center justify-center"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          ＋
        </button>
      </div>
    </Page>
  )
}
