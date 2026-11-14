import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import SettingsPage from '@/pages/SettingsPage'
import * as AudioService from '@/services/AudioService'
import { getCacheUsage } from '@/services/AudioCacheService'
import { getWords } from '@/services/WordRepository'
import { loadSettings, saveSettings } from '@/services/SettingsService'

vi.mock('@/services/AudioService', () => ({
  playTTS: vi.fn().mockResolvedValue('webspeech'),
  stopTTS: vi.fn(),
}))

vi.mock('@/services/AudioCacheService', () => ({
  getCacheUsage: vi.fn().mockResolvedValue(0),
  clearCache: vi.fn().mockResolvedValue(undefined),
}))

async function renderPage() {
  const view = render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  )
  await act(async () => {}) // let the cache usage request settle
  return view
}

describe('SettingsPage', () => {
  describe('stopping audio when leaving the page', () => {
    beforeEach(() => {
      vi.mocked(AudioService.stopTTS).mockClear()
      vi.mocked(AudioService.playTTS).mockClear()
    })

    it('calls stopTTS on unmount with nothing playing', async () => {
      const { unmount } = await renderPage()
      expect(AudioService.stopTTS).not.toHaveBeenCalled()
      unmount()
      expect(AudioService.stopTTS).toHaveBeenCalledOnce()
    })

    it('does not stop a sample while the page stays mounted', async () => {
      vi.mocked(AudioService.playTTS).mockImplementationOnce(() => new Promise(() => {}))
      await renderPage()
      await userEvent.click(screen.getByText('英語サンプルを再生'))
      expect(AudioService.playTTS).toHaveBeenCalledOnce()
      expect(AudioService.stopTTS).not.toHaveBeenCalled()
    })

    it('stops a sample that is still pending when the page unmounts', async () => {
      vi.mocked(AudioService.playTTS).mockImplementationOnce(() => new Promise(() => {}))
      const { unmount } = await renderPage()
      await userEvent.click(screen.getByText('日本語サンプルを再生'))
      unmount()
      expect(AudioService.stopTTS).toHaveBeenCalledOnce()
    })
  })

  describe('VOICEVOX key warning', () => {
    const warning = 'AppConfigのキーを使用中（設定で上書き可）'

    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('is not shown when no key exists anywhere, as with a local engine', async () => {
      vi.stubEnv('VITE_VOICEVOX_API_KEY_POC', '')
      await renderPage()
      expect(screen.queryByText(warning)).not.toBeInTheDocument()
    })

    it('is shown when the build-time key is in use', async () => {
      vi.stubEnv('VITE_VOICEVOX_ENDPOINT_POC', 'https://aws.test')
      vi.stubEnv('VITE_VOICEVOX_API_KEY_POC', 'build-key')
      await renderPage()
      expect(screen.getByText(warning)).toBeInTheDocument()
    })

    it('goes away once another endpoint is typed, since the build-time key is not sent there', async () => {
      vi.stubEnv('VITE_VOICEVOX_ENDPOINT_POC', 'https://aws.test')
      vi.stubEnv('VITE_VOICEVOX_API_KEY_POC', 'build-key')
      await renderPage()
      await userEvent.type(screen.getByLabelText('VOICEVOXの接続先'), 'http://127.0.0.1:50021')
      expect(screen.queryByText(warning)).not.toBeInTheDocument()
    })
  })

  describe('VOICEVOX endpoint', () => {
    const field = () => screen.getByLabelText('VOICEVOXの接続先')

    beforeEach(() => {
      localStorage.clear()
      sessionStorage.clear()
      vi.stubEnv('VITE_VOICEVOX_ENDPOINT_POC', 'https://aws.test')
      vi.stubEnv('VITE_VOICEVOX_API_KEY_POC', 'build-key')
      vi.mocked(AudioService.playTTS).mockClear()
    })

    afterEach(() => {
      vi.unstubAllEnvs()
      vi.unstubAllGlobals()
      localStorage.clear()
    })

    it('shows the build-time endpoint as the placeholder while empty', async () => {
      await renderPage()
      expect(field()).toHaveAttribute('placeholder', 'https://aws.test')
      expect(screen.getByText('空欄のときは、ビルド時の接続先を使います')).toBeInTheDocument()
    })

    it('saves a typed endpoint, and playback uses it without the build-time key', async () => {
      await renderPage()
      await userEvent.type(field(), 'http://127.0.0.1:50021')
      expect(loadSettings().voicevoxEndpoint).toBe('http://127.0.0.1:50021')
      await userEvent.click(screen.getByText('日本語サンプルを再生'))
      expect(AudioService.playTTS).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        endpoint: 'http://127.0.0.1:50021', apiKey: '',
      }))
    })

    it('restores the saved endpoint on the next visit, and 既定に戻す clears it', async () => {
      saveSettings({ voicevoxEndpoint: 'http://127.0.0.1:50021' })
      await renderPage()
      expect(field()).toHaveValue('http://127.0.0.1:50021')
      await userEvent.click(screen.getByRole('button', { name: '既定に戻す' }))
      expect(field()).toHaveValue('')
      expect(loadSettings().voicevoxEndpoint).toBe('')
    })

    it('says an invalid URL is not used', async () => {
      await renderPage()
      await userEvent.type(field(), '127.0.0.1:50021')
      expect(screen.getByText('http:// か https:// で始まる URL を入力してください。いまはビルド時の接続先を使います')).toBeInTheDocument()
    })

    it('warns that a remote endpoint without a key falls back to the browser voice', async () => {
      await renderPage()
      await userEvent.type(field(), 'https://other.test')
      expect(screen.getByText('この接続先にはAPIキーが必要です。キーがないあいだはブラウザの音声で読みます')).toBeInTheDocument()
    })

    it('does not show a late result under an endpoint typed after the test started', async () => {
      let answer: (res: Response) => void = () => {}
      vi.stubGlobal('fetch', vi.fn((_: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
        answer = resolve
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })))
      await renderPage()
      await userEvent.click(screen.getByRole('button', { name: '接続テスト' }))
      expect(screen.getByRole('button', { name: '接続中…' })).toBeInTheDocument()
      await userEvent.type(field(), 'http://127.0.0.1:50021')
      await act(async () => { answer(new Response('[]')) })
      expect(screen.queryByText(/接続できました/)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: '接続テスト' })).toBeEnabled()
    })

    it('sends a typed key only to the endpoint it was typed for', async () => {
      await renderPage()
      await userEvent.type(screen.getByLabelText('VOICEVOXのAPIキー'), 'mine')
      await userEvent.click(screen.getByText('日本語サンプルを再生'))
      expect(AudioService.playTTS).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({
        endpoint: 'https://aws.test', apiKey: 'mine',
      }))

      await userEvent.type(field(), 'https://other.test')
      expect(screen.getByText('このキーは別の接続先（https://aws.test）用のため、いまの接続先には送りません。使うなら入力し直してください')).toBeInTheDocument()
      await userEvent.click(screen.getByText('日本語サンプルを再生'))
      expect(AudioService.playTTS).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({
        endpoint: 'https://other.test', apiKey: '',
      }))
    })

    it('tests the connection and shows the engine version', async () => {
      // A fresh Response per call: the page also checks /api/health on mount.
      const fetchMock = vi.fn(async () => new Response(JSON.stringify('0.25.1')))
      vi.stubGlobal('fetch', fetchMock)
      await renderPage()
      await userEvent.type(field(), 'http://127.0.0.1:50021')
      await userEvent.click(screen.getByRole('button', { name: '接続テスト' }))
      expect(await screen.findByText('接続できました（VOICEVOX 0.25.1）')).toBeInTheDocument()
      expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:50021/version', expect.anything())
    })
  })

  describe('word list import and export', () => {
    const ID_A = 'AAAAAAAA-0001-4001-8001-000000000001'
    const ID_B = 'BBBBBBBB-0001-4001-8001-000000000001'
    const fileWord = (id: string, word: string) => ({ id, word, meaning: '意味', phonetic: '', sentences: [] })
    const upload = async (text: string) => {
      const file = new File([text], 'words.json', { type: 'application/json' })
      await userEvent.upload(screen.getByLabelText('単語ファイルを選択'), file)
    }
    const uploadWords = (...words: unknown[]) => upload(JSON.stringify({ words }))
    const readBlob = (blob: Blob) =>
      new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsText(blob)
      })

    beforeEach(async () => {
      vi.mocked(getCacheUsage).mockResolvedValue(0) // restoreAllMocks clears it
      vi.stubGlobal('indexedDB', new IDBFactory())
      const { mergeWords } = await import('@/services/WordRepository')
      await mergeWords([{ ...fileWord(ID_A, 'apple') }])
    })

    const originalURL = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }

    afterEach(() => {
      URL.createObjectURL = originalURL.create
      URL.revokeObjectURL = originalURL.revoke
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
    })

    it('downloads the words as an iOS-format file', async () => {
      const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:words')
      URL.createObjectURL = createObjectURL as typeof URL.createObjectURL
      URL.revokeObjectURL = vi.fn()
      let connectedAtClick = false
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        connectedAtClick = this.isConnected
      })
      await renderPage()

      await userEvent.click(screen.getByText('単語リストをエクスポート'))

      await vi.waitFor(() => expect(click).toHaveBeenCalledOnce())
      const anchor = click.mock.contexts[0] as HTMLAnchorElement
      expect(connectedAtClick).toBe(true)
      expect(anchor.isConnected).toBe(false)
      expect(URL.revokeObjectURL).not.toHaveBeenCalled()
      expect(anchor.download).toMatch(/^words_export_\d+\.json$/)
      const exported = JSON.parse(await readBlob(createObjectURL.mock.calls[0][0]))
      expect(exported.words.map((w: { word: string }) => w.word)).toEqual(['apple'])
      await vi.waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:words'), { timeout: 3000 })
    })

    it('refuses to export an empty list', async () => {
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
      const { replaceWords } = await import('@/services/WordRepository')
      await replaceWords([{ ...fileWord(ID_B, 'trashed'), deletedAt: '2026-11-01T00:00:00.000Z' }])
      await renderPage()
      await userEvent.click(screen.getByText('単語リストをエクスポート'))
      expect(await screen.findByText('エクスポートする単語がありません')).toBeInTheDocument()
      expect(click).not.toHaveBeenCalled()
    })

    it('says when added words will not appear in the list', async () => {
      await renderPage()
      await uploadWords({ ...fileWord(ID_B, 'archived'), archivedAt: 784111777 })
      await userEvent.click(await screen.findByRole('button', { name: '追加' }))
      expect(await screen.findByText('1件を追加しました（1件はアーカイブかゴミ箱のため一覧に表示されません）')).toBeInTheDocument()
    })

    it('asks how to import and changes nothing until a mode is chosen', async () => {
      await renderPage()
      await uploadWords(fileWord(ID_B, 'banana'))
      expect(await screen.findByText('1件の単語をインポートします')).toBeInTheDocument()
      expect((await getWords()).map((w) => w.word)).toEqual(['apple'])
    })

    it('merges and reports the counts', async () => {
      await renderPage()
      await uploadWords(fileWord(ID_A, 'apple'), fileWord(ID_B, 'banana'))
      await userEvent.click(await screen.findByRole('button', { name: '追加' }))
      expect(await screen.findByText('1件を追加しました（1件は登録済みのためスキップ）')).toBeInTheDocument()
      expect((await getWords()).map((w) => w.word)).toEqual(['apple', 'banana'])
      expect(screen.queryByText('2件の単語をインポートします')).not.toBeInTheDocument()
    })

    it('replaces the list', async () => {
      await renderPage()
      await uploadWords(fileWord(ID_B, 'banana'))
      await userEvent.click(await screen.findByRole('button', { name: '置き換え' }))
      expect(await screen.findByText('1件でデータを置き換えました')).toBeInTheDocument()
      expect((await getWords()).map((w) => w.word)).toEqual(['banana'])
    })

    it('leaves the list alone when the import is cancelled', async () => {
      await renderPage()
      await uploadWords(fileWord(ID_B, 'banana'))
      await userEvent.click(await screen.findByRole('button', { name: 'キャンセル' }))
      expect(screen.queryByText('1件の単語をインポートします')).not.toBeInTheDocument()
      expect((await getWords()).map((w) => w.word)).toEqual(['apple'])
    })

    it('shows why a file is invalid and changes nothing', async () => {
      await renderPage()
      await upload('{"words":[]}')
      expect(await screen.findByText('単語がありません')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '置き換え' })).not.toBeInTheDocument()
      expect((await getWords()).map((w) => w.word)).toEqual(['apple'])
    })

    it('reports a save failure', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await renderPage()
      await uploadWords(fileWord(ID_B, 'banana'))
      const button = await screen.findByRole('button', { name: '追加' })
      vi.stubGlobal('indexedDB', { open: () => { throw new Error('blocked') } })
      await userEvent.click(button)
      expect(await screen.findByText('単語の保存に失敗しました')).toBeInTheDocument()
    })
  })

  describe('sentence generation provider', () => {
    const health = (claude: object) => ({
      ok: true, status: 200, json: async () => ({ app: 'english-learn-app', version: '0.1.0', claude }),
    })

    beforeEach(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    afterEach(() => vi.unstubAllGlobals())

    it('defaults to Claude Code and shows that it is ready, with the plan', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => health({ installed: true, loggedIn: true, subscriptionType: 'max' })))
      await renderPage()
      expect(await screen.findByText('Claude Code（Max プラン）で生成できます')).toBeInTheDocument()
      expect(screen.getByLabelText('使用モデル')).toHaveValue('sonnet')
      expect(screen.queryByLabelText('OpenAI APIキー')).not.toBeInTheDocument()
    })

    it('shows the setup steps, including the dev server, when there is no local API', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })))
      await renderPage()
      expect(await screen.findByText('この画面では Claude Code で生成できません')).toBeInTheDocument()
      expect(screen.getByText('npm run dev')).toBeInTheDocument()
    })

    it('saves the Claude model', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => health({ installed: true, loggedIn: true })))
      await renderPage()
      await userEvent.selectOptions(screen.getByLabelText('使用モデル'), 'haiku')
      expect(loadSettings().claudeModel).toBe('haiku')
    })

    it('switching to OpenAI shows the key and model fields and saves the choice', async () => {
      const fetchMock = vi.fn(async () => health({ installed: true, loggedIn: true }))
      vi.stubGlobal('fetch', fetchMock)
      await renderPage()
      await userEvent.click(screen.getByRole('button', { name: 'OpenAI' }))
      expect(loadSettings().aiProvider).toBe('openai')
      expect(screen.getByLabelText('OpenAI APIキー')).toBeInTheDocument()
      expect(screen.getByLabelText('使用モデル')).toHaveValue('gpt-4o-mini')
      expect(screen.queryByText(/Claude Code（.*）で生成できます/)).not.toBeInTheDocument()
    })

    it('keeps an OpenAI key from before the provider setting on OpenAI', async () => {
      localStorage.setItem('english_learn_app_settings', JSON.stringify({ openAIModel: 'gpt-4o' }))
      saveSettings({ openAIKey: 'sk-existing' })
      expect(loadSettings().aiProvider).toBe('openai')
    })

    it('an explicit choice wins over the key', async () => {
      saveSettings({ openAIKey: 'sk-existing', aiProvider: 'claude-code' })
      expect(loadSettings().aiProvider).toBe('claude-code')
    })

    it('does not check the local API while OpenAI is selected', async () => {
      saveSettings({ aiProvider: 'openai' })
      const fetchMock = vi.fn(async () => health({ installed: true, loggedIn: true }))
      vi.stubGlobal('fetch', fetchMock)
      await renderPage()
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('zundamon availability', () => {
    const LOCAL = 'http://127.0.0.1:50021'
    const REMOTE = 'https://voicevox.example.com'
    const zundamonButtons = () => screen.getAllByRole('button', { name: 'ずんだもん' })
    const engine = (up: boolean) => vi.stubGlobal('fetch', vi.fn(async () => {
      if (!up) throw new TypeError('Failed to fetch')
      return new Response('"0.25.1"', { status: 200 })
    }))

    afterEach(() => {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
      localStorage.clear()
    })

    it('disables zundamon for both languages while there is no endpoint, and says why', async () => {
      await renderPage()
      expect(zundamonButtons()).toHaveLength(2)
      zundamonButtons().forEach((b) => expect(b).toBeDisabled())
      expect(screen.getByText(/ずんだもんは、VOICEVOX の接続先と API キーを設定すると選べます/)).toBeInTheDocument()
    })

    it('keeps zundamon disabled for a remote endpoint without a key', async () => {
      saveSettings({ voicevoxEndpoint: REMOTE })
      await renderPage()
      zundamonButtons().forEach((b) => expect(b).toBeDisabled())
    })

    it('enables zundamon when a local engine answers, and shows no hint', async () => {
      engine(true)
      saveSettings({ voicevoxEndpoint: LOCAL })
      await renderPage()
      zundamonButtons().forEach((b) => expect(b).toBeEnabled())
      expect(screen.queryByText(/ずんだもん.*選べません|選べます/)).not.toBeInTheDocument()
    })

    it('disables zundamon when the local engine is not running, and says so', async () => {
      engine(false)
      saveSettings({ voicevoxEndpoint: LOCAL })
      await renderPage()
      zundamonButtons().forEach((b) => expect(b).toBeDisabled())
      expect(screen.getByText(/エンジンに接続できない/)).toBeInTheDocument()
    })

    it('enables zundamon after the engine is started and the window regains focus', async () => {
      engine(false)
      saveSettings({ voicevoxEndpoint: LOCAL })
      await renderPage()
      zundamonButtons().forEach((b) => expect(b).toBeDisabled())
      engine(true)
      await act(async () => { window.dispatchEvent(new Event('focus')) })
      zundamonButtons().forEach((b) => expect(b).toBeEnabled())
    })

    it('disables zundamon offline for a remote endpoint with a key, and re-enables it online', async () => {
      saveSettings({ voicevoxEndpoint: REMOTE, voicevoxApiKey: 'key', voicevoxApiKeyOrigin: REMOTE })
      const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
      await renderPage()
      zundamonButtons().forEach((b) => expect(b).toBeDisabled())
      expect(screen.getByText(/オフラインのため/)).toBeInTheDocument()
      online.mockReturnValue(true)
      await act(async () => { window.dispatchEvent(new Event('online')) })
      zundamonButtons().forEach((b) => expect(b).toBeEnabled())
    })

    it('leaves the other voices selectable while zundamon is disabled', async () => {
      await renderPage()
      expect(screen.getByRole('button', { name: '女性' })).toBeEnabled()
      expect(screen.getByRole('button', { name: '男性' })).toBeEnabled()
    })
  })
})
