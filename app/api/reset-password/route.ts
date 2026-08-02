import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { email } = await req.json()

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/recover`
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      email,
      gotrue_meta_security: {},
    }),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    return NextResponse.json({ error: data.msg || data.error || 'Failed' }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
