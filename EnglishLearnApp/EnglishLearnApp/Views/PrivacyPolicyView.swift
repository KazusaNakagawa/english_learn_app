import SwiftUI

struct PrivacyPolicyView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {

                Group {
                    policyText("Last updated: February 2026")
                        .foregroundColor(.secondary)

                    section("1. Overview") {
                        policyText(
                            "EnglishLearnApp (\"the App\") is a personal vocabulary learning application. " +
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
                }

                Group {
                    section("5. Analytics & Crash Reporting") {
                        policyText(
                            "The App does not use any analytics SDK or crash reporting service. " +
                            "No usage data is collected by the developer."
                        )
                    }

                    section("6. Children's Privacy") {
                        policyText(
                            "The App does not knowingly collect personal information from children under 13. " +
                            "Since no data is collected at all, the App is safe for all ages in this regard."
                        )
                    }

                    section("7. Changes to This Policy") {
                        policyText(
                            "This Privacy Policy may be updated from time to time. " +
                            "The updated version will be available within the App and on the App Store listing."
                        )
                    }

                    section("8. Contact") {
                        policyText(
                            "If you have questions about this Privacy Policy, please open an issue at:\n" +
                            "https://github.com/KazusaNakagawa/english_learn_app/issues"
                        )
                    }
                }
            }
            .padding(20)
        }
        .navigationTitle("Privacy Policy")
        .navigationBarTitleDisplayMode(.inline)
    }

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
