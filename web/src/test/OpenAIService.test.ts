import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DEFAULT_CONDITIONS, generateContent, GenerationError, SENTENCE_COUNT } from '@/services/OpenAIService'

const content = {
  meaning: '珍しさ',
  phonetic: '/ˈreər.ɪ.ti/',
  sentences: [
    { english: 'Snow is a rarity here.', japanese: 'ここでは雪は珍しい。', category: '日常会話' },
    { english: 'A true rarity.', japanese: '本当に希少なもの。', category: '趣味・娯楽' },
  ],
}
const reply = (body: unknown, status = 200) =>
  ({ ok: status === 200, status, json: async () => body }) as Response
const completion = (inner: unknown) => reply({ choices: [{ message: { content: JSON.stringify(inner) } }] })
const options = { apiKey: 'sk-test', model: 'gpt-4o-mini' }

describe('generateContent', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async () => completion(content))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('success', () => {
    it('sends the word, count, and conditions to the chat completions API as JSON mode', async () => {
      await generateContent('rarity', options)
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('https://api.openai.com/v1/chat/completions')
      expect(init.headers.Authorization).toBe('Bearer sk-test')
      const body = JSON.parse(init.body)
      expect(body.model).toBe('gpt-4o-mini')
      expect(body.response_format).toEqual({ type: 'json_object' })
      const user = body.messages.find((m: { role: string }) => m.role === 'user').content
      expect(user).toContain('「rarity」')
      expect(user).toContain(`${SENTENCE_COUNT}個`)
      expect(user).toContain(DEFAULT_CONDITIONS)
    })

    it('returns the meaning, the phonetic without slashes, and the sentences', async () => {
      await expect(generateContent('rarity', options)).resolves.toEqual({
        meaning: '珍しさ',
        phonetic: 'ˈreər.ɪ.ti',
        sentences: content.sentences,
      })
    })

    it('flattens newlines and caps the word length, as iOS does against prompt injection', async () => {
      await generateContent(`rar\nity${'x'.repeat(200)}`, options)
      const user = JSON.parse(fetchMock.mock.calls[0][1].body).messages[1].content as string
      const word = user.slice(user.indexOf('「') + 1, user.indexOf('」'))
      expect(word).not.toContain('\n')
      expect(word).toHaveLength(100)
    })

    it('drops malformed sentences and fills a missing meaning or phonetic with empty text', async () => {
      fetchMock.mockResolvedValueOnce(completion({
        sentences: [content.sentences[0], { english: 'No translation.' }, 'text', null],
      }))
      await expect(generateContent('rarity', options)).resolves.toEqual({
        meaning: '',
        phonetic: '',
        sentences: [content.sentences[0]],
      })
    })

    it('passes the abort signal on', async () => {
      const controller = new AbortController()
      await generateContent('rarity', { ...options, signal: controller.signal })
      expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal)
    })
  })

  describe('failure', () => {
    it.each([
      ['no API key', { apiKey: '' }, '設定でOpenAI APIキーを入力してください'],
      ['an empty word', { word: '  ' }, '英単語を入力してください'],
    ])('refuses %s without calling the API', async (_, extra, message) => {
      const { word = 'rarity', ...rest } = extra as { word?: string; apiKey?: string }
      await expect(generateContent(word, { ...options, ...rest })).rejects.toThrow(message)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it.each([
      [401, 'APIキーが正しくありません'],
      [429, '利用上限に達したか混み合っています。しばらくしてから再試行してください'],
      [500, '生成に失敗しました（ステータス 500）'],
    ])('explains a %i response', async (status, message) => {
      fetchMock.mockResolvedValueOnce(reply({ error: {} }, status))
      const error = await generateContent('rarity', options).catch((e) => e)
      expect(error).toBeInstanceOf(GenerationError)
      expect(error.message).toBe(message)
    })

    it('explains a network failure', async () => {
      fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      await expect(generateContent('rarity', options)).rejects.toThrow('OpenAIに接続できませんでした')
    })

    it('lets an abort through unchanged, so the caller can tell it from a failure', async () => {
      fetchMock.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'))
      const error = await generateContent('rarity', options).catch((e) => e)
      expect(error).not.toBeInstanceOf(GenerationError)
      expect(error.name).toBe('AbortError')
    })

    it.each([
      ['content that is not JSON', reply({ choices: [{ message: { content: 'sorry' } }] })],
      ['no choices', reply({ choices: [] })],
      ['no usable sentences', completion({ meaning: 'x', sentences: [] })],
    ])('reports %s as a failed generation', async (_, response) => {
      fetchMock.mockResolvedValueOnce(response)
      await expect(generateContent('rarity', options)).rejects.toThrow('例文を生成できませんでした')
    })
  })
})
