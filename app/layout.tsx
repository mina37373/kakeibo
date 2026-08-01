import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider, THEME_VARS_MAP } from "@/lib/theme";
import { HouseholdProvider } from "@/lib/household";

export const metadata: Metadata = {
  title: "家計簿",
  description: "家計簿・会計管理アプリ",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "家計簿",
  },
};

// ページ読み込み直後(Reactより先)にテーマを適用してフラッシュを防ぐ
const themeInitScript = `(function(){
  try {
    var id = localStorage.getItem('kakeibo-theme') || 'light';
    var map = ${JSON.stringify(THEME_VARS_MAP)};
    var vars = map[id] || map['light'];
    if (vars) {
      var root = document.documentElement;
      Object.keys(vars).forEach(function(k){ root.style.setProperty(k, vars[k]); });
    }
  } catch(e) {}
})();`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <HouseholdProvider>
            {children}
          </HouseholdProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
