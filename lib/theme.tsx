'use client'

import { createContext, useContext, useEffect, useState } from 'react'

export type ThemeId = string

export const THEMES: { id: string; label: string; preview: string; category: string; vars: Record<string, string> }[] = [
  // --- ライト系 ---
  {
    id: 'light', label: 'クリーン', preview: '#f8fafc', category: 'ライト',
    vars: { '--bg': '#f8fafc', '--bg2': '#ffffff', '--bg3': '#f1f5f9', '--border': '#e2e8f0', '--text': '#0f172a', '--text2': '#475569', '--text3': '#94a3b8', '--accent': '#3b82f6' },
  },
  {
    id: 'light-warm', label: 'ウォーム', preview: '#faf8f5', category: 'ライト',
    vars: { '--bg': '#faf8f5', '--bg2': '#ffffff', '--bg3': '#f5f0e8', '--border': '#ebe4d8', '--text': '#2c1810', '--text2': '#7c6658', '--text3': '#b0968a', '--accent': '#c2622d' },
  },
  {
    id: 'light-stone', label: 'ストーン', preview: '#f8f8f6', category: 'ライト',
    vars: { '--bg': '#f8f8f6', '--bg2': '#ffffff', '--bg3': '#f0efe9', '--border': '#e4e2d8', '--text': '#1c1c18', '--text2': '#6b6b5c', '--text3': '#a0a090', '--accent': '#6b6b5c' },
  },
  // --- くすみカラー系（淡い） ---
  {
    id: 'muted-sage', label: 'セージ', preview: '#e8ede6', category: 'くすみ',
    vars: { '--bg': '#edf2eb', '--bg2': '#ffffff', '--bg3': '#dfe8dc', '--border': '#c8d8c4', '--text': '#2a3828', '--text2': '#5a7856', '--text3': '#8aaa86', '--accent': '#5a7856' },
  },
  {
    id: 'muted-mauve', label: 'モーブ', preview: '#ede8f0', category: 'くすみ',
    vars: { '--bg': '#f0ecf5', '--bg2': '#ffffff', '--bg3': '#e6e0ee', '--border': '#d0c8dc', '--text': '#2a2230', '--text2': '#6a5878', '--text3': '#9a88a8', '--accent': '#7a5fa0' },
  },
  {
    id: 'muted-dusty-rose', label: 'ダスティローズ', preview: '#f0e6ea', category: 'くすみ',
    vars: { '--bg': '#f5edf0', '--bg2': '#ffffff', '--bg3': '#ecdde3', '--border': '#dcc8d0', '--text': '#301820', '--text2': '#805060', '--text3': '#b08090', '--accent': '#a06070' },
  },
  {
    id: 'muted-clay', label: 'クレイ', preview: '#f0ebe5', category: 'くすみ',
    vars: { '--bg': '#f5f0ea', '--bg2': '#ffffff', '--bg3': '#ece4d8', '--border': '#dcd0c0', '--text': '#2c2018', '--text2': '#7a6050', '--text3': '#a89070', '--accent': '#8a6848' },
  },
  {
    id: 'muted-sky', label: 'スモーキースカイ', preview: '#e8eef5', category: 'くすみ',
    vars: { '--bg': '#ecf1f8', '--bg2': '#ffffff', '--bg3': '#dce6f0', '--border': '#c4d4e4', '--text': '#182030', '--text2': '#486080', '--text3': '#8098b0', '--accent': '#4878a8' },
  },
  {
    id: 'muted-olive', label: 'オリーブ', preview: '#eceee0', category: 'くすみ',
    vars: { '--bg': '#f0f2e4', '--bg2': '#ffffff', '--bg3': '#e4e8d4', '--border': '#ccd4b0', '--text': '#202818', '--text2': '#586040', '--text3': '#889868', '--accent': '#688048' },
  },
  // --- パステル ---
  {
    id: 'pastel-blue', label: 'ベビーブルー', preview: '#dbeafe', category: 'パステル',
    vars: { '--bg': '#eff6ff', '--bg2': '#dbeafe', '--bg3': '#bfdbfe', '--border': '#93c5fd', '--text': '#1e3a5f', '--text2': '#3b6ea8', '--text3': '#60a5fa', '--accent': '#2563eb' },
  },
  {
    id: 'pastel-pink', label: 'ベビーピンク', preview: '#fce7f3', category: 'パステル',
    vars: { '--bg': '#fdf2f8', '--bg2': '#fce7f3', '--bg3': '#fbcfe8', '--border': '#f9a8d4', '--text': '#500724', '--text2': '#9d174d', '--text3': '#db2777', '--accent': '#db2777' },
  },
  {
    id: 'pastel-lavender', label: 'ラベンダー', preview: '#ede9fe', category: 'パステル',
    vars: { '--bg': '#f5f3ff', '--bg2': '#ede9fe', '--bg3': '#ddd6fe', '--border': '#c4b5fd', '--text': '#2e1065', '--text2': '#5b21b6', '--text3': '#7c3aed', '--accent': '#7c3aed' },
  },
  {
    id: 'pastel-peach', label: 'ピーチ', preview: '#ffedd5', category: 'パステル',
    vars: { '--bg': '#fff7ed', '--bg2': '#ffedd5', '--bg3': '#fed7aa', '--border': '#fdba74', '--text': '#431407', '--text2': '#9a3412', '--text3': '#ea580c', '--accent': '#ea580c' },
  },
  {
    id: 'pastel-mint', label: 'ミント', preview: '#d1fae5', category: 'パステル',
    vars: { '--bg': '#f0fdf4', '--bg2': '#dcfce7', '--bg3': '#bbf7d0', '--border': '#86efac', '--text': '#052e16', '--text2': '#166534', '--text3': '#16a34a', '--accent': '#16a34a' },
  },
  {
    id: 'pastel-lemon', label: 'レモン', preview: '#fef9c3', category: 'パステル',
    vars: { '--bg': '#fefce8', '--bg2': '#fef9c3', '--bg3': '#fef08a', '--border': '#fde047', '--text': '#3f3010', '--text2': '#a16207', '--text3': '#ca8a04', '--accent': '#ca8a04' },
  },
  {
    id: 'pastel-rose', label: 'ミルクティー', preview: '#fce7e0', category: 'パステル',
    vars: { '--bg': '#fdf4f0', '--bg2': '#fce7e0', '--bg3': '#f8d0c4', '--border': '#f0b8a8', '--text': '#3a1810', '--text2': '#8a4838', '--text3': '#c07060', '--accent': '#c06040' },
  },
  // --- 原色系 ---
  {
    id: 'primary-red', label: 'レッド', preview: '#ef4444', category: '原色',
    vars: { '--bg': '#fff5f5', '--bg2': '#ffffff', '--bg3': '#fee2e2', '--border': '#fca5a5', '--text': '#450a0a', '--text2': '#991b1b', '--text3': '#dc2626', '--accent': '#ef4444' },
  },
  {
    id: 'primary-blue', label: 'ブルー', preview: '#3b82f6', category: '原色',
    vars: { '--bg': '#eff6ff', '--bg2': '#ffffff', '--bg3': '#dbeafe', '--border': '#93c5fd', '--text': '#1e3a8a', '--text2': '#1d4ed8', '--text3': '#3b82f6', '--accent': '#2563eb' },
  },
  {
    id: 'primary-green', label: 'グリーン', preview: '#22c55e', category: '原色',
    vars: { '--bg': '#f0fdf4', '--bg2': '#ffffff', '--bg3': '#dcfce7', '--border': '#86efac', '--text': '#14532d', '--text2': '#15803d', '--text3': '#16a34a', '--accent': '#16a34a' },
  },
  {
    id: 'primary-yellow', label: 'イエロー', preview: '#eab308', category: '原色',
    vars: { '--bg': '#fefce8', '--bg2': '#ffffff', '--bg3': '#fef9c3', '--border': '#fde047', '--text': '#422006', '--text2': '#a16207', '--text3': '#ca8a04', '--accent': '#eab308' },
  },
  {
    id: 'primary-orange', label: 'オレンジ', preview: '#f97316', category: '原色',
    vars: { '--bg': '#fff7ed', '--bg2': '#ffffff', '--bg3': '#ffedd5', '--border': '#fdba74', '--text': '#431407', '--text2': '#c2410c', '--text3': '#ea580c', '--accent': '#f97316' },
  },
  {
    id: 'primary-purple', label: 'パープル', preview: '#a855f7', category: '原色',
    vars: { '--bg': '#faf5ff', '--bg2': '#ffffff', '--bg3': '#f3e8ff', '--border': '#d8b4fe', '--text': '#3b0764', '--text2': '#7e22ce', '--text3': '#9333ea', '--accent': '#a855f7' },
  },
  {
    id: 'primary-cyan', label: 'シアン', preview: '#06b6d4', category: '原色',
    vars: { '--bg': '#ecfeff', '--bg2': '#ffffff', '--bg3': '#cffafe', '--border': '#67e8f9', '--text': '#083344', '--text2': '#0e7490', '--text3': '#0891b2', '--accent': '#06b6d4' },
  },
  {
    id: 'primary-teal', label: 'ティール', preview: '#14b8a6', category: '原色',
    vars: { '--bg': '#f0fdfa', '--bg2': '#ffffff', '--bg3': '#ccfbf1', '--border': '#5eead4', '--text': '#042f2e', '--text2': '#0f766e', '--text3': '#0d9488', '--accent': '#14b8a6' },
  },
  {
    id: 'primary-indigo', label: 'インディゴ', preview: '#6366f1', category: '原色',
    vars: { '--bg': '#eef2ff', '--bg2': '#ffffff', '--bg3': '#e0e7ff', '--border': '#a5b4fc', '--text': '#1e1b4b', '--text2': '#4338ca', '--text3': '#4f46e5', '--accent': '#6366f1' },
  },
  {
    id: 'primary-pink', label: 'ピンク', preview: '#ec4899', category: '原色',
    vars: { '--bg': '#fdf2f8', '--bg2': '#ffffff', '--bg3': '#fce7f3', '--border': '#f9a8d4', '--text': '#500724', '--text2': '#be185d', '--text3': '#db2777', '--accent': '#ec4899' },
  },
  // --- ビビッド（濃い系） ---
  {
    id: 'vivid-crimson', label: 'クリムゾン', preview: '#be123c', category: 'ビビッド',
    vars: { '--bg': '#fff1f2', '--bg2': '#ffe4e6', '--bg3': '#fecdd3', '--border': '#fda4af', '--text': '#4c0519', '--text2': '#9f1239', '--text3': '#e11d48', '--accent': '#be123c' },
  },
  {
    id: 'vivid-navy', label: 'ネイビー', preview: '#1e3a8a', category: 'ビビッド',
    vars: { '--bg': '#eff6ff', '--bg2': '#dbeafe', '--bg3': '#bfdbfe', '--border': '#60a5fa', '--text': '#1e3a8a', '--text2': '#1d4ed8', '--text3': '#2563eb', '--accent': '#1d4ed8' },
  },
  {
    id: 'vivid-emerald', label: 'エメラルド', preview: '#047857', category: 'ビビッド',
    vars: { '--bg': '#ecfdf5', '--bg2': '#d1fae5', '--bg3': '#a7f3d0', '--border': '#6ee7b7', '--text': '#022c22', '--text2': '#065f46', '--text3': '#059669', '--accent': '#047857' },
  },
  {
    id: 'vivid-gold', label: 'ゴールド', preview: '#b45309', category: 'ビビッド',
    vars: { '--bg': '#fffbeb', '--bg2': '#fef3c7', '--bg3': '#fde68a', '--border': '#fcd34d', '--text': '#451a03', '--text2': '#92400e', '--text3': '#b45309', '--accent': '#d97706' },
  },
  {
    id: 'vivid-violet', label: 'ヴァイオレット', preview: '#7c3aed', category: 'ビビッド',
    vars: { '--bg': '#f5f3ff', '--bg2': '#ede9fe', '--bg3': '#ddd6fe', '--border': '#a78bfa', '--text': '#2e1065', '--text2': '#5b21b6', '--text3': '#7c3aed', '--accent': '#6d28d9' },
  },
  {
    id: 'vivid-coral', label: 'コーラル', preview: '#e11d48', category: 'ビビッド',
    vars: { '--bg': '#fff1f2', '--bg2': '#ffe4e6', '--bg3': '#ffd6d8', '--border': '#fca5a5', '--text': '#3f0010', '--text2': '#be123c', '--text3': '#e11d48', '--accent': '#f43f5e' },
  },
  {
    id: 'vivid-ocean', label: 'ディープオーシャン', preview: '#0369a1', category: 'ビビッド',
    vars: { '--bg': '#f0f9ff', '--bg2': '#e0f2fe', '--bg3': '#bae6fd', '--border': '#7dd3fc', '--text': '#082f49', '--text2': '#0369a1', '--text3': '#0284c7', '--accent': '#0369a1' },
  },
  {
    id: 'vivid-forest', label: 'ディープフォレスト', preview: '#166534', category: 'ビビッド',
    vars: { '--bg': '#f0fdf4', '--bg2': '#dcfce7', '--bg3': '#bbf7d0', '--border': '#4ade80', '--text': '#052e16', '--text2': '#166534', '--text3': '#16a34a', '--accent': '#15803d' },
  },
  // --- ダーク系 ---
  {
    id: 'dark', label: 'ダーク', preview: '#0f172a', category: 'ダーク',
    vars: { '--bg': '#0f172a', '--bg2': '#1e293b', '--bg3': '#334155', '--border': '#334155', '--text': '#f1f5f9', '--text2': '#94a3b8', '--text3': '#64748b', '--accent': '#3b82f6' },
  },
  {
    id: 'midnight', label: 'ミッドナイト', preview: '#09090b', category: 'ダーク',
    vars: { '--bg': '#09090b', '--bg2': '#18181b', '--bg3': '#27272a', '--border': '#27272a', '--text': '#fafafa', '--text2': '#a1a1aa', '--text3': '#71717a', '--accent': '#8b5cf6' },
  },
  {
    id: 'charcoal', label: 'チャコール', preview: '#1c1c1e', category: 'ダーク',
    vars: { '--bg': '#1c1c1e', '--bg2': '#2c2c2e', '--bg3': '#3a3a3c', '--border': '#3a3a3c', '--text': '#f5f5f7', '--text2': '#aeaeb2', '--text3': '#6c6c70', '--accent': '#ff9f0a' },
  },
  // --- フルカラー系 ---
  {
    id: 'ocean-vivid', label: 'オーシャン', preview: '#0c1a2e', category: 'フルカラー',
    vars: { '--bg': '#0c1a2e', '--bg2': '#0f2744', '--bg3': '#1a3a5c', '--border': '#1e4976', '--text': '#e0f2fe', '--text2': '#7dd3fc', '--text3': '#38bdf8', '--accent': '#0ea5e9' },
  },
  {
    id: 'forest-vivid', label: 'フォレスト', preview: '#0a1f0a', category: 'フルカラー',
    vars: { '--bg': '#0a1f0a', '--bg2': '#14321a', '--bg3': '#1a4524', '--border': '#1f5c2e', '--text': '#dcfce7', '--text2': '#86efac', '--text3': '#4ade80', '--accent': '#22c55e' },
  },
  {
    id: 'rose-vivid', label: 'ローズ', preview: '#1f0a14', category: 'フルカラー',
    vars: { '--bg': '#1f0a14', '--bg2': '#2d0f1e', '--bg3': '#3f1728', '--border': '#561d38', '--text': '#fce7f3', '--text2': '#f9a8d4', '--text3': '#f472b6', '--accent': '#ec4899' },
  },
  {
    id: 'purple-dark', label: 'パープル', preview: '#130a1e', category: 'フルカラー',
    vars: { '--bg': '#130a1e', '--bg2': '#1e0f33', '--bg3': '#2d1a4a', '--border': '#3d2563', '--text': '#f3e8ff', '--text2': '#d8b4fe', '--text3': '#a855f7', '--accent': '#a855f7' },
  },
  {
    id: 'amber-dark', label: 'アンバー', preview: '#1c1200', category: 'フルカラー',
    vars: { '--bg': '#1c1200', '--bg2': '#2d1f00', '--bg3': '#3d2e00', '--border': '#4d3d00', '--text': '#fef9c3', '--text2': '#fde047', '--text3': '#ca8a04', '--accent': '#f59e0b' },
  },
]

