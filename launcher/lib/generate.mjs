// The sentence-generation prompt and reply checks. The prompt is a copy of
// web/src/services/OpenAIService.ts (itself the iOS prompt and 「一般」 preset);
// test/generate.test.mjs fails if the two drift apart.
import { ClaudeError, runClaude } from "./claude.mjs"

export const SENTENCE_COUNT = 20

export const DEFAULT_CONDITIONS = `条件：
- 日常会話、ビジネス、学習など多様なシーンの例文を含めてください
- カテゴリは「日常会話」「ビジネス」「学習・教育」「趣味・娯楽」「旅行」などから適切なものを選んでください
- 自然で実用的な例文にしてください
- 日本語訳は自然な日本語にしてください`

export const SYSTEM_PROMPT = `あなたは英語学習アプリ用のアシスタントです。
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

/** The reply shape, enforced by the CLI's --json-schema. */
export const SCHEMA = {
  type: "object",
  properties: {
    meaning: { type: "string" },
    phonetic: { type: "string" },
    sentences: {
      type: "array",
      items: {
        type: "object",
        properties: {
          english: { type: "string" },
          japanese: { type: "string" },
          category: { type: "string" },
        },
        required: ["english", "japanese", "category"],
        additionalProperties: false,
      },
    },
  },
  required: ["meaning", "phonetic", "sentences"],
  additionalProperties: false,
}

/**
 * Flattened and capped as on iOS, with 「」 removed so the word cannot close
 * its quotes. This narrows prompt injection; it does not rule it out, which is
 * why the CLI also runs with no tools.
 */
export function cleanWord(word) {
  if (typeof word !== "string") return ""
  return word.replace(/\s*\n\s*/g, " ").replace(/[「」]/g, "").trim().slice(0, 100)
}

export function userPrompt(word) {
  return `「${word}」の意味・発音記号・例文を${SENTENCE_COUNT}個生成してください。\n\n${DEFAULT_CONDITIONS}`
}

const isText = (value) => typeof value === "string"

function readSentence(value) {
  if (typeof value !== "object" || value === null) return null
  const { english, japanese, category } = value
  if (!isText(english) || !isText(japanese) || !english.trim() || !japanese.trim()) return null
  return { english, japanese, category: isText(category) ? category : "" }
}

/** The usable part of a reply, or null when it has no sentence. Mirrors OpenAIService. */
export function readGenerated(value) {
  const fields = typeof value === "object" && value !== null ? value : {}
  const sentences = (Array.isArray(fields.sentences) ? fields.sentences : [])
    .map(readSentence)
    .filter((s) => s !== null)
    .slice(0, SENTENCE_COUNT)
  if (sentences.length === 0) return null
  return {
    meaning: isText(fields.meaning) ? fields.meaning.trim() : "",
    phonetic: isText(fields.phonetic) ? fields.phonetic.trim().replace(/^\/+|\/+$/g, "") : "",
    sentences,
  }
}

/** Generate the meaning, phonetic, and sentences for one word. */
export async function generateSentences({ word, model, signal, run = runClaude }) {
  const clean = cleanWord(word)
  if (!clean) throw new ClaudeError("bad-request", "英単語を入力してください")
  const reply = await run({ prompt: userPrompt(clean), systemPrompt: SYSTEM_PROMPT, schema: SCHEMA, model, signal })
  const content = readGenerated(reply)
  if (!content) throw new ClaudeError("failed", "例文を生成できませんでした。もう一度試してください。")
  return content
}
