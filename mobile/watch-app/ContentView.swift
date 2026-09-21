import SwiftUI

struct ContentView: View {
    @StateObject private var manager = WorkoutMirroringManager()

    // MARK: Cadence delta (third column)

    private var deltaText: String {
        guard let delta = manager.cadenceDelta else { return "—" }
        return delta > 0 ? "+\(delta)" : "\(delta)"
    }

    private var deltaLabel: String {
        guard let onPace = manager.isOnPace else {
            return manager.targetCadence == nil ? "no target" : "vs target"
        }
        return onPace ? "on pace" : "off pace"
    }

    private var deltaColor: Color {
        switch manager.isOnPace {
        case .some(true): return .green
        case .some(false): return .red
        case .none: return .primary
        }
    }

    // MARK: Pace line — always in the unit the runner chose on the phone

    private var unitSuffix: String { "/\(manager.paceUnit)" }

    private var paceText: String {
        manager.paceSeconds.map(WorkoutMirroringManager.formatPace) ?? "—:—"
    }

    /// e.g. "+0:42" when 42 s/mi slower than the target pace they typed.
    private var paceDeltaText: String? {
        guard let d = manager.paceDeltaSeconds else { return nil }
        let sign = d > 0 ? "+" : (d < 0 ? "−" : "")
        return sign + WorkoutMirroringManager.formatPace(abs(d))
    }

    private var paceDeltaColor: Color {
        guard let d = manager.paceDeltaSeconds else { return .secondary }
        // Same tolerance idea as cadence: within 15 s/unit of target = on pace.
        return abs(d) <= 15 ? .green : .red
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                Text("Adagio").font(.headline)

                Text(manager.isActive ? "Mirroring to iPhone" : "Not tracking")
                    .font(.footnote)
                    .foregroundStyle(manager.isActive ? .green : .secondary)

                // spm / steps / off-pace. Steps stays visible on purpose — it
                // answers "is the Watch collecting at all?" independently of
                // whether anything reaches the phone.
                HStack(spacing: 10) {
                    stat(manager.cadence.map(String.init) ?? "—", "spm")
                    stat(manager.totalSteps.map(String.init) ?? "—", "steps")
                    stat(deltaText, deltaLabel, color: deltaColor)
                }

                // Pace in the runner's unit. When they set the workout up
                // "By pace", also show their target and how far off it they are.
                VStack(spacing: 1) {
                    HStack(spacing: 4) {
                        Text(paceText).font(.title3.monospacedDigit().bold())
                        Text(unitSuffix).font(.caption).foregroundStyle(.secondary)
                    }
                    if let target = manager.targetPaceSeconds {
                        HStack(spacing: 6) {
                            Text("target \(WorkoutMirroringManager.formatPace(target))\(unitSuffix)")
                                .font(.caption2).foregroundStyle(.secondary)
                            if let d = paceDeltaText {
                                Text(d).font(.caption2.monospacedDigit().bold()).foregroundStyle(paceDeltaColor)
                            }
                        }
                    } else {
                        Text("pace").font(.caption2).foregroundStyle(.secondary)
                    }
                }
                .padding(.top, 2)

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
                .padding(.top, 4)
            }
            .padding(.horizontal, 4)
        }
        .task {
            await manager.requestAuthorization()
        }
    }

    private func stat(_ value: String, _ label: String, color: Color = .primary) -> some View {
        VStack(spacing: 0) {
            Text(value)
                .font(.title3.monospacedDigit().bold())
                .foregroundStyle(color)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

#Preview {
    ContentView()
}
