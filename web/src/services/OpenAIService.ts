/**
 * OpenAIService — generates a meaning, a phonetic spelling, and example
 * sentences for a word, matching the iOS OpenAIService prompt and JSON shape.
 * Called straight from the browser with the user's own key.
 */

const ENDPOINT = 'https://api.openai.com/v1/chat/completions'

/** iOS generates 20, the count its bundled word list uses. */
export const SENTENCE_COUNT = 20

/** The iOS built-in 「一般」 preset. Presets are not configurable on the Web yet. */
export const DEFAULT_CONDITIONS = `条件：
- 日常会話、ビジネス、学習など多様なシーンの例文を含めてください
- カテゴリは「日常会話」「ビジネス」「学習・教育」「趣味・娯楽」「旅行」などから適切なものを選んでください
- 自然で実用的な例文にしてください
- 日本語訳は自然な日本語にしてください`

const SYSTEM_PROMPT = `あなたは英語学習アプリ用のアシスタントです。
与えられた英単語について、日本語の意味・IPA発音記号・自然な例文を生成してください。
以下の形式のJSON形式で返答してください：
{
  "meaning": "日本語の意味（簡潔に）",
  "phonetic": "/IPA発音記号/",
  "sentences": [
    {
      "english": "英文",
      "japanese": "日本語訳",
      "category": "カテゴリ"
    }
  ]
}`

export interface GeneratedSentence {
  english: string
  japanese: string
  category: string
}

export interface GeneratedContent {
  meaning: string
  phonetic: string
  sentences: GeneratedSentence[]
}

/** A generation that failed for a reason worth telling the user. Aborts are not wrapped. */
export class GenerationError extends Error {}

interface Options {
  apiKey: string
  model: string
  signal?: AbortSignal
}

const isText = (value: unknown): value is string => typeof value === 'string'

function readSentence(value: unknown): GeneratedSentence | null {
  if (typeof value !== 'object' || value === null) return null
  const { english, japanese, category } = value as Record<string, unknown>
  if (!isText(english) || !isText(japanese) || !english.trim() || !japanese.trim()) return null
  return { english, japanese, category: isText(category) ? category : '' }
}

function messageFor(status: number): string {
  if (status === 401) return 'APIキーが正しくありません'
  if (status === 429) return '利用上限に達したか混み合っています。しばらくしてから再試行してください'
  return `生成に失敗しました（ステータス ${status}）`
}

export async function generateContent(word: string, { apiKey, model, signal }: Options): Promise<GeneratedContent> {
  if (!apiKey) throw new GenerationError('設定でOpenAI APIキーを入力してください')
  // Flattened and capped as on iOS, with 「」 removed so the word cannot close
  // its quotes. This narrows prompt injection; it does not rule it out.
  const cleanWord = word.replace(/\s*\n\s*/g, ' ').replace(/[「」]/g, '').trim().slice(0, 100)
  if (!cleanWord) throw new GenerationError('英単語を入力してください')

  let response: Response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `「${cleanWord}」の意味・発音記号・例文を${SENTENCE_COUNT}個生成してください。\n\n${DEFAULT_CONDITIONS}` },
        ],
        response_format: { type: 'json_object' },
      }),
      signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new GenerationError('OpenAIに接続できませんでした')
  }
  if (!response.ok) throw new GenerationError(messageFor(response.status))

  let choice: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } } | undefined
  try {
    choice = (await response.json()).choices?.[0]
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new GenerationError('例文を生成できませんでした')
  }
  if (choice?.message?.refusal) throw new GenerationError('OpenAIが生成を断りました。単語を見直してください')
  // A reply cut off at the token limit is incomplete JSON. Smaller models hit this most.
  if (choice?.finish_reason === 'length') {
    throw new GenerationError('生成結果が長すぎて途中で切れました。もう一度試すか、別のモデルを選んでください')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(choice?.message?.content ?? '')
  } catch {
    throw new GenerationError('例文を生成できませんでした')
  }
  const fields = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>
  const sentences = (Array.isArray(fields.sentences) ? fields.sentences : [])
    .map(readSentence)
    .filter((s): s is GeneratedSentence => s !== null)
  if (sentences.length === 0) throw new GenerationError('例文を生成できませんでした')

  return {
    meaning: isText(fields.meaning) ? fields.meaning.trim() : '',
    phonetic: isText(fields.phonetic) ? fields.phonetic.trim().replace(/^\/+|\/+$/g, '') : '',
    sentences,
  }
}
