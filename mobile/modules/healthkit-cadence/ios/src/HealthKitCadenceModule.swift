import ExpoModulesCore
import HealthKit

/// Live running cadence estimated from the iPhone's OWN motion sensors via
/// an iPhone-owned HKWorkoutSession — NOT genuine Apple Watch telemetry.
///
/// Ported from the partner's standalone HealthKitCadenceProvider.swift
/// (their from-scratch SwiftUI rewrite), primary-session path only. That
/// reference also implemented a *mirrored* session (a real Watch owning
/// the workout, this phone just receiving) — deliberately left out here:
/// it requires a watchOS companion app target this project doesn't have,
/// which is a Garmin-integration-sized undertaking on its own, not
/// something to fold into this pass. If genuine Watch-measured cadence is
/// wanted later, that mirrored path is the one to build — see this
/// module's git history / the original file for the receiving-side code.
///
/// HealthKit has no running-cadence quantity type at all (cyclingCadence
/// exists, no running equivalent) — what Fitness/the Watch show as
/// "cadence" is derived from step counts, so that's what this does too:
/// reads the workout's cumulative stepCount as HealthKit collects it and
/// differentiates over a rolling window to get steps per minute.
///
/// `HKWorkoutSession.init(healthStore:configuration:)` for an iPhone-owned
/// (non-Watch) session is iOS 26+ only — confirmed from the reference
/// implementation's own doc comment, not assumed. Same availability-guard
/// pattern as modules/apple-music: every function checks it and returns/
/// throws a clean "unavailable" rather than trapping at the first call.
public class HealthKitCadenceModule: Module {

    private let healthStore = HKHealthStore()
    private let delegateHandler = HealthKitCadenceDelegateHandler()

    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?

    // Rolling (timestamp, cumulative steps) samples — cadence is the
    // slope of this series, so at least two points spanning enough time
    // are needed before publishing anything.
    private var stepSamples: [(date: Date, steps: Double)] = []
    private let windowDuration: TimeInterval = 10
    private var smoothedSPM: Double?
    private let emaAlpha: Double = 0.3

    private let stepType = HKQuantityType(.stepCount)
    private var typesToRead: Set<HKObjectType> {
        [stepType, HKQuantityType(.distanceWalkingRunning), HKObjectType.workoutType()]
    }
    private var typesToShare: Set<HKSampleType> {
        [HKObjectType.workoutType(), stepType, HKQuantityType(.distanceWalkingRunning)]
    }

    public required init(appContext: AppContext) {
        super.init(appContext: appContext)

        delegateHandler.onStateChanged = { [weak self] state in
            guard let self else { return }
            switch state {
            case .running:
                self.sendEvent("onStatusChanged", ["status": "tracking"])
            case .ended, .stopped:
                self.sendEvent("onStatusChanged", ["status": "stopped"])
                self.teardown()
            default:
                break
            }
        }

        delegateHandler.onError = { [weak self] error in
            self?.sendEvent("onStatusChanged", ["status": "error", "error": error.localizedDescription])
            self?.teardown()
        }

        delegateHandler.onStepStatistics = { [weak self] statistics in
            self?.ingestStepStatistics(statistics)
        }
    }

    public func definition() -> ModuleDefinition {
        Name("HealthKitCadenceModule")

        // status: "idle" | "tracking" | "stopped" | "error" | "unavailable"
        Events("onStatusChanged", "onCadenceReceived")

        Function("isHealthDataAvailable") { () -> Bool in
            HKHealthStore.isHealthDataAvailable()
        }

        // HealthKit deliberately never reveals whether READ access was
        // granted (a denied read type just silently returns no data) —
        // this resolving successfully means the prompt was shown and
        // share (write) access exists, not a guarantee readings follow.
        AsyncFunction("requestAuthorization") { () -> Void in
            guard HKHealthStore.isHealthDataAvailable() else {
                throw HealthUnavailableError()
            }
            try await self.healthStore.requestAuthorization(toShare: self.typesToShare, read: self.typesToRead)
        }

        AsyncFunction("start") { () -> Void in
            guard #available(iOS 26.0, *) else {
                self.sendEvent("onStatusChanged", ["status": "unavailable"])
                throw HealthKitVersionUnavailableError()
            }
            guard HKHealthStore.isHealthDataAvailable() else { throw HealthUnavailableError() }
            guard self.session == nil else { return }

            let configuration = HKWorkoutConfiguration()
            configuration.activityType = .running
            configuration.locationType = .outdoor

            do {
                let session = try HKWorkoutSession(healthStore: self.healthStore, configuration: configuration)
                let builder = session.associatedWorkoutBuilder()
                builder.dataSource = HKLiveWorkoutDataSource(
                    healthStore: self.healthStore,
                    workoutConfiguration: configuration
                )

                session.delegate = self.delegateHandler
                builder.delegate = self.delegateHandler

                self.session = session
                self.builder = builder
                self.resetDerivationState()

                let startDate = Date()
                session.startActivity(with: startDate)
                try await builder.beginCollection(at: startDate)
            } catch {
                self.teardown()
                throw error
            }
        }

        AsyncFunction("stop") { () -> Void in
            guard #available(iOS 26.0, *) else { return }
            guard let session = self.session, let builder = self.builder else { return }

            session.end()
            do {
                try await builder.endCollection(at: Date())
                _ = try await builder.finishWorkout()
            } catch {
                // Ending/saving failing shouldn't block tearing down local
                // state — the workout may just not get saved to Health.
            }
            self.teardown()
        }
    }

    private func teardown() {
        session?.delegate = nil
        builder?.delegate = nil
        session = nil
        builder = nil
        resetDerivationState()
    }

    private func resetDerivationState() {
        stepSamples.removeAll()
        smoothedSPM = nil
    }

    private func ingestStepStatistics(_ statistics: HKStatistics?) {
        guard let statistics, let cumulative = statistics.sumQuantity()?.doubleValue(for: .count()) else { return }

        let now = Date()
        stepSamples.append((date: now, steps: cumulative))
        stepSamples.removeAll { now.timeIntervalSince($0.date) > windowDuration }

        guard let oldest = stepSamples.first, stepSamples.count >= 2 else { return }

        let span = now.timeIntervalSince(oldest.date)
        let deltaSteps = cumulative - oldest.steps
        guard span > 0, deltaSteps >= 0 else { return }

        let instantaneousSPM = deltaSteps / (span / 60.0)
        let newSmoothed = smoothedSPM.map { $0 + emaAlpha * (instantaneousSPM - $0) } ?? instantaneousSPM
        smoothedSPM = newSmoothed

        sendEvent("onCadenceReceived", ["cadence": Int(newSmoothed.rounded())])
    }
}

struct HealthUnavailableError: Error, CustomStringConvertible {
    var description: String { "HealthKit is not available on this device." }
}

struct HealthKitVersionUnavailableError: Error, CustomStringConvertible {
    var description: String { "This requires iOS 26.0 or later." }
}
