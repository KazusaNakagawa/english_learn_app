import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { IDBFactory } from 'fake-indexeddb'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import TrashPage from '@/pages/TrashPage'
import { SAMPLE_WORDS } from '@/data/sampleWords'
import { archiveWord, getArchivedWords, getWord, getWords, trashWord } from '@/services/WordRepository'

const [trashed, active] = SAMPLE_WORDS

function renderPage() {
  return render(
    <MemoryRouter>
      <TrashPage />
    </MemoryRouter>,
  )
}

describe('TrashPage', () => {
  beforeEach(async () => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    await getWords() // seed the samples
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('says the trash is empty when nothing is deleted', async () => {
    renderPage()
    expect(await screen.findByText('ゴミ箱は空です')).toBeInTheDocument()
  })

  describe('with a trashed word', () => {
    beforeEach(async () => {
      await trashWord(trashed.id)
    })

    it('lists it with the days left, and not active words', async () => {
      renderPage()
      expect(await screen.findByText(trashed.word)).toBeInTheDocument()
      expect(screen.getByText('あと10日で完全削除')).toBeInTheDocument()
      expect(screen.queryByText('元に戻すとアーカイブに戻ります')).not.toBeInTheDocument()
      expect(screen.queryByText(active.word)).not.toBeInTheDocument()
    })

    it('restores it to the word list', async () => {
      renderPage()
      await userEvent.click(await screen.findByLabelText(`「${trashed.word}」を元に戻す`))
      expect(await screen.findByText('ゴミ箱は空です')).toBeInTheDocument()
      expect((await getWords()).map((w) => w.id)).toContain(trashed.id)
    })

    it('asks before deleting permanently, and cancel keeps it', async () => {
      renderPage()
      await userEvent.click(await screen.findByLabelText(`「${trashed.word}」を完全に削除`))
      expect(screen.getByText('この操作は取り消せません')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
      expect(screen.queryByText('この操作は取り消せません')).not.toBeInTheDocument()
      expect(await getWord(trashed.id)).not.toBeNull()
    })

    it('deletes it permanently once confirmed', async () => {
      renderPage()
      await userEvent.click(await screen.findByLabelText(`「${trashed.word}」を完全に削除`))
      await userEvent.click(screen.getByRole('button', { name: '完全に削除する' }))
      expect(await screen.findByText('ゴミ箱は空です')).toBeInTheDocument()
      await expect(getWord(trashed.id)).resolves.toBeNull()
    })

    it('reports a failed restore and keeps the word listed', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      renderPage()
      const button = await screen.findByLabelText(`「${trashed.word}」を元に戻す`)
      vi.stubGlobal('indexedDB', { open: () => { throw new Error('blocked') } })
      await userEvent.click(button)
      expect(await screen.findByText('操作に失敗しました')).toBeInTheDocument()
      expect(screen.getByText(trashed.word)).toBeInTheDocument()
    })
  })

  it('says an archived word goes back to the archive, and sends it there', async () => {
    await archiveWord(trashed.id)
    await trashWord(trashed.id)
    renderPage()
    expect(await screen.findByText('元に戻すとアーカイブに戻ります')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText(`「${trashed.word}」を元に戻す`))
    expect(await screen.findByText('ゴミ箱は空です')).toBeInTheDocument()
    expect((await getArchivedWords()).map((w) => w.id)).toEqual([trashed.id])
  })

  it("keeps one row's delete prompt open while another row is restored", async () => {
    await trashWord(trashed.id)
    await trashWord(active.id)
    renderPage()
    await userEvent.click(await screen.findByLabelText(`「${trashed.word}」を完全に削除`))
    await userEvent.click(screen.getByLabelText(`「${active.word}」を元に戻す`))
    await vi.waitFor(() => expect(screen.queryByText(active.word)).not.toBeInTheDocument())
    expect(screen.getByText('この操作は取り消せません')).toBeInTheDocument()
  })

  it('shows a message when the trash cannot be loaded', async () => {
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('blocked') } })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderPage()
    expect(await screen.findByText('単語データを読み込めませんでした')).toBeInTheDocument()
  })
})
