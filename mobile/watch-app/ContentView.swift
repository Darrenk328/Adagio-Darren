import SwiftUI

struct ContentView: View {
    @StateObject private var manager = WorkoutMirroringManager()

    var body: some View {
        VStack(spacing: 12) {
            Text("Adagio")
                .font(.headline)

            Text(manager.isActive ? "Mirroring to iPhone" : "Not tracking")
                .font(.footnote)
                .foregroundStyle(.secondary)

            if let errorMessage = manager.errorMessage {
                Text(errorMessage)
                    .font(.caption2)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }

            Button(manager.isActive ? "Stop" : "Start") {
                if manager.isActive {
                    manager.stop()
                } else {
                    Task { await manager.start() }
                }
            }
            .tint(manager.isActive ? .red : .green)
        }
        .padding()
        .task {
            await manager.requestAuthorization()
        }
    }
}

#Preview {
    ContentView()
}
