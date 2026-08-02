import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = createClient(
      'https://webyskbzzlsxujpwvxgd.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndlYnlza2J6emxzeHVqcHd2eGdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MjE5NDMsImV4cCI6MjA5ODM5Nzk0M30.v7QxEA6bv3_rQd1mMGz90ivOhURbgWJLYk5RLYvgdfI'
    )
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}
