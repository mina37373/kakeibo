'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Page, Header } from '@/components/ui'

type CalendarEvent = {
  day: number
  name: string
  amount: number
  kind: 'bank' | 'credit'
  debitAccount?: string
}

export default function CalendarPage() {
  const router = useRouter()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth()) // 0-indexed

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
      else fetchEvents()
    })
  }, [router, year, month])

  const fetchEvents = async () => {
    const allEvents: CalendarEvent[] = []

    // 銀行引き落とし（定期支払い）
    const { data: pms } = await supabase.from('payment_methods').select('id, name, kind, closing_day, payment_day')
    const bankIds = new Set((pms ?? []).filter((p: any) => p.kind === 'bank').map((p: any) => p.id))

    const { data: recs } = await supabase.from('recurring_transactions')
      .select('id, name, amount, day_of_month, payment_method_id').eq('is_active', true)
    for (const r of recs ?? []) {
      if (bankIds.has(r.payment_method_id)) {
        allEvents.push({ day: r.day_of_month, name: r.name, amount: r.amount, kind: 'bank' })
      }
    }

    // 口座名マップ
    const pmNameMap: Record<string, string> = {}
    for (const pm of pms ?? []) pmNameMap[pm.id] = pm.name

    // クレカ引き落とし
    for (const pm of pms ?? []) {
      if (pm.kind === 'credit_card' && pm.payment_day) {
        // 締め日〜引き落とし日の利用額を集計
        const prevClosing = new Date(year, month - 1, (pm.closing_day ?? 25) + 1)
        const thisClosing = new Date(year, month, pm.closing_day ?? 25)
        const from = prevClosing.toISOString().slice(0, 10)
        const to = thisClosing.toISOString().slice(0, 10)
        const { data: entries } = await supabase
          .from('journal_entries')
          .select('credit_amount, transactions!inner(date)')
          .eq('account_id', pm.id)
          .gte('transactions.date', from)
          .lte('transactions.date', to)
        const estimated = (entries ?? []).reduce((s: number, e: any) => s + (e.credit_amount ?? 0), 0)
        const debitAccount = pm.debit_pm_id ? pmNameMap[pm.debit_pm_id] : undefined
        allEvents.push({ day: pm.payment_day, name: pm.name, amount: estimated, kind: 'credit', debitAccount })
      }
    }

    setEvents(allEvents)
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfWeek = new Date(year, month, 1).getDay() // 0=Sun
  const weeks: (number | null)[][] = []
  let week: (number | null)[] = Array(firstDayOfWeek).fill(null)
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d)
    if (week.length === 7) { weeks.push(week); week = [] }
  }
  if (week.length > 0) weeks.push([...week, ...Array(7 - week.length).fill(null)])

  const eventsOnDay = (day: number) => events.filter(e => e.day === day)
  const selectedEvents = selectedDay !== null ? eventsOnDay(selectedDay) : []

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1) }

  const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

  return (
    <Page>
      <Header title="引き落としカレンダー" backPath="/dashboard" />
      <main className="max-w-lg mx-auto p-4 flex flex-col gap-4">

        {/* 月ナビ */}
        <div className="flex items-center justify-between px-1">
          <button onClick={prevMonth} className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
            style={{ backgroundColor: 'var(--bg2)', color: 'var(--text)' }}>‹</button>
          <p className="text-base font-bold" style={{ color: 'var(--text)' }}>{year}年{month + 1}月</p>
          <button onClick={nextMonth} className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
            style={{ backgroundColor: 'var(--bg2)', color: 'var(--text)' }}>›</button>
        </div>

        {/* カレンダー */}
        <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
          {/* 曜日ヘッダー */}
          <div className="grid grid-cols-7 border-b" style={{ borderColor: 'var(--border)' }}>
            {DAY_LABELS.map((d, i) => (
              <div key={d} className="py-2 text-center text-xs font-medium"
                style={{ color: i === 0 ? '#f87171' : i === 6 ? '#60a5fa' : 'var(--text3)' }}>{d}</div>
            ))}
          </div>
          {/* 日付 */}
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
              {week.map((day, di) => {
                const dayEvents = day ? eventsOnDay(day) : []
                const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
                const isSelected = day === selectedDay
                const hasBankEvent = dayEvents.some(e => e.kind === 'bank')
                const hasCreditEvent = dayEvents.some(e => e.kind === 'credit')
                return (
                  <button key={di} type="button"
                    onClick={() => day && setSelectedDay(isSelected ? null : day)}
                    disabled={!day}
                    className="py-2 flex flex-col items-center gap-0.5 min-h-[56px] transition-colors"
                    style={{
                      backgroundColor: isSelected ? 'var(--accent)' : 'transparent',
                      opacity: day ? 1 : 0,
                    }}>
                    {day && (
                      <>
                        <span className="text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full"
                          style={{
                            color: isSelected ? '#fff' : isToday ? 'var(--accent)' : di === 0 ? '#f87171' : di === 6 ? '#60a5fa' : 'var(--text)',
                            backgroundColor: isToday && !isSelected ? 'var(--bg3)' : 'transparent',
                            fontWeight: isToday ? 'bold' : 'normal',
                          }}>{day}</span>
                        <div className="flex gap-0.5 justify-center">
                          {hasBankEvent && <span className="text-xs">🏦</span>}
                          {hasCreditEvent && <span className="text-xs">💳</span>}
                        </div>
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* 凡例 */}
        <div className="flex gap-4 px-1">
          <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text3)' }}>🏦 銀行引き落とし</span>
          <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text3)' }}>💳 クレカ引き落とし</span>
        </div>

        {/* 選択日の詳細 */}
        {selectedDay !== null && (
          <div className="rounded-2xl border p-4 flex flex-col gap-3" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--accent)' }}>
            <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>{month + 1}月{selectedDay}日の引き落とし予定</p>
            {selectedEvents.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--text3)' }}>この日の予定はありません</p>
            ) : (
              <>
                {selectedEvents.map((e, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl border px-3 py-3"
                    style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)' }}>
                    <span className="text-lg">{e.kind === 'bank' ? '🏦' : '💳'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs" style={{ color: 'var(--text3)' }}>{e.kind === 'bank' ? '銀行引き落とし' : 'クレカ引き落とし'}</p>
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{e.name}</p>
                      {e.debitAccount && <p className="text-xs truncate" style={{ color: 'var(--text3)' }}>口座: {e.debitAccount}</p>}
                    </div>
                    <p className="text-sm font-bold shrink-0" style={{ color: 'var(--text)' }}>
                      {e.amount > 0 ? `¥${e.amount.toLocaleString()}` : '金額変動'}
                    </p>
                  </div>
                ))}
                <div className="flex justify-between pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-xs font-medium" style={{ color: 'var(--text3)' }}>合計</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>
                    ¥{selectedEvents.reduce((s, e) => s + e.amount, 0).toLocaleString()}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

      </main>
    </Page>
  )
}
