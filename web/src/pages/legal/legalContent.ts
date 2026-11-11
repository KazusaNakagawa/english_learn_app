/**
 * Text of the privacy policy and terms of service, in Japanese and English.
 * Follows the iOS PrivacyPolicyView / TermsOfServiceView, rewritten for what
 * the web app actually does: data stays in the browser, there is no
 * microphone use, and voices may come from the browser or a VOICEVOX endpoint.
 */

export type Lang = 'ja' | 'en'

export interface LegalItem {
  heading: string
  body: string
}

export interface LegalSection {
  title: string
  /** Paragraphs; a URL on its own line is rendered as a link. */
  text?: string
  items?: LegalItem[]
}

export interface LegalDocument {
  title: string
  updated: string
  sections: LegalSection[]
}

const CONTACT_URL = 'https://github.com/KazusaNakagawa/english_learn_app/issues'

export const PRIVACY_POLICY: Record<Lang, LegalDocument> = {
  ja: {
    title: 'プライバシーポリシー',
    updated: '最終更新日：2026年11月',
    sections: [
      {
        title: '1. 概要',
        text:
          'English Learn App の Web 版（以下「本アプリ」）は個人向けの英語学習アプリです。' +
          '開発者はサーバーで個人データを収集・保存しません。登録したデータはお使いのブラウザ内にのみ保存されます。',
      },
      {
        title: '2. ブラウザ内に保存されるデータ',
        items: [
          {
            heading: '単語リスト',
            body:
              '登録した単語・意味・発音記号・例文はブラウザの IndexedDB に保存されます。' +
              '保存先はブラウザとアドレス（ポート番号を含む）ごとに分かれます。',
          },
          {
            heading: 'API キー',
            body:
              'OpenAI と VOICEVOX の API キーはブラウザの sessionStorage に保存され、タブを閉じると消えます。' +
              '開発者のサーバーには送信されません。',
          },
          { heading: 'アプリ設定', body: '音声設定・AI モデルの選択などの設定はブラウザの localStorage に保存されます。' },
          {
            heading: '音声キャッシュ',
            body: 'VOICEVOX で合成した音声は、再生を速くするため IndexedDB に保存されます。設定の「キャッシュをクリア」で削除できます。',
          },
        ],
      },
      {
        title: '3. サードパーティサービス',
        items: [
          {
            heading: 'OpenAI API',
            body:
              '例文生成機能を使用すると、入力した単語がお客様自身の API キーを使ってブラウザから直接 OpenAI に送信されます。' +
              '開発者はこの通信にアクセスできません。詳細は OpenAI のプライバシーポリシーをご参照ください。',
          },
          {
            heading: 'VOICEVOX',
            body:
              'ずんだもん音声を使用すると、読み上げるテキストがブラウザから設定した VOICEVOX のエンドポイント' +
              '（未設定の場合はアプリに組み込まれた既定のエンドポイント）に直接送信されます。テキストはそのエンドポイントの運営者が受け取ります。',
          },
          {
            heading: 'ブラウザの音声',
            body:
              '「デフォルト」などの音声は OS やブラウザが提供します。ブラウザによってはオンライン音声を使い、' +
              '読み上げるテキストがブラウザ提供元のサーバーに送信される場合があります。',
          },
        ],
      },
      { title: '4. マイク', text: '本アプリはマイクを使用しません。' },
      {
        title: '5. アナリティクス・クラッシュレポート',
        text: '本アプリはアナリティクスやクラッシュレポートのサービスを使用していません。開発者による利用データの収集は一切行いません。',
      },
      {
        title: '6. 子どものプライバシー',
        text: '開発者はデータを一切収集しないため、13歳未満のお子様の個人情報が収集されることはありません。',
      },
      { title: '7. ポリシーの変更', text: '本ポリシーは随時更新される場合があります。更新版はアプリ内でご確認いただけます。' },
      { title: '8. お問い合わせ', text: `本ポリシーに関するご質問は以下からお問い合わせください：\n${CONTACT_URL}` },
    ],
  },
  en: {
    title: 'Privacy Policy',
    updated: 'Last updated: November 2026',
    sections: [
      {
        title: '1. Overview',
        text:
          'The web version of English Learn App (hereinafter "the App") is a personal vocabulary learning application. ' +
          'The developer does not collect or store any personal data on a server. The data you register stays in your browser.',
      },
      {
        title: '2. Data Stored in Your Browser',
        items: [
          {
            heading: 'Word list',
            body:
              'Words, meanings, phonetics, and example sentences you register are stored in your browser\'s IndexedDB. ' +
              'Each browser and address (including the port number) has its own storage.',
          },
          {
            heading: 'API keys',
            body:
              'Your OpenAI and VOICEVOX API keys are stored in your browser\'s sessionStorage and are cleared when you close the tab. ' +
              'They are never transmitted to the developer\'s servers.',
          },
          { heading: 'App preferences', body: 'Voice settings, AI model selection, and other preferences are stored in your browser\'s localStorage.' },
          {
            heading: 'Audio cache',
            body: 'Audio synthesized by VOICEVOX is stored in IndexedDB to speed up playback. "キャッシュをクリア" in Settings deletes it.',
          },
        ],
      },
      {
        title: '3. Third-Party Services',
        items: [
          {
            heading: 'OpenAI API',
            body:
              'When you use the sentence generation feature, the word you enter is sent directly from your browser to OpenAI using your own API key. ' +
              'The developer has no access to this communication. Please refer to OpenAI\'s Privacy Policy for details.',
          },
          {
            heading: 'VOICEVOX',
            body:
              'When you use the Zundamon voice, the text to be read is sent directly from your browser to the VOICEVOX endpoint you set ' +
              '(or, if none is set, the default endpoint built into the App). The operator of that endpoint receives the text.',
          },
          {
            heading: 'Browser voices',
            body:
              'Voices such as "デフォルト" are provided by your OS or browser. Some browsers use online voices, ' +
              'in which case the text to be read may be sent to the browser vendor\'s servers.',
          },
        ],
      },
      { title: '4. Microphone', text: 'The App does not use the microphone.' },
      {
        title: '5. Analytics & Crash Reporting',
        text: 'The App does not use any analytics or crash reporting service. No usage data is collected by the developer.',
      },
      {
        title: '6. Children\'s Privacy',
        text: 'Since the developer collects no data at all, the App does not collect personal information from children under 13.',
      },
      { title: '7. Changes to This Policy', text: 'This Privacy Policy may be updated from time to time. The updated version will be available within the App.' },
      { title: '8. Contact', text: `For questions about this Privacy Policy, please open an issue at:\n${CONTACT_URL}` },
    ],
  },
}

