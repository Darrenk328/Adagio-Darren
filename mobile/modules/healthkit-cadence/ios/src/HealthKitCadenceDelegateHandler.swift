import HealthKit

/// HKWorkoutSessionDelegate/HKLiveWorkoutBuilderDelegate are @objc
/// protocols requiring NSObject conformance — kept off the main Module
/// class for the same reason modules/garmin-cadence separates its
/// ConnectIQ delegate conformance into GarminCadenceDelegateHandler.
/// Forwards everything back to HealthKitCadenceModule via closures.
final class HealthKitCadenceDelegateHandler: NSObject {
    var onStateChanged: ((HKWorkoutSessionState) -> Void)?
    var onStepStatistics: ((HKStatistics?) -> Void)?
    var onError: ((Error) -> Void)?

    private let stepType = HKQuantityType(.stepCount)
}

extension HealthKitCadenceDelegateHandler: HKWorkoutSessionDelegate {
    func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        onStateChanged?(toState)
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        onError?(error)
    }
}

extension HealthKitCadenceDelegateHandler: HKLiveWorkoutBuilderDelegate {
    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        guard collectedTypes.contains(stepType) else { return }
        onStepStatistics?(workoutBuilder.statistics(for: stepType))
    }

    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {
        // Pause/resume/lap markers — not needed for cadence.
    }
}
