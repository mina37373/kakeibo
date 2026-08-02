import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { email } = await req.json()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  // Remove any non-ASCII characters that may have been introduced during copy-paste
  const supabaseKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').replace(/[^\x00-\x7F]/g, '')

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'env missing' }, { status: 500 })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/recover`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ email }),
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return NextResponse.json({ error: data.msg || data.error || `status ${res.status}` }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    clearTimeout(timer)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
