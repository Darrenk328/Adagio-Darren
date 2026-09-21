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
    /// Target and tolerance pushed from the phone over the mirrored session
    /// (the phone owns the workout setup; the Watch just displays). nil
    /// target until the phone has sent one.
    @Published private(set) var targetCadence: Int?
    @Published private(set) var tolerance: Int = 5

    /// The runner's chosen distance unit, pushed from the phone with the
    /// target ("mi" or "km"). Miles until told otherwise.
    @Published private(set) var paceUnit: String = "mi"
    /// Their typed target pace in seconds per paceUnit — only when the
    /// workout was set up "By pace" rather than by cadence.
    @Published private(set) var targetPaceSeconds: Int?
    /// Most recent running speed from the builder, m/s. Pace in the chosen
    /// unit is derived from this so a unit change re-renders instantly.
    @Published private(set) var speedMetersPerSecond: Double?

    private var metersPerUnit: Double { paceUnit == "km" ? 1000 : 1609.344 }

    /// Current pace in seconds per chosen unit; nil when not moving.
    var paceSeconds: Int? {
        guard let v = speedMetersPerSecond, v > 0.2 else { return nil }
        return Int((metersPerUnit / v).rounded())
    }

    /// Live pace minus target pace, seconds — positive = slower than target.
    var paceDeltaSeconds: Int? {
        guard let pace = paceSeconds, let target = targetPaceSeconds else { return nil }
        return pace - target
    }

    static func formatPace(_ seconds: Int) -> String {
        String(format: "%d:%02d", seconds / 60, seconds % 60)
    }

    /// Live minus target — the same number the phone's Now Playing card shows.
    var cadenceDelta: Int? {
        guard let cadence, let targetCadence else { return nil }
        return cadence - targetCadence
    }
    var isOnPace: Bool? {
        cadenceDelta.map { abs($0) <= tolerance }
    }

    private let healthStore = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?

    private var stepSamples: [(date: Date, steps: Double)] = []
    private let windowDuration: TimeInterval = 10
    private var smoothedSPM: Double?
    private let emaAlpha: Double = 0.3

    private let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount)!
    private let speedType = HKQuantityType.quantityType(forIdentifier: .runningSpeed)!

    // stepCount is in typesToShare too, not just typesToRead: the live
    // builder *saves* the step samples it collects, so writing them needs
    // share authorization or enableCollection below quietly yields nothing.
    // runningSpeed likewise, for the on-watch min/mile pace readout.
    private var typesToShare: Set<HKSampleType> {
        [HKObjectType.workoutType(), stepType, speedType]
    }
    private var typesToRead: Set<HKObjectType> {
        [HKObjectType.workoutType(), stepType, speedType]
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
            dataSource.enableCollection(for: speedType, predicate: nil)
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

        // Speed rides along so the phone can show pace in the runner's unit
        // (it does the unit conversion itself; the Watch just reports m/s).
        var payload: [String: Any] = ["cadence": cadence, "steps": steps]
        if let mps = speedMetersPerSecond { payload["speedMps"] = mps }
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

    /// Phone -> Watch over the same mirrored session the cadence rides the
    /// other way on. Payload: {"target": Int|null, "tolerance": Int}, sent
    /// by HealthKitCadenceModule.setTargetCadence whenever the workout's
    /// target changes (segment transitions included) and cleared on exit.
    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didReceiveDataFromRemoteWorkoutSession data: [Data]) {
        for item in data {
            guard let payload = try? JSONSerialization.jsonObject(with: item) as? [String: Any] else { continue }
            let target = payload["target"] as? Int
            let tolerance = payload["tolerance"] as? Int
            let paceUnit = payload["paceUnit"] as? String
            let targetPace = payload["targetPaceSeconds"] as? Int
            Task { @MainActor in
                self.targetCadence = target
                if let tolerance { self.tolerance = tolerance }
                if let paceUnit { self.paceUnit = paceUnit }
                self.targetPaceSeconds = targetPace
            }
        }
    }
}

extension WorkoutMirroringManager: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount)!
        let speedType = HKQuantityType.quantityType(forIdentifier: .runningSpeed)!

        if collectedTypes.contains(stepType) {
            let statistics = workoutBuilder.statistics(for: stepType)
            Task { @MainActor in self.ingestStepStatistics(statistics) }
        }
        if collectedTypes.contains(speedType) {
            // Most recent speed sample, m/s. Converted to min per mi/km at
            // display time so the unit the phone sends applies immediately.
            let mps = workoutBuilder.statistics(for: speedType)?
                .mostRecentQuantity()?
                .doubleValue(for: HKUnit.meter().unitDivided(by: .second()))
            Task { @MainActor in self.speedMetersPerSecond = mps }
        }
    }

    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
}
