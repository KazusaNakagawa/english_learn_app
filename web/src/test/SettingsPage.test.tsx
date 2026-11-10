import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import SettingsPage from '@/pages/SettingsPage'
import * as AudioService from '@/services/AudioService'
import { getCacheUsage } from '@/services/AudioCacheService'
import { getWords } from '@/services/WordRepository'

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
      vi.stubEnv('VITE_VOICEVOX_API_KEY_POC', 'build-key')
      await renderPage()
      expect(screen.getByText(warning)).toBeInTheDocument()
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
})
