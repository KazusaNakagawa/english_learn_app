import SwiftUI

/// A dedicated screen for managing prompt presets.
///
/// Shows all presets (built-in + custom) in a list.
/// - Tap a row to set it as the active preset.
/// - Swipe trailing "編集" to edit; "削除" to delete (custom only).
/// - "+" toolbar button adds a new custom preset.
/// - Export toolbar button shares all presets as a Markdown file.
struct PromptPresetsView: View {
    @EnvironmentObject private var settings: SettingsManager

    @State private var navigationTarget: PresetEditTarget? = nil
    @State private var deletingPresetID: UUID? = nil
    @State private var showDeleteAlert = false
    @State private var showShareSheet = false
    @State private var exportURL: URL? = nil

    var body: some View {
        List {
            ForEach(settings.allPresets) { preset in
                presetRow(preset)
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        if !preset.isBuiltIn {
                            Button(role: .destructive) {
                                deletingPresetID = preset.id
                                showDeleteAlert = true
                            } label: {
                                Label("削除", systemImage: "trash")
                            }
                        }
                        Button {
                            navigationTarget = .edit(preset)
                        } label: {
                            Label("編集", systemImage: "pencil")
                        }
                        .tint(.orange)
                    }
            }
        }
        .navigationTitle("例文生成の条件")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                HStack(spacing: 16) {
                    Button {
                        exportURL = makeExportFile()
                        showShareSheet = true
                    } label: {
                        Image(systemName: "square.and.arrow.up")
                    }
                    if settings.allPresets.count < SettingsManager.maxPresets {
                        Button {
                            navigationTarget = .new()
                        } label: {
                            Image(systemName: "plus")
                        }
                    }
                }
            }
        }
        .navigationDestination(item: $navigationTarget) { target in
            PresetEditView(target: target)
        }
        .background(
            Group {
                if let url = exportURL {
                    ActivityPresenter(url: url, isPresented: $showShareSheet)
                }
            }
        )
        .alert("プリセットを削除", isPresented: $showDeleteAlert) {
            Button("削除", role: .destructive) {
                if let id = deletingPresetID {
                    settings.deletePreset(id: id)
                }
                deletingPresetID = nil
            }
            Button("キャンセル", role: .cancel) {
                deletingPresetID = nil
            }
        } message: {
            Text("このプリセットを削除しますか？この操作は元に戻せません。")
        }
    }

    /// Writes the Markdown export to a temp file and returns its URL, or nil on failure.
    private func makeExportFile() -> URL? {
        let content = settings.exportMarkdown
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("prompt_presets")
            .appendingPathExtension("md")
        do {
            try content.write(to: url, atomically: true, encoding: .utf8)
            return url
        } catch {
            return nil
        }
    }

    /// Renders a single preset row showing name, built-in badge, modified badge, and conditions text.
    /// Tapping the row sets the preset as active.
    @ViewBuilder
    private func presetRow(_ preset: PromptPreset) -> some View {
        Button {
            settings.activePresetID = preset.id
        } label: {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(preset.name)
                            .font(.body)
                            .foregroundColor(.primary)
                        if preset.isBuiltIn {
                            Text("組み込み")
                                .font(.caption2)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(Color.secondary.opacity(0.15))
                                .foregroundColor(.secondary)
                                .cornerRadius(4)
                        }
                        if preset.isBuiltIn && settings.isPresetModified(id: preset.id) {
                            Text("変更済み")
                                .font(.caption2)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(Color.orange.opacity(0.15))
                                .foregroundColor(.orange)
                                .cornerRadius(4)
                        }
                    }
                    Text(preset.conditions)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .lineLimit(2)
                }
                Spacer()
                if settings.activePresetID == preset.id {
                    Image(systemName: "checkmark")
                        .foregroundColor(.accentColor)
                        .font(.body.weight(.semibold))
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Navigation target wrapper

/// Wraps the preset being navigated to, distinguishing new-add from edit.
private struct PresetEditTarget: Identifiable, Hashable {
    let id: UUID
    let preset: PromptPreset?

    func hash(into hasher: inout Hasher) { hasher.combine(id) }
    static func == (lhs: PresetEditTarget, rhs: PresetEditTarget) -> Bool { lhs.id == rhs.id }

    static func new() -> PresetEditTarget {
        PresetEditTarget(id: UUID(), preset: nil)
    }

    static func edit(_ preset: PromptPreset) -> PresetEditTarget {
        PresetEditTarget(id: preset.id, preset: preset)
    }
}

// MARK: - Preset Edit View

/// A form for creating or editing a prompt preset.
///
/// - For built-in presets: name is read-only; a "デフォルトに戻す" reset button is shown.
/// - For custom presets: both name and conditions are editable.
private struct PresetEditView: View {
    @EnvironmentObject private var settings: SettingsManager
    @Environment(\.dismiss) private var dismiss

    let target: PresetEditTarget

    @State private var name: String
    @State private var conditions: String
    @State private var showResetAlert = false

    /// `true` when the target preset is a built-in (non-deletable, name is read-only).
    private var isBuiltIn: Bool { target.preset?.isBuiltIn == true }

    /// Whether conditions have drifted from the hardcoded original.
    private var isAtDefault: Bool {
        guard let preset = target.preset, preset.isBuiltIn else { return false }
        let original = PromptPreset.builtIns.first { $0.id == preset.id }?.conditions ?? ""
        return conditions == original
    }

    init(target: PresetEditTarget) {
        self.target = target
        _name = State(initialValue: target.preset?.name ?? "")
        _conditions = State(initialValue: target.preset?.conditions ?? "")
    }

    var body: some View {
        Form {
            Section(header: Text("プリセット名")) {
                if isBuiltIn {
                    // Built-in names are fixed; show as read-only label
                    LabeledContent("名前", value: name)
                } else {
                    TextField("名前", text: $name)
                }
            }

            Section(header: Text("条件")) {
                TextEditor(text: $conditions)
                    .frame(minHeight: 200)
                    .font(.subheadline)
            }

            if isBuiltIn {
                Section {
                    Button(role: .destructive) {
                        showResetAlert = true
                    } label: {
                        HStack {
                            Image(systemName: "arrow.counterclockwise")
                            Text("デフォルトに戻す")
                        }
                    }
                    .disabled(isAtDefault)
                }
            }
        }
        .navigationTitle(target.preset == nil ? "新しいプリセット" : "プリセットを編集")
        .navigationBarTitleDisplayMode(.inline)
        .scrollDismissesKeyboard(.interactively)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("保存") {
                    save()
                    dismiss()
                }
                .disabled(isSaveDisabled)
            }
        }
        .alert("デフォルトに戻す", isPresented: $showResetAlert) {
            Button("リセット", role: .destructive) {
                if let preset = target.preset {
                    settings.resetPreset(id: preset.id)
                    if let original = PromptPreset.builtIns.first(where: { $0.id == preset.id }) {
                        conditions = original.conditions
                    }
                }
            }
            Button("キャンセル", role: .cancel) {}
        } message: {
            Text("このプリセットの条件をデフォルトの内容に戻します。よろしいですか？")
        }
    }

    /// `true` when the Save button should be disabled.
    /// Disabled when conditions are blank, or when the preset is custom and name is blank.
    private var isSaveDisabled: Bool {
        conditions.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
        (!isBuiltIn && name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    /// Persists the edited or newly created preset via `SettingsManager`.
    private func save() {
        if let existingPreset = target.preset {
            let updatedName = isBuiltIn ? existingPreset.name : name
            let updated = PromptPreset(
                id: existingPreset.id,
                name: updatedName,
                conditions: conditions,
                isBuiltIn: existingPreset.isBuiltIn
            )
            settings.updatePreset(updated)
        } else {
            let newPreset = PromptPreset(name: name, conditions: conditions, isBuiltIn: false)
            settings.addPreset(newPreset)
        }
    }
}

// MARK: - Activity Presenter (UIActivityViewController via UIKit present)

/// Presents UIActivityViewController by calling `present()` on a transparent UIViewController.
/// Using `.sheet()` to host UIActivityViewController causes a black screen; this avoids that.
private struct ActivityPresenter: UIViewControllerRepresentable {
    let url: URL
    @Binding var isPresented: Bool

    func makeUIViewController(context: Context) -> UIViewController {
        UIViewController()
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {
        guard isPresented, uiViewController.presentedViewController == nil else { return }
        let vc = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        vc.completionWithItemsHandler = { _, _, _, _ in
            isPresented = false
        }
        uiViewController.present(vc, animated: true)
    }
}

#Preview {
    NavigationStack {
        PromptPresetsView()
            .environmentObject(SettingsManager.shared)
    }
}
