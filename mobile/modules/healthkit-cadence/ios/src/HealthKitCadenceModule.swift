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
/// `HKWorkoutSession`/`HKWorkoutSessionState` need iOS 17+ and
/// `HKLiveWorkoutBuilder` needs iOS 26+ for an iPhone-owned (non-Watch)
/// session — confirmed by real compiler errors, not assumed. `session`/
/// `builder`/`delegateHandler` below are stored as `Any?` rather than
/// their real types for the same class-layout reason modules/apple-music's
/// trackCache is `[String: Any]`: a stored property's type is part of
/// this class's memory layout, which has to compile for every deployment
/// target this app supports (13.4) — `@available` on the property alone
/// isn't enough. Every function checks #available and casts with `as?`
/// inside that guard.
public class HealthKitCadenceModule: Module {

    private let healthStore = HKHealthStore()

    private var session: Any?
    private var builder: Any?
    private var delegateHandler: Any?

    // Rolling (timestamp, cumulative steps) samples — cadence is the
    // slope of this series, so at least two points spanning enough time
    // are needed before publishing anything. None of these types need
    // the iOS 17/26 gating above.
    private var stepSamples: [(date: Date, steps: Double)] = []
    private let windowDuration: TimeInterval = 10
    private var smoothedSPM: Double?
    private let emaAlpha: Double = 0.3

    // HKQuantityType(.stepCount) (the identifier-enum-literal init) needs
    // iOS 15+ — this class isn't @available-gated as a whole (Expo
    // instantiates it unconditionally), so it needs the older
    // quantityType(forIdentifier:) form, which has worked since iOS 8.
    // Force-unwrap is safe: .stepCount and .distanceWalkingRunning are
    // both real, permanent identifiers that always resolve.
    private let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount)!
    private let distanceType = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning)!
    private var typesToRead: Set<HKObjectType> {
        [stepType, distanceType, HKObjectType.workoutType()]
    }
    private var typesToShare: Set<HKSampleType> {
        [HKObjectType.workoutType(), stepType, distanceType]
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
            // The async requestAuthorization(toShare:read:) overload needs
            // iOS 15+ — moot in practice since start() already requires
            // iOS 26, but this class isn't @available-gated as a whole
            // (Expo instantiates it unconditionally), so the 13.4
            // deployment target still needs this guard to compile.
            guard #available(iOS 15.0, *) else { throw HealthKitVersionUnavailableError() }
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

            let handler = HealthKitCadenceDelegateHandler()
            handler.onStateChanged = { [weak self] state in
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
            handler.onError = { [weak self] error in
                self?.sendEvent("onStatusChanged", ["status": "error", "error": error.localizedDescription])
                self?.teardown()
            }
            handler.onStepStatistics = { [weak self] statistics in
                self?.ingestStepStatistics(statistics)
            }

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

                session.delegate = handler
                builder.delegate = handler

                self.session = session
                self.builder = builder
                self.delegateHandler = handler
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
            guard let session = self.session as? HKWorkoutSession,
                  let builder = self.builder as? HKLiveWorkoutBuilder
            else { return }

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
        if #available(iOS 26.0, *) {
            (session as? HKWorkoutSession)?.delegate = nil
            (builder as? HKLiveWorkoutBuilder)?.delegate = nil
        }
        session = nil
        builder = nil
        delegateHandler = nil
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
