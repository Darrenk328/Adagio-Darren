import Combine
import Foundation
import HealthKit

/// Owns the Watch-side HKWorkoutSession and mirrors it to the paired
/// iPhone via startMirroringToCompanionDevice() — the whole point of this
/// app. The phone receives it via HKHealthStore's
/// workoutSessionMirroringStartHandler (see
/// mobile/modules/healthkit-cadence/ios/src/HealthKitCadenceModule.swift,
/// the actual consumer of what this sends).
///
/// Deliberately minimal: no on-watch cadence display — the phone is what
/// reads and uses the live data via the mirrored session's builder. This
/// view model exists purely to start/stop the mirrored session.
@MainActor
final class WorkoutMirroringManager: NSObject, ObservableObject {
    @Published private(set) var isActive = false
    @Published private(set) var errorMessage: String?
    /// Cumulative steps this workout, straight from the builder — nil until
    /// the first step sample arrives. Shown on the Watch so "is the Watch
    /// collecting steps at all?" can be answered independently of whether
    /// mirroring is delivering anything to the phone.
    @Published private(set) var totalSteps: Int?
    /// Steps/min derived the same way the phone does it (rolling 10 s
    /// window, EMA-smoothed) — a local sanity check against the phone's number.
    @Published private(set) var cadence: Int?

    private let healthStore = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?

    private var stepSamples: [(date: Date, steps: Double)] = []
    private let windowDuration: TimeInterval = 10
    private var smoothedSPM: Double?
    private let emaAlpha: Double = 0.3

    private let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount)!

    // stepCount is in typesToShare too, not just typesToRead: the live
    // builder *saves* the step samples it collects, so writing them needs
    // share authorization or enableCollection below quietly yields nothing.
    private var typesToShare: Set<HKSampleType> {
        [HKObjectType.workoutType(), stepType]
    }
    private var typesToRead: Set<HKObjectType> {
        [HKObjectType.workoutType(), stepType]
    }

    func requestAuthorization() async {
        guard HKHealthStore.isHealthDataAvailable() else {
            errorMessage = "Health data is not available on this device."
            return
        }
        do {
            try await healthStore.requestAuthorization(toShare: typesToShare, read: typesToRead)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func start() async {
        guard session == nil else { return }
        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .running
        configuration.locationType = .outdoor

        do {
            let session = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
            let builder = session.associatedWorkoutBuilder()
            let dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: configuration)
            // A running workout's default data source collects heart rate,
            // distance, energy, running speed etc. — NOT step count. Steps
            // have to be opted into explicitly, and the phone derives cadence
            // from nothing else. Without this line the mirrored session
            // "works" but never yields a single cadence reading — that was a
            // real on-device failure ("Not tracking", no numbers), not a
            // permissions problem.
            dataSource.enableCollection(for: stepType, predicate: nil)
            builder.dataSource = dataSource
            session.delegate = self
            builder.delegate = self

            self.session = session
            self.builder = builder

            let startDate = Date()
            session.startActivity(with: startDate)
            builder.beginCollection(withStart: startDate) { [weak self] _, error in
                guard let error else { return }
                Task { @MainActor in self?.errorMessage = error.localizedDescription }
            }

            // This is the actual point of the whole app: mirror this
            // session to the paired iPhone. The phone's
            // HealthKitCadenceModule picks it up via
            // workoutSessionMirroringStartHandler.
            try await session.startMirroringToCompanionDevice()

            isActive = true
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
            // If startActivity already ran, end the session rather than
            // leaving it running orphaned behind a "Not tracking" screen.
            session?.end()
            teardown()
        }
    }

    func stop() {
        guard let session, let builder else { return }
        session.end()
        builder.endCollection(withEnd: Date()) { _, error in
            builder.finishWorkout { _, error in
                if let error {
                    Task { @MainActor in self.errorMessage = error.localizedDescription }
                }
            }
        }
        teardown()
    }

    private func teardown() {
        session?.delegate = nil
        builder?.delegate = nil
        session = nil
        builder = nil
        isActive = false
        stepSamples.removeAll()
        smoothedSPM = nil
        // Leave totalSteps/cadence showing their last values after a stop —
        // useful to see that *something* was collected during the run.
    }

    /// Mirrors HealthKitCadenceModule.ingestStepStatistics on the phone.
    fileprivate func ingestStepStatistics(_ statistics: HKStatistics?) {
        guard let statistics, let cumulative = statistics.sumQuantity()?.doubleValue(for: .count()) else { return }
        totalSteps = Int(cumulative)

        let now = Date()
        stepSamples.append((date: now, steps: cumulative))
        stepSamples.removeAll { now.timeIntervalSince($0.date) > windowDuration }
        guard let oldest = stepSamples.first, stepSamples.count >= 2 else { return }

        let span = now.timeIntervalSince(oldest.date)
        let deltaSteps = cumulative - oldest.steps
        guard span > 0, deltaSteps >= 0 else { return }

        let instantaneous = deltaSteps / (span / 60.0)
        let smoothed = smoothedSPM.map { $0 + emaAlpha * (instantaneous - $0) } ?? instantaneous
        smoothedSPM = smoothed
        let rounded = Int(smoothed.rounded())
        cadence = rounded
        sendToPhone(cadence: rounded, steps: Int(cumulative))
    }

    private var lastSendDate = Date.distantPast

    /// The actual data path to the phone. A mirrored session's builder only
    /// collects on the Watch — the iPhone side does NOT get builder
    /// callbacks for it (this is how Apple's own multi-device workout
    /// sample works too: the Watch sends, the phone receives via
    /// workoutSession(_:didReceiveDataFromRemoteWorkoutSession:)). The
    /// first version of this app relied on the phone reading the mirrored
    /// builder, and the phone never saw a single reading.
    private func sendToPhone(cadence: Int, steps: Int) {
        guard let session else { return }
        // Builder callbacks can be frequent; once a second is plenty.
        let now = Date()
        guard now.timeIntervalSince(lastSendDate) >= 1 else { return }
        lastSendDate = now

        let payload: [String: Int] = ["cadence": cadence, "steps": steps]
        guard let data = try? JSONSerialization.data(withJSONObject: payload) else { return }
        Task {
            do {
                try await session.sendToRemoteWorkoutSession(data: data)
                lastSendError = nil
            } catch {
                lastSendError = error.localizedDescription
            }
        }
    }

    /// Surfaced on the Watch screen so a failing send is visible there.
    @Published private(set) var lastSendError: String?
}

extension WorkoutMirroringManager: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        guard toState == .ended || toState == .stopped else { return }
        Task { @MainActor in self.teardown() }
    }

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        Task { @MainActor in
            self.errorMessage = error.localizedDescription
            self.teardown()
        }
    }
}

extension WorkoutMirroringManager: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount)!
        guard collectedTypes.contains(stepType) else { return }
        let statistics = workoutBuilder.statistics(for: stepType)
        Task { @MainActor in self.ingestStepStatistics(statistics) }
    }

    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
}