export const TERMS_OF_SERVICE: Record<Lang, LegalDocument> = {
  ja: {
    title: '利用規約',
    updated: '最終更新日：2026年11月',
    sections: [
      {
        title: '1. 同意',
        text: 'English Learn App の Web 版（以下「本アプリ」）を使用することにより、本利用規約に同意したものとみなします。同意しない場合は本アプリをご使用にならないでください。',
      },
      {
        title: '2. サービスの説明',
        text: '本アプリは英単語の登録・発音練習・AI 例文生成を行う個人向け語学学習ツールです。AI 機能はお客様自身の API 認証情報を使用するサードパーティサービスを介して提供されます。',
      },
      {
        title: '3. ユーザーの責任',
        items: [
          {
            heading: 'API キー',
            body: 'OpenAI や VOICEVOX の API キーの取得・管理・セキュリティ確保はお客様の責任となります。API キーの使用により発生した費用はお客様の負担となります。',
          },
          { heading: '登録コンテンツ', body: '本アプリに登録する単語・例文に関する責任はお客様が負います。' },
          { heading: '適切な使用', body: '違法な目的や他者への損害を与えるような方法での使用を禁止します。' },
        ],
      },
      {
        title: '4. AI 生成コンテンツの免責',
        text: 'AI が生成する例文は学習目的のみで提供されます。開発者は AI 生成コンテンツの正確性・適切性・完全性について一切の保証を行いません。重要な語学表現は権威ある情報源で確認してください。',
      },
      {
        title: '5. サードパーティサービス',
        text:
          '本アプリは OpenAI および VOICEVOX と連携します。これらのサービスの利用は、それぞれの利用規約（VOICEVOX の場合は各音声ライブラリの規約を含む）に従います。' +
          '開発者は OpenAI および VOICEVOX とは無関係であり、公式に承認されたものではありません。',
      },
      {
        title: '6. 保証の否認',
        text: '本アプリは「現状のまま」「提供可能な状態で」提供され、商品性・特定目的への適合性・非侵害性を含む明示または黙示の保証を一切行いません。',
      },
      {
        title: '7. 責任の制限',
        text: '適用法令が許す最大限の範囲において、開発者は本アプリの使用または使用不能から生じる間接的・付随的・特別・結果的または懲罰的損害について一切の責任を負いません。',
      },
      {
        title: '8. 規約の変更',
        text: '本規約は随時更新される場合があります。変更後も引き続き本アプリを使用した場合、改訂された規約に同意したものとみなします。更新版はアプリ内でご確認いただけます。',
      },
      { title: '9. お問い合わせ', text: `本規約に関するご質問は以下からお問い合わせください：\n${CONTACT_URL}` },
    ],
  },
  en: {
    title: 'Terms of Service',
    updated: 'Last updated: November 2026',
    sections: [
      {
        title: '1. Acceptance of Terms',
        text: 'By using the web version of English Learn App (hereinafter "the App"), you agree to be bound by these Terms of Service. If you do not agree, please do not use the App.',
      },
      {
        title: '2. Description of Service',
        text: 'The App is a personal vocabulary learning tool that allows you to register English words, practice pronunciation, and generate example sentences using third-party AI services via your own API credentials.',
      },
      {
        title: '3. User Responsibilities',
        items: [
          {
            heading: 'API Keys',
            body: 'You are solely responsible for obtaining, managing, and securing your own OpenAI and VOICEVOX API keys. Any costs incurred through your API key usage are your responsibility.',
          },
          { heading: 'Content', body: 'You are responsible for the words and sentences you register in the App.' },
          { heading: 'Acceptable Use', body: 'You agree not to use the App for any unlawful purpose or in any way that could harm others.' },
        ],
      },
      {
        title: '4. AI-Generated Content Disclaimer',
        text: 'Example sentences generated by the AI are provided for educational purposes only. The developer makes no warranty regarding the accuracy, appropriateness, or completeness of AI-generated content. Always verify important language usage with authoritative sources.',
      },
      {
        title: '5. Third-Party Services',
        text:
          'The App integrates with OpenAI and VOICEVOX. Your use of those services is governed by their respective terms (for VOICEVOX, including the terms of each voice library). ' +
          'The developer is not affiliated with or endorsed by OpenAI or VOICEVOX.',
      },
      {
        title: '6. Disclaimer of Warranties',
        text: 'The App is provided "as is" and "as available" without warranty of any kind, either express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement.',
      },
      {
        title: '7. Limitation of Liability',
        text: 'To the maximum extent permitted by applicable law, the developer shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of or inability to use the App.',
      },
      {
        title: '8. Changes to Terms',
        text: 'These Terms may be updated from time to time. Continued use of the App after changes constitutes acceptance of the revised terms. The updated version will be available within the App.',
      },
      { title: '9. Contact', text: `For questions regarding these Terms, please open an issue at:\n${CONTACT_URL}` },
    ],
  },
}
