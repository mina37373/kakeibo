'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Page, Header } from '@/components/ui'

type Entry = { id: string; debit_amount: number; credit_amount: number; memo?: string | null; accounts: { name: string; type: string } }
type Transaction = {
  id: string; date: string; description: string; memo: string
  receipt_url: string | null; created_at: string; journal_entries: Entry[]
}

export default function TransactionDetailPage() {
  const router = useRouter()
  const { id } = useParams()
  const [txn, setTxn] = useState<Transaction | null>(null)
  const [loading, setLoading] = useState(true)
  const [lightbox, setLightbox] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editDate, setEditDate] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editMemo, setEditMemo] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
      else fetchTransaction()
    })
  }, [router])

  const fetchTransaction = async () => {
    const { data } = await supabase
      .from('transactions')
      .select(`*, journal_entries(id, debit_amount, credit_amount, memo, accounts(name, type))`)
      .eq('id', id).single()
    if (data) {
      setTxn(data)
      setEditDate(data.date)
      setEditDesc(data.description ?? '')
      setEditMemo(data.memo ?? '')
      const { amount } = getAmountFromEntries(data.journal_entries)
      setEditAmount(String(amount))
    }
    setLoading(false)
  }

  const getAmountFromEntries = (entries: Entry[]) => {
    const expEntries = entries.filter(e => e.accounts?.type === 'expense' && e.debit_amount > 0)
    if (expEntries.length > 0) return { amount: expEntries.reduce((s, e) => s + e.debit_amount, 0), type: 'expense' as const }
    const incEntries = entries.filter(e => e.accounts?.type === 'income' && e.credit_amount > 0)
    if (incEntries.length > 0) return { amount: incEntries.reduce((s, e) => s + e.credit_amount, 0), type: 'income' as const }
    const dr = entries.find(e => e.debit_amount > 0)
    if (dr) return { amount: dr.debit_amount, type: 'transfer' as const }
    return { amount: 0, type: 'expense' as const }
  }

  const handleDelete = async () => {
    if (!confirm('この取引を削除しますか？')) return
    if (txn?.receipt_url) {
      const path = txn.receipt_url.split('/receipts/')[1]
      if (path) await supabase.storage.from('receipts').remove([path])
    }
    await supabase.from('transactions').delete().eq('id', id)
    router.push('/dashboard/transactions')
  }

  const handleSave = async () => {
    if (!txn) return
    setSaving(true)
    // 取引の日付・摘要・メモを更新
    await supabase.from('transactions').update({
      date: editDate,
      description: editDesc,
      memo: editMemo,
    }).eq('id', txn.id)

    // 金額が変わっていれば仕訳も更新
    const newAmt = Number(editAmount)
    const { amount: oldAmt } = getAmountFromEntries(txn.journal_entries)
    if (newAmt !== oldAmt && newAmt > 0) {
      for (const entry of txn.journal_entries) {
        await supabase.from('journal_entries').update({
          debit_amount: entry.debit_amount > 0 ? newAmt : 0,
          credit_amount: entry.credit_amount > 0 ? newAmt : 0,
        }).eq('id', entry.id)
      }
    }

    await fetchTransaction()
    setEditing(false)
    setSaving(false)
  }

  if (loading) return <Page><p className="text-center py-12" style={{ color: 'var(--text3)' }}>読み込み中...</p></Page>
  if (!txn) return <Page><p className="text-center py-12" style={{ color: 'var(--text3)' }}>取引が見つかりません</p></Page>

  const { amount, type } = getAmountFromEntries(txn.journal_entries)
  const amountColor = type === 'income' ? 'var(--accent)' : 'var(--text)'
  const typeLabel = type === 'income' ? '収入' : type === 'transfer' ? '振替' : '支出'

  return (
    <Page>
      <Header title="取引詳細" backPath="/dashboard/transactions" right={
        <div className="flex gap-2">
          <button onClick={() => router.push(`/dashboard/new/receipt?edit=${txn.id}`)}
            className="text-xs border rounded-lg px-3 py-1.5"
            style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>
            🧾 明細編集
          </button>
          <button onClick={() => setEditing(!editing)}
            className="text-xs border rounded-lg px-3 py-1.5"
            style={{ color: editing ? 'var(--accent)' : 'var(--text3)', borderColor: editing ? 'var(--accent)' : 'var(--border)' }}>
            {editing ? 'キャンセル' : '✏️ 編集'}
          </button>
        </div>
      } />

      <main className="max-w-lg mx-auto p-4 flex flex-col gap-4">

        {editing ? (
          /* 編集フォーム */
          <div className="rounded-2xl border p-4 flex flex-col gap-4" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--accent)' }}>
            <p className="text-xs font-medium" style={{ color: 'var(--accent)' }}>編集中（{typeLabel}）</p>

            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text3)' }}>日付</label>
              <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)}
                className="w-full min-w-0 rounded-xl border px-3 py-2.5 text-sm outline-none"
                style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)', boxSizing: 'border-box' }} />
            </div>

            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text3)' }}>金額</label>
              <div className="flex items-center gap-2 rounded-xl border px-3 py-2.5"
                style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)' }}>
                <span style={{ color: 'var(--text3)' }}>¥</span>
                <input type="text" inputMode="numeric" value={editAmount ? Number(editAmount).toLocaleString() : ''} onChange={e => setEditAmount(e.target.value.replace(/[^0-9]/g, ''))}
                  className="flex-1 bg-transparent outline-none text-sm" style={{ color: 'var(--text)' }} />
              </div>
            </div>

            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text3)' }}>お店・収入元</label>
              <input type="text" value={editDesc} onChange={e => setEditDesc(e.target.value)}
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none placeholder:opacity-40"
                style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)' }} />
            </div>

            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--text3)' }}>内容</label>
              <textarea value={editMemo} onChange={e => setEditMemo(e.target.value)} rows={2}
                className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none placeholder:opacity-40"
                style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)' }} />
            </div>

            <button onClick={handleSave} disabled={saving}
              className="w-full text-white rounded-2xl py-3 text-sm font-bold disabled:opacity-40"
              style={{ backgroundColor: 'var(--accent)' }}>
              {saving ? '保存中...' : '保存する'}
            </button>
          </div>
        ) : (
          /* 表示モード */
          <>
            <div className="rounded-2xl border p-6 text-center" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
              <p className="text-xs mb-1" style={{ color: 'var(--text3)' }}>{txn.date} · {typeLabel}</p>
              <p className="text-4xl font-bold" style={{ color: amountColor }}>
                {type === 'income' ? '+' : type === 'transfer' ? '' : '-'}¥{amount.toLocaleString()}
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--text2)' }}>{txn.description || '（内容なし）'}</p>
              {txn.memo && <p className="mt-1 text-xs" style={{ color: 'var(--text3)' }}>{txn.memo}</p>}
            </div>

            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div className="px-4 py-3 border-b" style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)' }}>
                <p className="text-xs font-medium" style={{ color: 'var(--text2)' }}>詳細</p>
              </div>
              <div style={{ backgroundColor: 'var(--bg2)' }}>
                {[
                  { label: '日付', value: txn.date },
                  { label: '種別', value: typeLabel },
                  { label: 'お店・収入元', value: txn.description || '—' },
                  { label: '内容', value: txn.memo || '—' },
                  { label: '登録日時', value: new Date(txn.created_at).toLocaleString('ja-JP') },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between px-4 py-3 border-b last:border-b-0"
                    style={{ borderColor: 'var(--border)' }}>
                    <span className="text-xs" style={{ color: 'var(--text3)' }}>{label}</span>
                    <span className="text-xs font-medium text-right max-w-[60%]" style={{ color: 'var(--text)' }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div className="px-4 py-3 border-b" style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)' }}>
                <p className="text-xs font-medium" style={{ color: 'var(--text2)' }}>仕訳明細</p>
              </div>
              <div style={{ backgroundColor: 'var(--bg2)' }}>
                {txn.journal_entries.map(entry => (
                  <div key={entry.id} className="flex justify-between items-center px-4 py-3 border-b last:border-b-0"
                    style={{ borderColor: 'var(--border)' }}>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>{entry.accounts?.name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg3)', color: 'var(--text3)' }}>
                          {entry.accounts?.type === 'expense' ? '支出' : entry.accounts?.type === 'income' ? '収入' : entry.accounts?.type === 'asset' ? '資産' : '負債'}
                        </span>
                      </div>
                      {entry.memo && <p className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>{entry.memo}</p>}
                    </div>
                    <div className="flex gap-3 text-xs">
                      {entry.debit_amount > 0 && <span style={{ color: 'var(--text2)' }}>借 ¥{entry.debit_amount.toLocaleString()}</span>}
                      {entry.credit_amount > 0 && <span style={{ color: 'var(--accent)' }}>貸 ¥{entry.credit_amount.toLocaleString()}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {txn.receipt_url && (
              <div className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
                <h2 className="text-xs font-medium mb-2" style={{ color: 'var(--text3)' }}>レシート</h2>
                <img src={txn.receipt_url} alt="レシート" className="w-full rounded-xl cursor-pointer" onClick={() => setLightbox(true)} />
              </div>
            )}
          </>
        )}

        <button onClick={() => {
          const params = new URLSearchParams({
            desc: txn.description ?? '',
            amount: String(amount),
            type: type,
            memo: txn.memo ?? '',
          })
          router.push(`/dashboard/new?${params.toString()}`)
        }}
          className="w-full rounded-2xl py-3 text-sm font-medium border"
          style={{ borderColor: 'var(--border)', color: 'var(--text2)' }}>
          📋 同じ内容でもう一度登録
        </button>

        <button onClick={handleDelete}
          className="w-full rounded-2xl py-3 text-sm font-medium border"
          style={{ borderColor: '#ef4444', color: '#ef4444' }}>
          この取引を削除
        </button>
      </main>

      {lightbox && txn.receipt_url && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90" onClick={() => setLightbox(false)}>
          <img src={txn.receipt_url} alt="レシート" className="max-w-full max-h-full p-4" />
        </div>
      )}
    </Page>
  )
}
