'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Page, Header } from '@/components/ui'

export default function ExportPage() {
  const router = useRouter()
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 7) + '-01')
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
    })
  }, [router])

  const handleExport = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('transactions')
      .select(`date, description, memo, journal_entries(debit_amount, credit_amount, accounts(name, type))`)
      .gte('date', startDate).lte('date', endDate).order('date')

    if (!data) { setLoading(false); return }

    const rows: string[][] = [['日付', '内容', '種別', 'カテゴリ', '金額', 'メモ']]
    data.forEach((txn: any) => {
      const expEntry = txn.journal_entries?.find((e: any) => e.accounts?.type === 'expense' && e.debit_amount > 0)
      const incEntry = txn.journal_entries?.find((e: any) => e.accounts?.type === 'income' && e.credit_amount > 0)
      if (expEntry) rows.push([txn.date, txn.description ?? '', '支出', expEntry.accounts?.name ?? '', expEntry.debit_amount.toString(), txn.memo ?? ''])
      if (incEntry) rows.push([txn.date, txn.description ?? '', '収入', incEntry.accounts?.name ?? '', incEntry.credit_amount.toString(), txn.memo ?? ''])
    })

    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `家計簿_${startDate}_${endDate}.csv`; a.click()
    URL.revokeObjectURL(url)
    setLoading(false)
  }

  const inputStyle = { backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)' }

  return (
    <Page>
      <Header title="CSVエクスポート" backPath="/dashboard" />
      <main className="max-w-lg mx-auto p-4 flex flex-col gap-4">
        <div className="rounded-2xl border p-4 flex flex-col gap-4" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text3)' }}>開始日</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full min-w-0 rounded-xl border px-3 py-3 text-sm outline-none" style={{ ...inputStyle, boxSizing: 'border-box', maxWidth: '100%', WebkitAppearance: 'none', appearance: 'none' }} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text3)' }}>終了日</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="w-full min-w-0 rounded-xl border px-3 py-3 text-sm outline-none" style={{ ...inputStyle, boxSizing: 'border-box', maxWidth: '100%', WebkitAppearance: 'none', appearance: 'none' }} />
          </div>
          <button onClick={handleExport} disabled={loading}
            className="w-full text-white rounded-2xl py-4 text-sm font-bold disabled:opacity-50 transition-opacity"
            style={{ backgroundColor: 'var(--accent)' }}>
            {loading ? 'エクスポート中...' : 'CSVをダウンロード'}
          </button>
        </div>
        <div className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--text2)' }}>ExcelやGoogleスプレッドシートで開けるCSV形式でダウンロードされます。収入・支出どちらも含まれます。</p>
        </div>
      </main>
    </Page>
  )
}
