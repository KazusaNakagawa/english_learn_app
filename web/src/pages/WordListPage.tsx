const appVersion = import.meta.env.VITE_APP_VERSION ?? '—'
const appEnv = import.meta.env.VITE_APP_ENV ?? '—'

export default function WordListPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold text-blue-600">English Learn App</h1>
      <p className="text-gray-500 text-sm">Web version — scaffold ready</p>
      <p className="text-gray-400 text-xs">
        v{appVersion} · {appEnv}
      </p>
    </div>
  )
}
