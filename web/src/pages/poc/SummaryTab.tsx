type Results = Record<string, boolean>

const ITEMS: { key: string; label: string; note: string }[] = [
  { key: 'tts_support', label: 'Web Speech API — TTS', note: 'All modern browsers' },
  { key: 'stt_support', label: 'Web Speech API — STT', note: 'Chrome / Edge only; Safari ✗' },
  { key: 'idb_init', label: 'IndexedDB — schema init', note: '' },
  { key: 'idb_blob', label: 'IndexedDB — Blob storage', note: '100 KB WAV Blob stored/retrieved' },
  { key: 'idb_purge', label: 'IndexedDB — soft-delete purge', note: '10-day threshold verified' },
  { key: 'cors_ok', label: 'VOICEVOX Lambda — CORS', note: 'Must be deployed via CDK' },
  { key: 'voicevox_ok', label: 'VOICEVOX Lambda — WAV fetch & play', note: 'Requires CORS first' },
]

export default function SummaryTab({ results }: { results: Results }) {
  const allTested = ITEMS.every((i) => i.key in results)
  const passed = ITEMS.filter((i) => results[i.key] === true).length

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">Validation Checklist</h3>
          {allTested && (
            <span className="text-xs font-semibold text-blue-600">
              {passed} / {ITEMS.length} passed
            </span>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500">
              <th className="pb-2 font-medium">Item</th>
              <th className="pb-2 font-medium text-center">Status</th>
              <th className="pb-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {ITEMS.map(({ key, label, note }) => {
              const val = results[key]
              const badge =
                val === undefined ? (
                  <span className="text-gray-400 text-xs">Not tested</span>
                ) : val ? (
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                    ✓ Pass
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
                    ✗ Fail
                  </span>
                )
              return (
                <tr key={key} className="border-b last:border-0">
                  <td className="py-2 pr-4">{label}</td>
                  <td className="py-2 text-center">{badge}</td>
                  <td className="py-2 text-xs text-gray-500">{note}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {!allTested && (
        <p className="text-sm text-gray-500 text-center">
          Run validations on each tab to populate this table.
        </p>
      )}
    </div>
  )
}
