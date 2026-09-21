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

    private let healthStore = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?

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
    }
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
        // No on-watch cadence display needed — the phone reads this via
        // the mirrored session's own builder statistics on its side.
    }

    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
}
