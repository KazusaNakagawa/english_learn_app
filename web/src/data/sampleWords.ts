export interface Sentence {
  id: string
  english: string
  japanese: string
  category: string
}

export interface Word {
  id: string
  word: string
  meaning: string
  phonetic: string
  sentences: Sentence[]
}

export const SAMPLE_WORDS: Word[] = [
  {
    id: '1',
    word: 'rarity',
    meaning: '珍しさ・希少性',
    phonetic: 'ˈreər.ɪ.ti',
    sentences: [
      { id: '1-1', english: 'True friendship is a rarity in this world.', japanese: '本当の友情はこの世では珍しいものだ。', category: '一般的な使い方' },
      { id: '1-2', english: 'Snow is a rarity in this region.', japanese: 'この地域では雪は珍しい。', category: '一般的な使い方' },
      { id: '1-3', english: 'Kindness like hers is a rarity these days.', japanese: '彼女のような優しさは、今では稀だ。', category: '一般的な使い方' },
      { id: '1-4', english: 'This antique watch is a true rarity.', japanese: 'このアンティーク時計は本当に希少品だ。', category: 'コレクション・骨董' },
      { id: '1-5', english: 'Such talent is a rarity among young athletes.', japanese: 'そのような才能は若いアスリートの中では珍しい。', category: 'スポーツ' },
    ],
  },
  {
    id: '2',
    word: 'experience',
    meaning: '経験、体験',
    phonetic: 'ɪkˈspɪər.i.əns',
    sentences: [
      { id: '2-1', english: 'I had a wonderful experience during my trip to Italy.', japanese: 'イタリア旅行中に素晴らしい体験をした。', category: '一般的な経験' },
      { id: '2-2', english: 'Experience is the best teacher.', japanese: '経験は最良の教師である。', category: '教育・人生の教訓' },
      { id: '2-3', english: 'She has ten years of experience in marketing.', japanese: '彼女はマーケティングで10年の経験がある。', category: 'ビジネス・キャリア' },
      { id: '2-4', english: 'The near-death experience changed his perspective on life.', japanese: '臨死体験が人生への見方を変えた。', category: '特別な体験' },
      { id: '2-5', english: 'This… is my Stand! Gold Experience!', japanese: 'これが……オレのスタンド！「ゴールド・エクスペリエンス」だッ！', category: 'Gold Experience' },
    ],
  },
  {
    id: '3',
    word: 'perspective',
    meaning: '視点・観点',
    phonetic: 'pəˈspek.tɪv',
    sentences: [
      { id: '3-1', english: 'Try to see things from a different perspective.', japanese: '物事を別の視点から見てみよう。', category: '思考・考え方' },
      { id: '3-2', english: 'Travel broadens your perspective on the world.', japanese: '旅行すると世界に対する視野が広がる。', category: '旅行・文化' },
      { id: '3-3', english: 'Keep things in perspective — it\'s not the end of the world.', japanese: 'バランスを保って — 世界の終わりじゃない。', category: 'アドバイス' },
    ],
  },
  {
    id: '4',
    word: 'accomplish',
    meaning: '達成する・成し遂げる',
    phonetic: 'əˈkʌm.plɪʃ',
    sentences: [
      { id: '4-1', english: 'She accomplished her goal of running a marathon.', japanese: '彼女はマラソンを走るという目標を達成した。', category: '目標・達成' },
      { id: '4-2', english: 'What do you hope to accomplish this year?', japanese: '今年は何を達成したいですか？', category: '目標・達成' },
      { id: '4-3', english: 'Hard work and dedication will help you accomplish anything.', japanese: '努力と献身があればなんでも達成できる。', category: '励まし・モチベーション' },
    ],
  },
  {
    id: '5',
    word: 'remarkable',
    meaning: '注目すべき・素晴らしい',
    phonetic: 'rɪˈmɑːk.ə.bəl',
    sentences: [
      { id: '5-1', english: 'The patient made a remarkable recovery.', japanese: '患者は驚くべき回復を見せた。', category: '医療・健康' },
      { id: '5-2', english: 'It\'s remarkable how quickly children learn languages.', japanese: '子どもたちが言語を覚える早さは驚くほどだ。', category: '教育・子ども' },
      { id: '5-3', english: 'She gave a remarkable performance on stage.', japanese: '彼女は舞台で素晴らしい演技を見せた。', category: '芸術・エンターテインメント' },
    ],
  },
  {
    id: '6',
    word: 'challenge',
    meaning: '挑戦・困難',
    phonetic: 'ˈtʃæl.ɪndʒ',
    sentences: [
      { id: '6-1', english: 'Learning a new language is a challenging but rewarding experience.', japanese: '新しい言語を学ぶのは難しいが、やりがいのある体験だ。', category: '学習' },
      { id: '6-2', english: 'I love a good challenge.', japanese: '良い挑戦は大好きだ。', category: '前向きな姿勢' },
      { id: '6-3', english: 'The team faced many challenges during the project.', japanese: 'チームはプロジェクト中に多くの困難に直面した。', category: 'ビジネス' },
    ],
  },
  {
    id: '7',
    word: 'opportunity',
    meaning: '機会・チャンス',
    phonetic: 'ˌɒp.əˈtjuː.nɪ.ti',
    sentences: [
      { id: '7-1', english: 'Don\'t miss this opportunity — it won\'t come again.', japanese: 'このチャンスを逃すな — 二度と来ないかもしれない。', category: 'アドバイス' },
      { id: '7-2', english: 'Studying abroad is a great opportunity to grow.', japanese: '留学は成長する素晴らしい機会だ。', category: '留学・教育' },
      { id: '7-3', english: 'Every challenge is an opportunity in disguise.', japanese: 'すべての困難は変装した機会だ。', category: '人生の教訓' },
    ],
  },
]
