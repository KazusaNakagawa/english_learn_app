import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import ArchivePage from '@/pages/ArchivePage'
import { SAMPLE_WORDS } from '@/data/sampleWords'
import { archiveWord, getArchivedWords, getTrashedWords, getWords } from '@/services/WordRepository'

const [archived, active] = SAMPLE_WORDS

function renderPage() {
  return render(
    <MemoryRouter>
      <ArchivePage />
    </MemoryRouter>,
  )
}

describe('ArchivePage', () => {
  beforeEach(async () => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    await getWords() // seed the samples
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('says the archive is empty when nothing is archived', async () => {
    renderPage()
    expect(await screen.findByText('アーカイブは空です')).toBeInTheDocument()
  })

  describe('with an archived word', () => {
    beforeEach(async () => {
      await archiveWord(archived.id, new Date('2026-11-08T03:00:00.000Z'))
    })

    it('lists it with the date it was archived, and not active words', async () => {
      renderPage()
      expect(await screen.findByText(archived.word)).toBeInTheDocument()
      expect(screen.getByText(archived.meaning)).toBeInTheDocument()
      expect(screen.getByText('アーカイブ日: 2026/11/8')).toBeInTheDocument()
      expect(screen.queryByText(active.word)).not.toBeInTheDocument()
    })

    it('returns it to the word list', async () => {
      renderPage()
      await userEvent.click(await screen.findByLabelText(`「${archived.word}」を単語一覧に戻す`))
      expect(await screen.findByText('アーカイブは空です')).toBeInTheDocument()
      expect((await getWords()).map((w) => w.id)).toContain(archived.id)
    })

    it('moves it to the trash', async () => {
      renderPage()
      await userEvent.click(await screen.findByLabelText(`「${archived.word}」をゴミ箱へ移動`))
      expect(await screen.findByText('アーカイブは空です')).toBeInTheDocument()
      expect((await getTrashedWords()).map((w) => w.id)).toEqual([archived.id])
      expect(await getArchivedWords()).toEqual([])
    })

    it("disables a row's buttons while one of its actions runs", async () => {
      renderPage()
      const restore = await screen.findByLabelText(`「${archived.word}」を単語一覧に戻す`)
      const trash = screen.getByLabelText(`「${archived.word}」をゴミ箱へ移動`)
      fireEvent.click(trash)
      expect(restore).toBeDisabled()
      fireEvent.click(restore)
      expect(await screen.findByText('アーカイブは空です')).toBeInTheDocument()
      const [word] = await getTrashedWords()
      expect(word.id).toBe(archived.id)
      expect(word.archivedAt).toBeDefined()
    })

    it('reports a failure and keeps the word listed', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      renderPage()
      const button = await screen.findByLabelText(`「${archived.word}」を単語一覧に戻す`)
      vi.stubGlobal('indexedDB', { open: () => { throw new Error('blocked') } })
      await userEvent.click(button)
      expect(await screen.findByText('操作に失敗しました')).toBeInTheDocument()
      expect(screen.getByText(archived.word)).toBeInTheDocument()
    })
  })

  it('shows a message when the archive cannot be loaded', async () => {
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('blocked') } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderPage()
    expect(await screen.findByText('単語データを読み込めませんでした')).toBeInTheDocument()
  })
})
