'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Page, Header } from '@/components/ui'
import { useHousehold } from '@/lib/household'

type Account = { id: string; name: string; type: string }
type PaymentMethod = { id: string; name: string; kind: string; account_id: string }

export default function NewTransactionPage() {
  return <Suspense><NewTransactionForm /></Suspense>
}

function NewTransactionForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [type, setType] = useState<'expense' | 'income' | 'transfer'>(() => {
    const t = searchParams.get('type')
    return (t === 'income' || t === 'transfer') ? t : 'expense'
  })
  const [date, setDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [amount, setAmount] = useState(searchParams.get('amount') ?? '')
  const [description, setDescription] = useState(searchParams.get('desc') ?? '')
  const [memo, setMemo] = useState(searchParams.get('memo') ?? '')
  const [accountId, setAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('') // 振替先
  const [paymentMethodId, setPaymentMethodId] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrResult, setOcrResult] = useState<string | null>(null)
  const { householdId } = useHousehold()

  const parseReceiptText = (text: string) => {
    // 合計金額を探す
    const totalPatterns = [
      /合[　 ]*計[^\d]*(\d[\d,，]+)/,
      /お[　 ]*会[　 ]*計[^\d]*(\d[\d,，]+)/,
      /税[　 ]*込[^\d]*(\d[\d,，]+)/,
      /小[　 ]*計[^\d]*(\d[\d,，]+)/,
      /[¥￥](\d[\d,，]+)/,
    ]
    let parsedAmount = ''
    for (const p of totalPatterns) {
      const m = text.match(p)
      if (m) { parsedAmount = m[1].replace(/[,，]/g, ''); break }
    }
    // fallback: 最大の数字
    if (!parsedAmount) {
      const nums = [...text.matchAll(/(\d{3,})/g)].map(m => parseInt(m[1]))
      if (nums.length) parsedAmount = String(Math.max(...nums))
    }

    // 日付
    const dateM = text.match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/)
    let parsedDate = ''
    if (dateM) parsedDate = `${dateM[1]}-${dateM[2].padStart(2,'0')}-${dateM[3].padStart(2,'0')}`

    // お店名（最初の意味ある行）
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 1 && !/^\d/.test(l))
    const parsedStore = lines[0] ?? ''

    return { parsedAmount, parsedDate, parsedStore }
  }

  const suggestCategory = async (desc: string) => {
    if (!desc.trim()) return
    const { data } = await supabase
      .from('transactions')
      .select('journal_entries(account_id, accounts(name, type))')
      .ilike('description', `%${desc}%`)
      .order('created_at', { ascending: false })
      .limit(20)
    if (!data) return
    const counts: Record<string, number> = {}
    data.forEach((txn: any) => {
      txn.journal_entries?.forEach((e: any) => {
        if (e.accounts?.type === 'expense') counts[e.account_id] = (counts[e.account_id] ?? 0) + 1
      })
    })
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    if (top) setAccountId(top[0])
  }

  const runOCR = async () => {
    if (!receiptFile) return
    setOcrLoading(true)
    setOcrResult(null)
    try {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('jpn+eng')
      const { data: { text } } = await worker.recognize(receiptFile)
      await worker.terminate()
      setOcrResult(text)
      const { parsedAmount, parsedDate, parsedStore } = parseReceiptText(text)
      if (parsedAmount) setAmount(parsedAmount)
      if (parsedDate) setDate(parsedDate)
      if (parsedStore) { setDescription(parsedStore); suggestCategory(parsedStore) }
    } catch {
      setOcrResult('読み取りに失敗しました')
    }
    setOcrLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { if (!session) router.push('/login') })
    fetchMasters()
  }, [router])

  useEffect(() => { setAccountId(''); setToAccountId('') }, [type])

  const fetchSuggestions = async (q: string) => {
    if (!q.trim()) { setSuggestions([]); return }
    const { data } = await supabase
      .from('transactions')
      .select('description')
      .ilike('description', `%${q}%`)
      .not('description', 'is', null)
      .neq('description', '')
      .order('created_at', { ascending: false })
      .limit(30)
    if (data) {
      const unique = [...new Set(data.map((d: any) => d.description as string))].slice(0, 6)
      setSuggestions(unique)
    }
  }

  const fetchMasters = async () => {
    const { data: accs } = await supabase.from('accounts').select('*').order('display_order')
    if (accs) setAccounts(accs)
    const { data: pms } = await supabase.from('payment_methods').select('*').order('created_at')
    if (pms) setPaymentMethods(pms)
  }

  const filteredAccounts = accounts.filter(a => a.type === type)
  const assetAccounts = accounts.filter(a => a.type === 'asset')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (type === 'transfer') {
      if (!accountId) { setError('振替元を選択してください'); return }
      if (!toAccountId) { setError('振替先を選択してください'); return }
      if (accountId === toAccountId) { setError('振替元と振替先が同じです'); return }
    } else {
      if (!accountId) { setError('カテゴリを選択してください'); return }
      if (type === 'expense' && !paymentMethodId) { setError('支払い方法を選択してください'); return }
    }
    setLoading(true); setError('')

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const desc = description || (type === 'transfer' ? '振替' : '')
    const { data: txn, error: txnError } = await supabase
      .from('transactions').insert({ date, description: desc, memo, created_by: session.user.id, household_id: householdId }).select().single()
    if (txnError || !txn) { setError('登録に失敗しました'); setLoading(false); return }

    const entries = []
    if (type === 'transfer') {
      // 振替: 振替先(資産) DR / 振替元(資産) CR
      entries.push(
        { transaction_id: txn.id, account_id: toAccountId, debit_amount: Number(amount), credit_amount: 0 },
        { transaction_id: txn.id, account_id: accountId, debit_amount: 0, credit_amount: Number(amount) },
      )
    } else if (type === 'expense') {
      const pm = paymentMethods.find(p => p.id === paymentMethodId)
      if (pm?.kind === 'credit_card') {
        const { data: liabilityAcc } = await supabase.from('accounts').select('id').eq('name', '未払金').single()
        entries.push(
          { transaction_id: txn.id, account_id: accountId, debit_amount: Number(amount), credit_amount: 0 },
          { transaction_id: txn.id, account_id: liabilityAcc?.id ?? pm.account_id, debit_amount: 0, credit_amount: Number(amount) }
        )
      } else {
        entries.push(
          { transaction_id: txn.id, account_id: accountId, debit_amount: Number(amount), credit_amount: 0 },
          { transaction_id: txn.id, account_id: pm!.account_id, debit_amount: 0, credit_amount: Number(amount) }
        )
      }
    } else {
      const cashAcc = accounts.find(a => a.type === 'asset')
      entries.push(
        { transaction_id: txn.id, account_id: cashAcc?.id ?? accountId, debit_amount: Number(amount), credit_amount: 0 },
        { transaction_id: txn.id, account_id: accountId, debit_amount: 0, credit_amount: Number(amount) }
      )
    }
    await supabase.from('journal_entries').insert(entries)

    if (receiptFile) {
      const ext = receiptFile.name.split('.').pop()
      const path = `${session.user.id}/${txn.id}.${ext}`
      const { data: uploaded } = await supabase.storage.from('receipts').upload(path, receiptFile)
      if (uploaded) {
        const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(path)
        await supabase.from('transactions').update({ receipt_url: publicUrl }).eq('id', txn.id)
      }
    }

    router.push('/dashboard/transactions')
    setLoading(false)
  }

  return (
    <Page>
      <Header title="収支を入力" backPath="/dashboard" right={
        <button onClick={() => router.push('/dashboard/new/receipt')}
          className="text-xs border rounded-lg px-3 py-1.5"
          style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>🧾 レシート入力</button>
      } />
      <main className="max-w-lg mx-auto p-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">

          {/* 収支切り替え */}
          <div className="flex rounded-2xl p-1 border" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
            {(['expense', 'income', 'transfer'] as const).map(t => (
              <button key={t} type="button" onClick={() => setType(t)}
                className="flex-1 py-2.5 text-sm font-bold rounded-xl transition-colors"
                style={{ backgroundColor: type === t ? 'var(--accent)' : 'transparent', color: type === t ? '#fff' : 'var(--text3)' }}>
                {t === 'expense' ? '支出' : t === 'income' ? '収入' : '振替'}
              </button>
            ))}
          </div>

          {/* 金額 */}
          <div className="rounded-2xl border p-5 text-center" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
            <p className="text-xs mb-2" style={{ color: 'var(--text3)' }}>金額</p>
            <div className="flex items-center justify-center gap-2">
              <span className="text-2xl" style={{ color: 'var(--text3)' }}>¥</span>
              <input type="text" inputMode="numeric" value={amount ? Number(amount).toLocaleString() : ''} onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                className="bg-transparent text-4xl font-bold outline-none w-48 text-center"
                style={{ color: 'var(--text)' }} placeholder="0" required />
            </div>
          </div>

          <div className="rounded-2xl border p-4 flex flex-col gap-4" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text2)' }}>日付</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required
                className="w-full min-w-0 rounded-xl border px-3 py-3 text-sm outline-none"
                style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)', boxSizing: 'border-box', maxWidth: '100%', WebkitAppearance: 'none', appearance: 'none' }} />
            </div>
            <div className="relative">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text2)' }}>
                {type === 'expense' ? 'お店' : type === 'income' ? '収入元' : '摘要'}
              </label>
              <input type="text" value={description}
                onChange={e => { setDescription(e.target.value); fetchSuggestions(e.target.value); setShowSuggestions(true); suggestCategory(e.target.value) }}
                onFocus={() => { if (description) { fetchSuggestions(description); setShowSuggestions(true) } }}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder={type === 'expense' ? '例: イオン、コンビニ' : type === 'income' ? '例: 会社名、副業先' : '例: ATM引き出し'}
                className="w-full rounded-xl border px-4 py-3 text-sm outline-none placeholder:opacity-40"
                style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)' }} />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 rounded-xl border shadow-lg z-10 overflow-hidden"
                  style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
                  {suggestions.map(s => (
                    <button key={s} type="button"
                      onMouseDown={() => { setDescription(s); setSuggestions([]); setShowSuggestions(false); suggestCategory(s) }}
                      className="w-full text-left px-4 py-2.5 text-sm border-b last:border-b-0 active:opacity-70"
                      style={{ color: 'var(--text)', borderColor: 'var(--border)' }}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text2)' }}>
                {type === 'expense' ? '内容' : type === 'income' ? '内容' : 'メモ'}
              </label>
              <input type="text" value={memo} onChange={e => setMemo(e.target.value)}
                placeholder={type === 'expense' ? '例: 食料品、日用品' : type === 'income' ? '例: 給料、ボーナス' : ''}
                className="w-full rounded-xl border px-4 py-3 text-sm outline-none placeholder:opacity-40"
                style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)' }} />
            </div>
          </div>

          {/* 振替の場合 */}
          {type === 'transfer' ? (
            <div className="rounded-2xl border p-4 flex flex-col gap-4" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text2)' }}>振替元（出る口座）</label>
                <div className="grid grid-cols-2 gap-2">
                  {assetAccounts.map(acc => (
                    <button key={acc.id} type="button" onClick={() => setAccountId(acc.id)}
                      className="py-2 px-3 rounded-xl text-xs font-medium border transition-colors"
                      style={{
                        backgroundColor: accountId === acc.id ? 'var(--accent)' : 'var(--bg3)',
                        borderColor: accountId === acc.id ? 'var(--accent)' : 'var(--border)',
                        color: accountId === acc.id ? '#fff' : 'var(--text)',
                      }}>
                      {acc.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text2)' }}>振替先（入る口座）</label>
                <div className="grid grid-cols-2 gap-2">
                  {assetAccounts.map(acc => (
                    <button key={acc.id} type="button" onClick={() => setToAccountId(acc.id)}
                      className="py-2 px-3 rounded-xl text-xs font-medium border transition-colors"
                      style={{
                        backgroundColor: toAccountId === acc.id ? 'var(--accent)' : 'var(--bg3)',
                        borderColor: toAccountId === acc.id ? 'var(--accent)' : 'var(--border)',
                        color: toAccountId === acc.id ? '#fff' : 'var(--text)',
                        opacity: acc.id === accountId ? 0.3 : 1,
                      }}>
                      {acc.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text2)' }}>メモ</label>
                <textarea value={memo} onChange={e => setMemo(e.target.value)} placeholder="メモ（任意）" rows={2}
                  className="w-full rounded-xl border px-4 py-3 text-sm outline-none placeholder:opacity-40"
                  style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)' }} />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border p-4 flex flex-col gap-4" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text2)' }}>カテゴリ</label>
                {filteredAccounts.length === 0 ? (
                  <p className="text-sm" style={{ color: 'var(--text3)' }}>設定からカテゴリを追加してください</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {filteredAccounts.map(acc => (
                      <button key={acc.id} type="button" onClick={() => setAccountId(acc.id)}
                        className="py-2 px-3 rounded-xl text-xs font-medium border transition-colors"
                        style={{
                          backgroundColor: accountId === acc.id ? 'var(--accent)' : 'var(--bg3)',
                          borderColor: accountId === acc.id ? 'var(--accent)' : 'var(--border)',
                          color: accountId === acc.id ? '#fff' : 'var(--text)',
                        }}>
                        {acc.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {type === 'expense' && (
                <div>
                  <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text2)' }}>支払い方法</label>
                  <div className="grid grid-cols-2 gap-2">
                    {paymentMethods.map(pm => (
                      <button key={pm.id} type="button" onClick={() => setPaymentMethodId(pm.id)}
                        className="py-2 px-3 rounded-xl text-xs font-medium border transition-colors"
                        style={{
                          backgroundColor: paymentMethodId === pm.id ? 'var(--accent)' : 'var(--bg3)',
                          borderColor: paymentMethodId === pm.id ? 'var(--accent)' : 'var(--border)',
                          color: paymentMethodId === pm.id ? '#fff' : 'var(--text)',
                        }}>
                        {pm.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* レシート添付（振替以外） */}
          {type !== 'transfer' && (
            <div className="rounded-2xl border p-4" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
              <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text2)' }}>レシート添付（任意）</label>
              {receiptPreview ? (
                <div className="flex flex-col gap-3">
                  <div className="relative">
                    <img src={receiptPreview} alt="レシート" className="w-full rounded-xl object-cover max-h-48" />
                    <button type="button" onClick={() => { setReceiptFile(null); setReceiptPreview(null); setOcrResult(null) }}
                      className="absolute top-2 right-2 bg-black bg-opacity-50 text-white rounded-full w-7 h-7 flex items-center justify-center text-xs">✕</button>
                  </div>
                  <button type="button" onClick={runOCR} disabled={ocrLoading}
                    className="w-full rounded-xl py-2.5 text-sm font-medium border disabled:opacity-50"
                    style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                    {ocrLoading ? '📖 読み取り中...' : '📖 OCRで自動入力'}
                  </button>
                  {ocrResult && (
                    <p className="text-xs px-1" style={{ color: 'var(--text3)' }}>
                      {ocrResult === '読み取りに失敗しました' ? '⚠️ 読み取りに失敗しました' : '✓ 読み取り完了。内容を確認してください。'}
                    </p>
                  )}
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-6 cursor-pointer transition-opacity active:opacity-70"
                  style={{ borderColor: 'var(--border)' }}>
                  <span className="text-2xl">📷</span>
                  <span className="text-xs" style={{ color: 'var(--text3)' }}>タップして写真を選択</span>
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) { setReceiptFile(file); setReceiptPreview(URL.createObjectURL(file)) }
                    }} />
                </label>
              )}
            </div>
          )}

          {error && <p className="text-sm text-center" style={{ color: '#f87171' }}>{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full text-white rounded-2xl py-4 text-sm font-bold disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent)' }}>
            {loading ? '登録中...' : '登録する'}
          </button>
        </form>
      </main>
    </Page>
  )
}