const CATEGORIES = ['ライト', 'くすみ', 'パステル', '原色', 'ビビッド', 'ダーク', 'フルカラー']

export function applyThemeVars(id: string) {
  const theme = THEMES.find(t => t.id === id)
  if (!theme) return
  const root = document.documentElement
  Object.entries(theme.vars).forEach(([key, val]) => root.style.setProperty(key, val))
}

// シリアライズされたテーマデータ（layout.tsxのインラインスクリプト用）
export const THEME_VARS_MAP = Object.fromEntries(THEMES.map(t => [t.id, t.vars]))

const ThemeContext = createContext<{
  themeId: string
  setThemeId: (id: string) => void
  themes: typeof THEMES
  categories: string[]
}>({ themeId: 'light', setThemeId: () => {}, themes: THEMES, categories: CATEGORIES })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeIdState] = useState('light')

  useEffect(() => {
    const saved = localStorage.getItem('kakeibo-theme') ?? 'light'
    applyThemeVars(saved)
    setThemeIdState(saved)
  }, [])

  const setThemeId = (id: string) => {
    applyThemeVars(id)
    setThemeIdState(id)
    localStorage.setItem('kakeibo-theme', id)
  }

  return (
    <ThemeContext.Provider value={{ themeId, setThemeId, themes: THEMES, categories: CATEGORIES }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
