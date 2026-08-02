'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function ConfirmInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const code = searchParams.get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          window.location.href = '/login'
        } else {
          window.location.href = '/dashboard'
        }
      })
    } else {
      window.location.href = '/login'
    }
  }, [router, searchParams])

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <p className="text-white text-sm">ログイン中...</p>
    </div>
  )
}

export default function AuthConfirmPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center"><p className="text-white text-sm">読み込み中...</p></div>}>
      <ConfirmInner />
    </Suspense>
  )
}
