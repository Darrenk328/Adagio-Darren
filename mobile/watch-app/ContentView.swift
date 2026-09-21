import SwiftUI

struct ContentView: View {
    @StateObject private var manager = WorkoutMirroringManager()

    var body: some View {
        VStack(spacing: 8) {
            Text("Adagio")
                .font(.headline)

            Text(manager.isActive ? "Mirroring to iPhone" : "Not tracking")
                .font(.footnote)
                .foregroundStyle(manager.isActive ? .green : .secondary)

            // Local readout so "is the Watch collecting steps?" and "is it
            // reaching the phone?" can be told apart: numbers here but not
            // on the phone means the send path; no numbers here at all
            // means step collection itself.
            HStack(spacing: 16) {
                VStack {
                    Text(manager.cadence.map(String.init) ?? "—")
                        .font(.title2.monospacedDigit().bold())
                    Text("spm").font(.caption2).foregroundStyle(.secondary)
                }
                VStack {
                    Text(manager.totalSteps.map(String.init) ?? "—")
                        .font(.title2.monospacedDigit().bold())
                    Text("steps").font(.caption2).foregroundStyle(.secondary)
                }
            }

            if let error = manager.errorMessage ?? manager.lastSendError {
                Text(error)
                    .font(.caption2)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
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
        .padding(.horizontal)
        .task {
            await manager.requestAuthorization()
        }
    }
}

#Preview {
    ContentView()
}
