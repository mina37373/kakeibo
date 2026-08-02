'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login')
  const [resetSent, setResetSent] = useState(false)

  const handleGoogle = async () => {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    })
    if (error) setError('Googleログインに失敗しました: ' + error.message)
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError('メールアドレスまたはパスワードが違います')
      else router.push('/dashboard')
    } else if (mode === 'reset') {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) setError('メール送信に失敗しました: ' + data.error)
      else setResetSent(true)
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError('登録に失敗しました: ' + error.message)
      else setError('確認メールを送りました。メールをご確認ください。')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-500 rounded-2xl mb-4">
            <span className="text-white text-2xl">📒</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Kakeibo</h1>
          <p className="text-slate-400 text-sm mt-1">家計簿・会計管理アプリ</p>
        </div>

        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
          <div className="flex bg-slate-800 rounded-xl p-1 mb-6">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${mode === 'login' ? 'bg-blue-500 text-white' : 'text-slate-400'}`}
            >
              ログイン
            </button>
            <button
              onClick={() => setMode('signup')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${mode === 'signup' ? 'bg-blue-500 text-white' : 'text-slate-400'}`}
            >
              新規登録
            </button>
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-800 rounded-xl py-3 text-sm font-medium mb-4 transition-colors disabled:opacity-50 border border-gray-200"
          >
            <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/><path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/></svg>
            Googleでログイン
          </button>

          <div className="flex items-center gap-3 mb-2">
            <div className="flex-1 h-px bg-slate-700" />
            <span className="text-xs text-slate-500">または</span>
            <div className="flex-1 h-px bg-slate-700" />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">メールアドレス</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm outline-none focus:border-blue-500 transition-colors placeholder:text-slate-600"
                placeholder="example@email.com"
                required
              />
            </div>
            {mode !== 'reset' && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">パスワード</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm outline-none focus:border-blue-500 transition-colors placeholder:text-slate-600"
                  placeholder="••••••••"
                  required
                />
              </div>
            )}

            {error && <p className="text-sm text-center px-2 py-2 rounded-lg bg-red-950 text-red-400">{error}</p>}
            {resetSent && <p className="text-sm text-center px-2 py-2 rounded-lg bg-green-950 text-green-400">リセットメールを送りました！メールをご確認ください。</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white rounded-xl py-3 text-sm font-medium mt-1 transition-colors disabled:opacity-50"
            >
              {loading ? '処理中...' : mode === 'login' ? 'ログイン' : mode === 'reset' ? 'リセットメールを送る' : '登録する'}
            </button>

            {mode === 'login' && (
              <button type="button" onClick={() => { setMode('reset'); setError(''); setResetSent(false) }}
                className="text-xs text-slate-400 hover:text-slate-300 text-center w-full">
                パスワードを忘れた方はこちら
              </button>
            )}
            {mode === 'reset' && (
              <button type="button" onClick={() => { setMode('login'); setError(''); setResetSent(false) }}
                className="text-xs text-slate-400 hover:text-slate-300 text-center w-full">
                ログインに戻る
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
