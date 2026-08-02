'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function AuthCallbackPage() {
  useEffect(() => {
    // implicit flowでは supabase が URL hash から自動でセッションを取得する
    // onAuthStateChange で SIGNED_IN を待つ
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        window.location.replace('/dashboard')
      }
    })

    // 念のため3秒後にセッション確認、なければログインへ
    const timer = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) window.location.replace('/login')
    }, 3000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [])

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <p className="text-white text-sm">ログイン中...</p>
    </div>
  )
}
