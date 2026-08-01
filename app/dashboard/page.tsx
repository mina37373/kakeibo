'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Page } from '@/components/ui'

export default function DashboardPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [monthTotal, setMonthTotal] = useState(0)
  const [monthIncome, setMonthIncome] = useState(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
      else { setEmail(session.user.email ?? ''); fetchMonthTotal() }
    })
  }, [router])

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
