import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { email } = await req.json()

  const supabaseUrl = 'https://webyskbzzlsxujpwvxgd.supabase.co'
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlYnlza2J6emxzeHVqcHd2eGdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MjE5NDMsImV4cCI6MjA5ODM5Nzk0M30.v7QxEA6bv3_rQd1mMGz90ivOhURbgWJLYk5RLYvgdfI'

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
