import SwiftUI

struct TabBar: View {
    @Binding var selected: Tab
    @Binding var presentingAdd: Bool

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Tab.allCases) { tab in
                if tab == .add {
                    addButton
                } else {
                    tabButton(tab)
                }
            }
        }
        .frame(height: 56)
        .background(.ultraThinMaterial)
        .overlay(
            Rectangle()
                .frame(height: 0.5)
                .foregroundStyle(Color(uiColor: .separator)),
            alignment: .top
        )
    }

    private func tabButton(_ tab: Tab) -> some View {
        Button {
            withAnimation(.easeOut(duration: 0.15)) { selected = tab }
        } label: {
            VStack(spacing: 2) {
                ZStack {
                    if selected == tab {
                        RoundedRectangle(cornerRadius: 10)
                            .fill(Color.accentColor.opacity(0.18))
                            .frame(width: 44, height: 28)
                    }
                    Image(systemName: tab.icon)
                        .font(.system(size: 22))
                }
                Text(tab.label)
                    .font(.system(size: 10, weight: .semibold))
            }
            .foregroundStyle(selected == tab ? Color.accentColor : Color.secondary)
            .frame(maxWidth: .infinity)
        }
        .accessibilityLabel(tab.label)
        .accessibilityAddTraits(selected == tab ? .isSelected : [])
    }

    private var addButton: some View {
        Button {
            presentingAdd = true
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: 14)
                    .fill(Color.accentColor)
                    .frame(width: 44, height: 28)
                Image(systemName: Tab.add.icon)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.white)
            }
            .frame(maxWidth: .infinity)
        }
        .accessibilityLabel(Tab.add.label)
    }
}

#Preview {
    @Previewable @State var selected: Tab = .learn
    @Previewable @State var presentingAdd = false
    VStack {
        Spacer()
        TabBar(selected: $selected, presentingAdd: $presentingAdd)
    }
}
