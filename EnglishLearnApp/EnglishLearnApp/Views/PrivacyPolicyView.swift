import SwiftUI

struct PrivacyPolicyView: View {
    @State private var isJapanese = true

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {

                Picker("", selection: $isJapanese) {
                    Text("日本語").tag(true)
                    Text("English").tag(false)
                }
                .pickerStyle(.segmented)
                .padding(.bottom, 4)

                if isJapanese {
                    japaneseContent
                } else {
                    englishContent
                }
            }
            .padding(20)
        }
        .navigationTitle(isJapanese ? "プライバシーポリシー" : "Privacy Policy")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Japanese

    private var japaneseContent: some View {
        VStack(alignment: .leading, spacing: 24) {
            policyText("最終更新日：2026年2月")

            section("1. 概要") {
                policyText(
                    "ボカブラ（vocabulary 以下「本アプリ」）は個人向けの英語学習アプリです。" +
                    "開発者は外部サーバーで個人データを収集・送信・保存しません。" +
                    "すべてのデータはお客様のデバイス上にのみ保存されます。"
                )
            }

            section("2. デバイス内に保存されるデータ") {
                bulletItem("単語リスト", "登録した単語・意味・発音記号・例文はデバイスのDocumentsディレクトリ（words.json）にローカル保存されます。")
                bulletItem("OpenAI APIキー", "UserDefaultsにデバイス内のみで保存されます。開発者のサーバーには一切送信されません。")
                bulletItem("アプリ設定", "音声設定・AIモデル選択などの設定はUserDefaultsにデバイス内のみで保存されます。")
            }

            section("3. サードパーティサービス") {
                bulletItem("OpenAI API", "例文生成機能を使用すると、入力した単語がお客様自身のAPIキーを使ってデバイスから直接OpenAIに送信されます。開発者はこの通信にアクセスできません。詳細はOpenAIのプライバシーポリシーをご参照ください。")
                bulletItem("AWS / VOICEVOX", "ずんだもん音声機能を使用すると、テキストがデバイスからお客様自身のAWSエンドポイントに直接送信されます。開発者はこの通信にアクセスできません。")
            }

            section("4. マイク・音声認識") {
                policyText(
                    "本アプリは発音練習機能のためにマイクと音声認識の権限を要求します。" +
                    "音声はAppleのSpeechフレームワークによりデバイス上で処理され、いかなるサーバーにもアップロードされません。"
                )
            }

            section("5. アナリティクス・クラッシュレポート") {
                policyText("本アプリはアナリティクスSDKやクラッシュレポートサービスを使用していません。開発者による利用データの収集は一切行いません。")
            }

            section("6. 子どものプライバシー") {
                policyText("本アプリはデータを一切収集しないため、13歳未満のお子様の個人情報が収集されることはありません。")
            }

            section("7. ポリシーの変更") {
                policyText("本ポリシーは随時更新される場合があります。更新版はアプリ内およびApp Storeのアプリ紹介ページでご確認いただけます。")
            }

            section("8. お問い合わせ") {
                policyText("本ポリシーに関するご質問は以下からお問い合わせください：\nhttps://github.com/KazusaNakagawa/english_learn_app/issues")
            }
        }
    }

    // MARK: - English

    private var englishContent: some View {
        VStack(alignment: .leading, spacing: 24) {
            policyText("Last updated: February 2026")

            section("1. Overview") {
                policyText(
                    "ボカブラ (a play on \"vocabulary\", hereinafter \"the App\") is a personal vocabulary learning application. " +
                    "The developer does not collect, transmit, or store any personal data on external servers. " +
                    "All data remains on your device unless you explicitly share it."
                )
            }

            section("2. Data Stored on Your Device") {
                bulletItem("Word list", "Words, meanings, phonetics, and example sentences you register are stored locally in the app's Documents directory (words.json).")
                bulletItem("OpenAI API Key", "Stored in UserDefaults on your device only. It is never transmitted to the developer's servers.")
                bulletItem("App preferences", "Voice settings, AI model selection, and other preferences are stored in UserDefaults on your device.")
            }

            section("3. Third-Party Services") {
                bulletItem("OpenAI API", "When you use the sentence generation feature, the word you enter is sent directly from your device to OpenAI using your own API key. The developer has no access to this communication. Please refer to OpenAI's Privacy Policy for details.")
                bulletItem("AWS / VOICEVOX", "When you use the Zundamon voice feature, text is sent from your device to your own AWS endpoint. The developer has no access to this communication.")
            }

            section("4. Microphone & Speech Recognition") {
                policyText(
                    "The App requests microphone and speech recognition permissions solely for the pronunciation practice feature. " +
                    "Audio is processed on-device using Apple's Speech framework and is not uploaded to any server."
                )
            }

            section("5. Analytics & Crash Reporting") {
                policyText("The App does not use any analytics SDK or crash reporting service. No usage data is collected by the developer.")
            }

            section("6. Children's Privacy") {
                policyText("Since no data is collected at all, the App does not collect personal information from children under 13.")
            }

            section("7. Changes to This Policy") {
                policyText("This Privacy Policy may be updated from time to time. The updated version will be available within the App and on the App Store listing.")
            }

            section("8. Contact") {
                policyText("For questions about this Privacy Policy, please open an issue at:\nhttps://github.com/KazusaNakagawa/english_learn_app/issues")
            }
        }
    }

    // MARK: - Helpers

    private func section(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headline)
            content()
        }
    }

    private func bulletItem(_ heading: String, _ body: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("• \(heading)")
                .font(.subheadline).bold()
            Text(body)
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
    }

    private func policyText(_ text: String) -> some View {
        Text(text)
            .font(.subheadline)
            .foregroundColor(.secondary)
            .fixedSize(horizontal: false, vertical: true)
    }
}

#Preview {
    NavigationStack {
        PrivacyPolicyView()
    }
}
