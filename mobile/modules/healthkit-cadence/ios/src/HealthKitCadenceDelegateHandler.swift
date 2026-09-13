import HealthKit

/// HKWorkoutSessionDelegate/HKLiveWorkoutBuilderDelegate are @objc
/// protocols requiring NSObject conformance — kept off the main Module
/// class for the same reason modules/garmin-cadence separates its
/// ConnectIQ delegate conformance into GarminCadenceDelegateHandler.
/// Forwards everything back to HealthKitCadenceModule via closures.
///
/// The whole class carries @available(iOS 26.0, *): HKWorkoutSession/
/// HKWorkoutSessionState need iOS 17+ and HKLiveWorkoutBuilder needs iOS
/// 26+ (confirmed by real compiler errors, not assumed) — gating the
/// class itself, rather than type-erasing every member, means nothing
/// inside it needs erasure at all. HealthKitCadenceModule (which can't
/// be gated this way — Expo instantiates it unconditionally) is the one
/// that has to hold this behind an `Any?` and only touch it inside its
/// own `if #available` checks — same reason modules/apple-music's
/// trackCache is [String: Any] rather than [String: MusicKit.Track].
@available(iOS 26.0, *)
final class HealthKitCadenceDelegateHandler: NSObject {
    var onStateChanged: ((HKWorkoutSessionState) -> Void)?
    var onStepStatistics: ((HKStatistics?) -> Void)?
    var onError: ((Error) -> Void)?

    private let stepType = HKQuantityType(.stepCount)
}

@available(iOS 26.0, *)
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

@available(iOS 26.0, *)
extension HealthKitCadenceDelegateHandler: HKLiveWorkoutBuilderDelegate {
    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        guard collectedTypes.contains(stepType) else { return }
        onStepStatistics?(workoutBuilder.statistics(for: stepType))
    }

    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {
        // Pause/resume/lap markers — not needed for cadence.
    }
}
