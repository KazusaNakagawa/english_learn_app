import SwiftUI

enum OnboardingStep {
    case welcome
    case apiKey
}

struct OnboardingView: View {
    @Binding var hasCompletedOnboarding: Bool
    @EnvironmentObject private var settings: SettingsManager

    @State private var step: OnboardingStep = .welcome
    @State private var apiKeyInput: String = ""

    var body: some View {
        NavigationStack {
            switch step {
            case .welcome:
                WelcomeStepView(onAgree: { step = .apiKey })
            case .apiKey:
                APIKeyStepView(
                    apiKeyInput: $apiKeyInput,
                    onRegister: {
                        settings.openAIAPIKey = apiKeyInput.isEmpty ? nil : apiKeyInput
                        hasCompletedOnboarding = true
                    },
                    onSkip: {
                        hasCompletedOnboarding = true
                    }
                )
            }
        }
    }
}

// MARK: - Step 1: Welcome

private struct WelcomeStepView: View {
    let onAgree: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 24) {
                Image(systemName: "text.book.closed.fill")
                    .font(.system(size: 72))
                    .foregroundColor(.blue)

                VStack(spacing: 8) {
                    Text("WordCraft へようこそ")
                        .font(.largeTitle)
                        .fontWeight(.bold)

                    Text("AIを活用した英語学習アプリです。\n単語を登録すると例文を自動生成し、\n発音練習もサポートします。")
                        .font(.body)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            Spacer()

            VStack(spacing: 16) {
                VStack(spacing: 4) {
                    Text("続行することで以下に同意したものとみなします")
                        .font(.footnote)
                        .foregroundColor(.secondary)

                    HStack(spacing: 4) {
                        NavigationLink(destination: PrivacyPolicyView()) {
                            Text("プライバシーポリシー")
                                .font(.footnote)
                                .underline()
                        }
                        Text("と")
                            .font(.footnote)
                            .foregroundColor(.secondary)
                        NavigationLink(destination: TermsOfServiceView()) {
                            Text("利用規約")
                                .font(.footnote)
                                .underline()
                        }
                    }
                }

                Button(action: onAgree) {
                    Text("同意して次へ")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 40)
        }
        .navigationBarHidden(true)
    }
}

// MARK: - Step 2: API Key

private struct APIKeyStepView: View {
    @Binding var apiKeyInput: String
    let onRegister: () -> Void
    let onSkip: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 24) {
                Image(systemName: "key.fill")
                    .font(.system(size: 72))
                    .foregroundColor(.orange)

                VStack(spacing: 8) {
                    Text("OpenAI API キーの設定")
                        .font(.largeTitle)
                        .fontWeight(.bold)

                    Text("APIキーを登録すると、単語追加時に\n例文を自動生成できます。\n後から設定画面でも変更できます。")
                        .font(.body)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            Spacer()

            VStack(spacing: 16) {
                SecureField("sk-...", text: $apiKeyInput)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding()
                    .background(Color(.systemGray6))
                    .cornerRadius(10)

                Button(action: onRegister) {
                    Text("登録して始める")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(apiKeyInput.isEmpty ? Color.gray.opacity(0.3) : Color.blue)
                        .foregroundColor(apiKeyInput.isEmpty ? Color.secondary : .white)
                        .cornerRadius(12)
                }
                .disabled(apiKeyInput.isEmpty)

                Button(action: onSkip) {
                    Text("スキップ")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 40)
        }
        .navigationBarHidden(true)
    }
}

#Preview {
    OnboardingView(hasCompletedOnboarding: .constant(false))
        .environmentObject(SettingsManager.shared)
}
