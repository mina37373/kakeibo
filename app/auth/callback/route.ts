'use server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(`${origin}/login`)
  }

  // Pass code to client-side page to exchange for session
  return NextResponse.redirect(`${origin}/auth/confirm?code=${code}`)
}
