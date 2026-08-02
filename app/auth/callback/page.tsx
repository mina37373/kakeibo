'use client'

import { useEffect, useState } from 'react'

export default function AuthCallbackPage() {
  const [info, setInfo] = useState('読み込み中...')

  useEffect(() => {
    const hash = window.location.hash
    const search = window.location.search
    const href = window.location.href
    setInfo(`hash: ${hash.slice(0, 50) || 'なし'}\nsearch: ${search.slice(0, 50) || 'なし'}\nurl: ${href.slice(0, 80)}`)
  }, [])

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-slate-800 p-6 rounded-xl max-w-sm w-full">
        <p className="text-white text-xs font-mono whitespace-pre-wrap">{info}</p>
        <p className="text-slate-400 text-xs mt-4">この画面のスクリーンショットを送ってください</p>
      </div>
    </div>
  )
}
