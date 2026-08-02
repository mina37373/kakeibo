'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AuthCallbackPage() {
  const [msg, setMsg] = useState('ログイン中...')

  useEffect(() => {
    const hash = window.location.hash
    setMsg('処理中: ' + hash.slice(0, 30))

    // URLハッシュからトークンを手動取得
    const params = new URLSearchParams(hash.replace('#', ''))
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')

    if (access_token && refresh_token) {
      supabase.auth.setSession({ access_token, refresh_token }).then(({ error }) => {
        if (error) {
          setMsg('エラー: ' + error.message)
          setTimeout(() => window.location.replace('/login'), 2000)
        } else {
          window.location.replace('/dashboard')
        }
      })
    } else {
      // PKCEフロー (codeパラメータ) を試す
      const urlParams = new URLSearchParams(window.location.search)
      const code = urlParams.get('code')
      if (code) {
        supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
          if (error) {
            setMsg('エラー: ' + error.message)
            setTimeout(() => window.location.replace('/login'), 2000)
          } else {
            window.location.replace('/dashboard')
          }
        })
      } else {
        setMsg('トークンなし - ログインへ')
        setTimeout(() => window.location.replace('/login'), 2000)
      }
    }
  }, [])

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <p className="text-white text-sm">{msg}</p>
    </div>
  )
}
