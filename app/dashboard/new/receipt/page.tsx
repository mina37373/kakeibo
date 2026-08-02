'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Page, Header } from '@/components/ui'
import { useHousehold } from '@/lib/household'

type Account = { id: string; name: string; type: string }
type PaymentMethod = { id: string; name: string; kind: string; account_id: string }
type TaxRate = 0 | 8 | 10
type Line = { id: number; accountId: string; amount: string; taxRate: TaxRate; taxIncluded: boolean; memo: string }

export default function ReceiptInputPage() {
  const router = useRouter()
  const { householdId } = useHousehold()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const [date, setDate] = useState(todayStr)
  const [description, setDescription] = useState('')
  const [paymentMethodId, setPaymentMethodId] = useState('')
  const [lines, setLines] = useState<Line[]>([{ id: 1, accountId: '', amount: '', taxRate: 10, taxIncluded: false, memo: '' }])
  const [defaultTaxIncluded, setDefaultTaxIncluded] = useState(false)
  const [receiptTotal, setReceiptTotal] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [receiptFiles, setReceiptFiles] = useState<File[]>([])
  const [receiptPreviews, setReceiptPreviews] = useState<string[]>([])
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [swipedLineId, setSwipedLineId] = useState<number | null>(null)
  let nextId = 100

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login')
      else fetchMasters()
    })
  }, [router])

  const fetchMasters = async () => {
    const { data: accs } = await supabase.from('accounts').select('*').order('display_order')
    if (accs) setAccounts(accs)
    const { data: pms } = await supabase.from('payment_methods').select('*').order('created_at')
    if (pms) {
      const kindOrder: Record<string, number> = { cash: 0, bank: 1, debit: 2, credit_card: 3, e_money: 4, other: 5 }
      setPaymentMethods([...pms].sort((a, b) => (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9)))
    }
  }

  const parseReceiptText = (text: string) => {
    const lineArr = text.split('\n').map(l => l.trim()).filter(Boolean)
    // 合計金額：「合計」行を見つけて、同じ行か次の行から金額を取得
    let total = ''
    for (let i = 0; i < lineArr.length; i++) {
      const line = lineArr[i]
      // 同じ行に金額: "合計 ¥943" or "合計 943"
      const m1 = line.match(/^合計\s*[¥￥]?\s*([\d,]+)/)
      if (m1) { total = m1[1].replace(/,/g, ''); break }
      // 「合計」単独行→次の行が金額でないこともある（dポイントが間に入る場合）
      // "合計" → "dポイント" → "¥943" → "¥43" の順なので小計から取る
      const m2 = line.match(/^小計\s*[¥￥]?\s*([\d,]+)/)
      if (m2) { total = m2[1].replace(/,/g, ''); break }
      // 次の行が金額パターン
      if (line === '合計') {
        // 次数行を探す（金額が出るまで最大3行先まで）
        for (let j = i + 1; j <= i + 3 && j < lineArr.length; j++) {
          const m3 = lineArr[j].match(/^[¥￥]?([\d,]+)$/)
          if (m3 && Number(m3[1].replace(/,/g, '')) > 100) {
            total = m3[1].replace(/,/g, '')
            break
          }
        }
        if (total) break
      }
    }
    // 見つからなければ小計・税込合計も試す
    if (!total) {
      for (const line of lineArr) {
        const m = line.match(/(税込合計|お買上合計|請求合計)\s*[¥￥]?\s*([\d,]+)/)
        if (m) { total = m[2].replace(/,/g, ''); break }
      }
    }
    // 日付
    const dateMatch = text.match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/)
    const parsedDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2].padStart(2,'0')}-${dateMatch[3].padStart(2,'0')}` : ''
    // お店（数字だけでない最初の行）
    const storeLine = lineArr.find(l => /[^\d\s¥￥,.-]/.test(l) && l.length > 1 && l.length < 30)
    return { total, date: parsedDate, store: storeLine ?? '' }
  }

  const parseLineItems = (text: string) => {
    const lineArr = text.split('\n').map(l => l.trim()).filter(Boolean)
    const items: { memo: string; amount: string; taxRate: TaxRate; taxIncluded: boolean }[] = []
    const seen = new Set<string>()
    const skipPattern = /合計|小計|税額|税対象|ポイント|クレジ|お釣|割引|おつり|領収|レシート|店番|レジ|年中|^\d{4}年|^<|^T\d{13}|^\d+点$/
    const amountOnlyPattern = /^[¥￥]?([\d,]+)(◆|外|●)?$/
    const itemWithAmountPattern = /^(?:\d{2}\s+)?(.+?)\s+[¥￥]([\d,]+)(◆|外|●)?$/

    for (let i = 0; i < lineArr.length; i++) {
      const line = lineArr[i]

      // 同じ行に金額がある場合: "商品名 ¥金額◆"
      const m1 = line.match(itemWithAmountPattern)
      if (m1) {
        const memo = m1[1].trim()
        const amount = m1[2].replace(/,/g, '')
        const marker = m1[3] ?? ''
        if (!skipPattern.test(memo) && memo.length >= 2 && Number(amount) > 0) {
          const key = `${memo}:${amount}`
          if (!seen.has(key)) {
            seen.add(key)
            items.push({ memo, amount, taxRate: marker === '◆' ? 8 : 10, taxIncluded: marker !== '外' })
          }
        }
        continue
      }

      // 商品名だけの行で次の行が金額の場合
      const nextLine = lineArr[i + 1] ?? ''
      const m2 = nextLine.match(amountOnlyPattern)
      if (m2 && /^(?:\d{2}\s+)?[^\d¥￥(@]/.test(line) && !skipPattern.test(line)) {
        const memo = line.replace(/^\d{2}\s+/, '').trim()
        const amount = m2[1].replace(/,/g, '')
        const marker = m2[2] ?? ''
        if (memo.length >= 2 && Number(amount) > 0) {
          const key = `${memo}:${amount}`
          if (!seen.has(key)) {
            seen.add(key)
            items.push({ memo, amount, taxRate: marker === '◆' ? 8 : 10, taxIncluded: marker !== '外' })
            i++
          }
        }
      }
    }
    return items
  }

  const guessAccountId = async (memo: string): Promise<string> => {
    const { data } = await supabase
      .from('journal_entries')
      .select('account_id, accounts!inner(type)')
      .eq('accounts.type', 'expense')
      .limit(20)
    if (data && data.length > 0) {
      const counts: Record<string, number> = {}
      data.forEach((e: any) => { if (e.account_id) counts[e.account_id] = (counts[e.account_id] ?? 0) + 1 })
      return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
    }
    return ''
  }

  // お店名から過去の税率傾向を学習
  const learnStoreTaxRate = (storeName: string): { taxRate: TaxRate; taxIncluded: boolean } | null => {
    if (!storeName) return null
    const stored = localStorage.getItem('store_tax_map')
    const map: Record<string, { taxRate: TaxRate; taxIncluded: boolean }> = stored ? JSON.parse(stored) : {}
    return map[storeName] ?? null
  }

  const saveStoreTaxRate = (storeName: string, taxRate: TaxRate, taxIncluded: boolean) => {
    if (!storeName) return
    const stored = localStorage.getItem('store_tax_map')
    const map: Record<string, { taxRate: TaxRate; taxIncluded: boolean }> = stored ? JSON.parse(stored) : {}
    map[storeName] = { taxRate, taxIncluded }
    localStorage.setItem('store_tax_map', JSON.stringify(map))
  }

  const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve((reader.result as string).split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  const runOCR = async () => {
    if (receiptFiles.length === 0) return
    setOcrLoading(true)
    try {
      // 複数枚を順番にOCRしてテキストを結合
      let combinedText = ''
      for (const file of receiptFiles) {
        const base64 = await toBase64(file)
        const res = await fetch('/api/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64 }),
        })
        const { text } = await res.json()
        console.log('OCR TEXT:', text)
        combinedText += text + '\n'
      }

      const { total, date: parsedDate, store } = parseReceiptText(combinedText)
      if (total) setReceiptTotal(total)
      if (parsedDate) setDate(parsedDate)
      const storeName = store && !description ? store : description
      if (store && !description) setDescription(store)

      // お店の税率履歴を参照
      const storedTax = learnStoreTaxRate(storeName)
      if (storedTax) {
        setDefaultTaxIncluded(storedTax.taxIncluded)
      }

      // 明細を自動入力
      const items = parseLineItems(combinedText)
      if (items.length > 0) {
        const newLines: Line[] = await Promise.all(items.map(async (item, i) => ({
          id: Date.now() + i,
          accountId: await guessAccountId(item.memo),
          amount: item.amount,
          taxRate: item.taxRate,
          taxIncluded: storedTax ? storedTax.taxIncluded : item.taxIncluded,
          memo: item.memo,
        })))
        setLines(newLines)
      }
    } catch (e) {
      console.error(e)
    }
    setOcrLoading(false)
  }

  const fetchSuggestions = async (q: string) => {
    if (!q.trim()) { setSuggestions([]); return }
    const { data } = await supabase
      .from('transactions').select('description')
      .ilike('description', `%${q}%`).not('description', 'is', null).neq('description', '')
      .order('created_at', { ascending: false }).limit(30)
    if (data) {
      const unique = [...new Set(data.map((d: any) => d.description as string))].slice(0, 5)
      setSuggestions(unique)
    }
  }

  const expenseAccounts = accounts.filter(a => a.type === 'expense')

  // 各行の税込金額を計算
  const calcTaxIncluded = (line: Line) => {
    const base = Number(line.amount) || 0
    if (line.taxIncluded || line.taxRate === 0) return base
    return Math.floor(base * (1 + line.taxRate / 100))
  }
  const calcTax = (line: Line) => {
    const base = Number(line.amount) || 0
    if (line.taxRate === 0) return 0
    if (line.taxIncluded) {
      // 税込価格から消費税を逆算: 税額 = 税込 - floor(税込 / (1 + 税率))
      return base - Math.floor(base / (1 + line.taxRate / 100))
    }
    return calcTaxIncluded(line) - base
  }

  const subtotal = lines.reduce((s, l) => s + calcTaxIncluded(l), 0)
  const pretotal = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)
  const tax8 = lines.filter(l => l.taxRate === 8).reduce((s, l) => s + calcTax(l), 0)
  const tax10 = lines.filter(l => l.taxRate === 10).reduce((s, l) => s + calcTax(l), 0)
  const receiptTotalNum = Number(receiptTotal) || 0
  const matched = receiptTotal !== '' && receiptTotalNum === subtotal

  const addLine = (insertBeforeId?: number) => {
    const newLine = { id: Date.now(), accountId: '', amount: '', taxRate: 10 as TaxRate, taxIncluded: defaultTaxIncluded, memo: '' }
    if (insertBeforeId === undefined) {
      setLines(prev => [...prev, newLine])
    } else {
      setLines(prev => {
        const idx = prev.findIndex(l => l.id === insertBeforeId)
        const next = [...prev]
        next.splice(idx, 0, newLine)
        return next
      })
    }
  }

  const removeLine = (id: number) => {
    setLines(prev => prev.filter(l => l.id !== id))
  }

  const updateLine = (id: number, field: keyof Line, value: any) => {
    setLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l))
  }

  const handleSubmit = async () => {
    if (!description) { setError('お店を入力してください'); return }
    if (!paymentMethodId) { setError('支払い方法を選択してください'); return }
    const validLines = lines.filter(l => l.accountId && l.amount && Number(l.amount) > 0)
    if (validLines.length === 0) { setError('明細を1行以上入力してください'); return }

    setLoading(true); setError('')

    // お店の税率傾向を保存（最も多い税率を記録）
    if (description && validLines.length > 0) {
      const tax8count = validLines.filter(l => l.taxRate === 8).length
      const tax10count = validLines.filter(l => l.taxRate === 10).length
      const dominantRate: TaxRate = tax8count > tax10count ? 8 : 10
      const dominantIncluded = validLines.filter(l => l.taxIncluded).length >= validLines.length / 2
      saveStoreTaxRate(description, dominantRate, dominantIncluded)
    }

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const pm = paymentMethods.find(p => p.id === paymentMethodId)
    if (!pm) return

    const { data: txn } = await supabase.from('transactions')
      .insert({ date, description, created_by: session.user.id, household_id: householdId })
      .select().single()

    if (txn) {
      const entries: any[] = []
      for (const line of validLines) {
        const amt = calcTaxIncluded(line)
        entries.push({ transaction_id: txn.id, account_id: line.accountId, debit_amount: amt, credit_amount: 0 })
        entries.push({ transaction_id: txn.id, account_id: pm.account_id, debit_amount: 0, credit_amount: amt })
      }
      await supabase.from('journal_entries').insert(entries)

      if (receiptFiles.length > 0) {
        const urls: string[] = []
        for (let i = 0; i < receiptFiles.length; i++) {
          const file = receiptFiles[i]
          const ext = file.name.split('.').pop()
          const path = `${session.user.id}/${txn.id}_${i}.${ext}`
          const { data: uploaded } = await supabase.storage.from('receipts').upload(path, file)
          if (uploaded) {
            const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(path)
            urls.push(publicUrl)
          }
        }
        if (urls.length > 0) {
          await supabase.from('transactions').update({ receipt_url: urls[0] }).eq('id', txn.id)
        }
      }
    }

    router.push('/dashboard/transactions')
    setLoading(false)
  }

  return (
    <Page>
      <Header title="レシート入力" backPath="/dashboard/new" />
      <main className="max-w-lg mx-auto p-4 flex flex-col gap-4">

        {/* ヘッダー情報 */}
        <div className="rounded-2xl border p-4 flex flex-col gap-3" style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text3)' }}>日付</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full min-w-0 rounded-xl border px-3 py-2.5 text-sm outline-none"
              style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)', boxSizing: 'border-box', WebkitAppearance: 'none', appearance: 'none' }} />
          </div>
          <div className="relative">
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text3)' }}>お店</label>
            <input type="text" value={description}
              onChange={e => { setDescription(e.target.value); fetchSuggestions(e.target.value); setShowSuggestions(true) }}
              onFocus={() => { if (description) { fetchSuggestions(description); setShowSuggestions(true) } }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              placeholder="例: イオン、コンビニ"
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none placeholder:opacity-40"
              style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)' }} />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 rounded-xl border shadow-lg z-10 overflow-hidden"
                style={{ backgroundColor: 'var(--bg2)', borderColor: 'var(--border)' }}>
                {suggestions.map(s => (
                  <button key={s} type="button"
                    onMouseDown={() => { setDescription(s); setSuggestions([]); setShowSuggestions(false) }}
                    className="w-full text-left px-4 py-2.5 text-sm border-b last:border-b-0 active:opacity-70"
                    style={{ color: 'var(--text)', borderColor: 'var(--border)' }}>{s}</button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text3)' }}>支払い方法</label>
            <div className="grid grid-cols-2 gap-2">
              {paymentMethods.map(pm => (
                <button key={pm.id} type="button" onClick={() => setPaymentMethodId(pm.id)}
                  className="py-2 px-3 rounded-xl text-xs font-medium border transition-colors"
                  style={{
                    backgroundColor: paymentMethodId === pm.id ? 'var(--accent)' : 'var(--bg3)',
                    borderColor: paymentMethodId === pm.id ? 'var(--accent)' : 'var(--border)',
                    color: paymentMethodId === pm.id ? '#fff' : 'var(--text)',
                  }}>{pm.name}</button>
              ))}
            </div>
          </div>
        </div>

        {/* レシート写真 */}
        <div className="flex flex-col gap-2">
          {receiptPreviews.length > 0 && (
            <div className={`grid gap-2 ${receiptPreviews.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {receiptPreviews.map((preview, i) => (
                <div key={i} className="relative rounded-2xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                  <img src={preview} alt={`レシート${i + 1}`} className="w-full object-cover max-h-48 cursor-pointer" onClick={() => setLightboxIndex(i)} />
                  <button type="button" onClick={() => {
                    setReceiptFiles(prev => prev.filter((_, j) => j !== i))
                    setReceiptPreviews(prev => prev.filter((_, j) => j !== i))
                  }}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow"
                    style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}>✕</button>
                  <span className="absolute bottom-2 left-2 text-xs px-1.5 py-0.5 rounded-full font-bold"
                    style={{ backgroundColor: 'var(--bg)', color: 'var(--text3)' }}>{i + 1}枚目</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <label className="flex-1 border-2 border-dashed rounded-2xl py-4 flex flex-col items-center gap-1 cursor-pointer"
              style={{ borderColor: 'var(--border)' }}>
              <span className="text-xl">📷</span>
              <span className="text-xs" style={{ color: 'var(--text3)' }}>{receiptPreviews.length === 0 ? '写真を追加' : '+ もう1枚追加'}</span>
              <input type="file" accept="image/*" multiple className="hidden" onChange={e => {
                const files = Array.from(e.target.files ?? [])
                if (files.length === 0) return
                setReceiptFiles(prev => [...prev, ...files])
                setReceiptPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))])
              }} />
            </label>
            {receiptPreviews.length > 0 && (
              <button type="button" onClick={runOCR} disabled={ocrLoading}
                className="flex-1 rounded-2xl py-4 text-sm font-bold border disabled:opacity-50"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                {ocrLoading ? '読み取り中...' : '📖 OCRで自動入力'}
              </button>
            )}
          </div>
        </div>

        {/* 明細行 */}
        <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)' }}>
            <p className="text-xs font-bold" style={{ color: 'var(--text2)' }}>明細</p>
            <div className="flex items-center gap-1">
              <span className="text-xs" style={{ color: 'var(--text3)' }}>金額は</span>
              {(['税抜き', '税込み'] as const).map(v => (
                <button key={v} type="button"
                  onClick={() => {
                    const inc = v === '税込み'
                    setDefaultTaxIncluded(inc)
                    setLines(prev => prev.map(l => ({ ...l, taxIncluded: inc })))
                  }}
                  className="text-xs px-2 py-1 rounded-lg border"
                  style={{
                    backgroundColor: (v === '税込み') === defaultTaxIncluded ? 'var(--accent)' : 'var(--bg2)',
                    borderColor: (v === '税込み') === defaultTaxIncluded ? 'var(--accent)' : 'var(--border)',
                    color: (v === '税込み') === defaultTaxIncluded ? '#fff' : 'var(--text3)',
                  }}>{v}</button>
              ))}
            </div>
          </div>
          <div style={{ backgroundColor: 'var(--bg2)' }}>
            {lines.map((line, i) => {
              const taxAmt = calcTax(line)
              const totalAmt = calcTaxIncluded(line)
              return (
                <div key={line.id}
                  onTouchStart={e => { (e.currentTarget as any)._tx = e.touches[0].clientX }}
                  onTouchEnd={e => {
                    const dx = e.changedTouches[0].clientX - (e.currentTarget as any)._tx
                    if (dx < -40) setSwipedLineId(line.id)
                    else if (dx > 40) setSwipedLineId(null)
                  }}>
                  {/* PC用挿入ボタン */}
                  <button type="button" onClick={() => addLine(line.id)}
                    className="w-full py-0.5 text-xs hidden md:flex items-center justify-center gap-1 opacity-0 hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--accent)' }}>
                    <span>─────</span><span>＋ ここに行を挿入</span><span>─────</span>
                  </button>
                  {/* スマホ用スワイプ後の挿入ボタン */}
                  {swipedLineId === line.id && (
                    <div className="flex gap-2 px-3 py-1.5 md:hidden">
                      <button type="button" onClick={() => { addLine(line.id); setSwipedLineId(null) }}
                        className="flex-1 py-2 rounded-xl text-xs font-bold"
                        style={{ backgroundColor: 'var(--accent)', color: '#fff' }}>＋ この上に行を挿入</button>
                      <button type="button" onClick={() => setSwipedLineId(null)}
                        className="px-3 py-2 rounded-xl text-xs border"
                        style={{ borderColor: 'var(--border)', color: 'var(--text3)' }}>戻す</button>
                    </div>
                  )}
                <div className="px-3 py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs w-5 shrink-0 text-center" style={{ color: 'var(--text3)' }}>{i + 1}</span>
                    <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                      <select value={line.accountId} onChange={e => updateLine(line.id, 'accountId', e.target.value)}
                        className="w-full rounded-lg border px-2 py-1.5 text-sm outline-none"
                        style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: line.accountId ? 'var(--text)' : 'var(--text3)' }}>
                        <option value="">科目を選択</option>
                        {expenseAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                      <div className="flex items-center gap-1 rounded-lg border px-2 py-1.5 w-full"
                        style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)' }}>
                        <span className="text-xs shrink-0" style={{ color: 'var(--text3)' }}>¥</span>
                        <input type="text" inputMode="numeric"
                          value={line.amount ? Number(line.amount).toLocaleString() : ''}
                          onChange={e => updateLine(line.id, 'amount', e.target.value.replace(/[^0-9]/g, ''))}
                          placeholder="0"
                          className="flex-1 bg-transparent outline-none text-sm text-right placeholder:opacity-40 min-w-0"
                          style={{ color: 'var(--text)' }} />
                      </div>
                    </div>
                    {lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(line.id)}
                        className="text-xs shrink-0 w-6 h-6 flex items-center justify-center rounded-full self-start mt-1"
                        style={{ color: 'var(--text3)', backgroundColor: 'var(--bg3)' }}>✕</button>
                    )}
                  </div>
                  <input type="text" value={line.memo}
                    onChange={e => updateLine(line.id, 'memo', e.target.value)}
                    placeholder="内容（例: お茶、洗剤）"
                    className="mt-1.5 rounded-lg border px-2 py-1.5 text-xs outline-none placeholder:opacity-40"
                    style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)', color: 'var(--text)', width: 'calc(100% - 1.75rem)', marginLeft: '1.75rem', boxSizing: 'border-box' }} />
                  <div className="flex items-center gap-2 mt-1.5 pl-7">
                    {([0, 8, 10] as TaxRate[]).map(r => (
                      <button key={r} type="button" onClick={() => updateLine(line.id, 'taxRate', r)}
                        className="text-xs px-2 py-0.5 rounded-lg border"
                        style={{
                          backgroundColor: line.taxRate === r ? 'var(--accent)' : 'var(--bg3)',
                          borderColor: line.taxRate === r ? 'var(--accent)' : 'var(--border)',
                          color: line.taxRate === r ? '#fff' : 'var(--text3)',
                        }}>{r === 0 ? '非課税' : `${r}%`}</button>
                    ))}
                    {line.taxRate > 0 && line.amount && (
                      <span className="text-xs ml-auto" style={{ color: 'var(--text3)' }}>
                        {line.taxIncluded ? (
                          <>税抜¥{(totalAmt - taxAmt).toLocaleString()} 税¥{taxAmt.toLocaleString()}</>
                        ) : (
                          <>税¥{taxAmt.toLocaleString()} → 税込¥{totalAmt.toLocaleString()}</>
                        )}
                      </span>
                    )}
                  </div>
                </div>
                </div>
              )
            })}
            <button type="button" onClick={() => addLine()}
              className="w-full py-2.5 text-sm border-t"
              style={{ color: 'var(--accent)', borderColor: 'var(--border)' }}>
              ＋ 行を追加
            </button>
          </div>
        </div>

        {/* 合計チェック */}
        <div className="rounded-2xl border p-4 flex flex-col gap-3" style={{ backgroundColor: 'var(--bg2)', borderColor: matched ? 'var(--accent)' : 'var(--border)' }}>
          {defaultTaxIncluded ? (
            <>
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>合計（税込）</span>
                <span className="text-lg font-bold" style={{ color: 'var(--text)' }}>¥{subtotal.toLocaleString()}</span>
              </div>
              <div className="flex flex-col gap-1 pl-1">
                <div className="flex justify-between text-xs" style={{ color: 'var(--text3)' }}>
                  <span>うち消費税（8%）</span><span>¥{tax8.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs" style={{ color: 'var(--text3)' }}>
                  <span>うち消費税（10%）</span><span>¥{tax10.toLocaleString()}</span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>税抜き合計</span>
                <span className="text-base font-bold" style={{ color: 'var(--text)' }}>¥{pretotal.toLocaleString()}</span>
              </div>
              <div className="flex flex-col gap-1 pl-1">
                <div className="flex justify-between text-xs" style={{ color: 'var(--text3)' }}>
                  <span>消費税（8%）</span><span>¥{tax8.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs" style={{ color: 'var(--text3)' }}>
                  <span>消費税（10%）</span><span>¥{tax10.toLocaleString()}</span>
                </div>
              </div>
              <div className="flex justify-between items-center border-t pt-2" style={{ borderColor: 'var(--border)' }}>
                <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>合計（税込）</span>
                <span className="text-lg font-bold" style={{ color: 'var(--text)' }}>¥{subtotal.toLocaleString()}</span>
              </div>
            </>
          )}
          <div className="flex items-center gap-3">
            <label className="text-sm shrink-0" style={{ color: 'var(--text3)' }}>レシート合計</label>
            <div className="flex items-center gap-1 flex-1 rounded-xl border px-3 py-2"
              style={{ backgroundColor: 'var(--bg3)', borderColor: 'var(--border)' }}>
              <span className="text-sm" style={{ color: 'var(--text3)' }}>¥</span>
              <input type="text" inputMode="numeric"
                value={receiptTotal ? Number(receiptTotal).toLocaleString() : ''}
                onChange={e => setReceiptTotal(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="レシートの合計金額"
                className="flex-1 bg-transparent outline-none text-sm placeholder:opacity-40"
                style={{ color: 'var(--text)' }} />
            </div>
          </div>
          {receiptTotal !== '' && (
            <p className="text-sm font-medium text-center" style={{ color: matched ? 'var(--accent)' : '#f87171' }}>
              {matched ? '✓ 合計が一致しました' : `⚠ ${(subtotal - receiptTotalNum).toLocaleString()}円の差があります`}
            </p>
          )}
        </div>

        {error && <p className="text-sm text-center" style={{ color: '#f87171' }}>{error}</p>}

        <button onClick={handleSubmit} disabled={loading}
          className="w-full text-white rounded-2xl py-4 text-sm font-bold disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent)' }}>
          {loading ? '登録中...' : `登録する（${lines.filter(l => l.accountId && l.amount).length}件）`}
        </button>
      </main>

      {lightboxIndex !== null && receiptPreviews[lightboxIndex] && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black bg-opacity-95"
          onClick={() => setLightboxIndex(null)}>
          {/* 枚数インジケーター */}
          {receiptPreviews.length > 1 && (
            <div className="flex justify-center gap-1.5 pt-4">
              {receiptPreviews.map((_, i) => (
                <div key={i} className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: i === lightboxIndex ? '#fff' : 'rgba(255,255,255,0.4)' }} />
              ))}
            </div>
          )}
          {/* 画像 */}
          <div className="flex-1 flex items-center justify-center overflow-hidden"
            onClick={e => e.stopPropagation()}
            onTouchStart={e => { (e.currentTarget as any)._tx = e.touches[0].clientX }}
            onTouchEnd={e => {
              const dx = e.changedTouches[0].clientX - (e.currentTarget as any)._tx
              if (dx < -50 && lightboxIndex < receiptPreviews.length - 1) setLightboxIndex(lightboxIndex + 1)
              else if (dx > 50 && lightboxIndex > 0) setLightboxIndex(lightboxIndex - 1)
              else setLightboxIndex(null)
            }}>
            <img src={receiptPreviews[lightboxIndex]} alt="レシート" className="max-w-full max-h-full p-4" />
          </div>
          {/* 左右ボタン（PC用） */}
          {receiptPreviews.length > 1 && (
            <div className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-3 pointer-events-none">
              <button onClick={e => { e.stopPropagation(); if (lightboxIndex > 0) setLightboxIndex(lightboxIndex - 1) }}
                className="pointer-events-auto w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg"
                style={{ backgroundColor: lightboxIndex > 0 ? 'rgba(255,255,255,0.2)' : 'transparent' }}>
                {lightboxIndex > 0 ? '‹' : ''}
              </button>
              <button onClick={e => { e.stopPropagation(); if (lightboxIndex < receiptPreviews.length - 1) setLightboxIndex(lightboxIndex + 1) }}
                className="pointer-events-auto w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg"
                style={{ backgroundColor: lightboxIndex < receiptPreviews.length - 1 ? 'rgba(255,255,255,0.2)' : 'transparent' }}>
                {lightboxIndex < receiptPreviews.length - 1 ? '›' : ''}
              </button>
            </div>
          )}
          <div className="text-center pb-6">
            <span className="text-xs text-white opacity-50">タップして閉じる</span>
          </div>
        </div>
      )}
    </Page>
  )
}
