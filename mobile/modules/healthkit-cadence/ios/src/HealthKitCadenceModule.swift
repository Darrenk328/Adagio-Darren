import ExpoModulesCore
import HealthKit

/// Live running cadence estimated from the iPhone's OWN motion sensors via
/// an iPhone-owned HKWorkoutSession — NOT genuine Apple Watch telemetry.
///
/// Two paths, both live: `start()`/`stop()` (called from JS around a
/// workout's lifecycle) drive an iPhone-owned session for the 'healthkit'
/// cadence source; `startObservingMirroredSessions` (armed automatically
/// at launch, called from nowhere in JS) adopts a session a real Apple
/// Watch starts and mirrors over, for the 'appleWatch' cadence source —
/// see the "Adagio Watch Connection Watch App" target's
/// WorkoutMirroringManager.swift, the thing that actually sends it.
/// Ported from the partner's standalone HealthKitCadenceProvider.swift
/// (their from-scratch SwiftUI rewrite), which sketched both paths but
/// only ever ran the first — this project didn't have a watchOS target
/// to receive from until now.
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
    // Only a phone-owned session may finish the workout; for a mirrored
    // one the Watch owns collection lifecycle, so finishing it from here
    // would race with the Watch's own stop. Plain Bool — doesn't need
    // the Any? erasure the HealthKit types above need.
    private var isMirroredFromWatch = false

    // Latest target/tolerance from JS, kept so a mirrored session that's
    // adopted *after* the workout started still gets told the target
    // straight away (see adopt). nil target = no workout in progress.
    private var pendingTarget: Int?
    private var pendingTolerance: Int = 5
    // Runner's chosen pace unit ("mi"/"km") and, for "By pace" setups, the
    // pace they typed in seconds per that unit. Display-only on the Watch.
    private var pendingPaceUnit: String?
    private var pendingTargetPaceSeconds: Int?

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

        // Arms mirrored-session observation as soon as the app launches —
        // not on-demand from JS. Apple's own guidance: call this early,
        // since if the app isn't even running when the Watch starts a
        // session, iOS launches it in the background and delivers the
        // session through this handler exactly once. There's nothing for
        // JS to call to enable the 'appleWatch' cadence source — it's
        // always listening, and just does nothing until a Watch actually
        // starts mirroring one over.
        OnCreate {
            self.startObservingMirroredSessions()
        }

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

            let handler = self.makeDelegateHandler()
            let configuration = HKWorkoutConfiguration()
            configuration.activityType = .running
            configuration.locationType = .outdoor

            do {
                let session = try HKWorkoutSession(healthStore: self.healthStore, configuration: configuration)
                let builder = session.associatedWorkoutBuilder()
                let dataSource = HKLiveWorkoutDataSource(
                    healthStore: self.healthStore,
                    workoutConfiguration: configuration
                )
                // A running workout's default data source does NOT collect
                // step count — it has to be opted into explicitly, and
                // ingestStepStatistics gets nothing otherwise. Same fix as
                // the Watch app's WorkoutMirroringManager; found on device.
                dataSource.enableCollection(for: self.stepType, predicate: nil)
                builder.dataSource = dataSource

                session.delegate = handler
                builder.delegate = handler

                self.session = session
                self.builder = builder
                self.delegateHandler = handler
                self.isMirroredFromWatch = false
                self.resetDerivationState()

                let startDate = Date()
                session.startActivity(with: startDate)
                try await builder.beginCollection(at: startDate)
            } catch {
                self.teardown()
                throw error
            }
        }

        // Tells a mirrored Watch session the current target so the Watch
        // can show live-vs-target itself. Cheap to call on every change;
        // no-op (beyond remembering the value) when no mirrored session is
        // active. Pass a null target when the workout ends.
        AsyncFunction("setTargetCadence") { (target: Int?, tolerance: Int, paceUnit: String?, targetPaceSeconds: Int?) -> Void in
            self.pendingTarget = target
            self.pendingTolerance = tolerance
            self.pendingPaceUnit = paceUnit
            self.pendingTargetPaceSeconds = targetPaceSeconds
            await self.pushTargetToWatch()
        }

        // Asks a mirrored Watch session to end (the Watch owns it and does
        // the actual ending; the phone just tears down when the state
        // change arrives). No-op when no mirrored session is active.
        AsyncFunction("endWatchWorkout") { () -> Void in
            guard #available(iOS 26.0, *) else { return }
            guard self.isMirroredFromWatch, let session = self.session as? HKWorkoutSession else { return }

            // Two independent paths so the Watch ends even if one is lost:
            // 1. an explicit "stop" message the Watch app acts on, and
            // 2. ending the mirrored session from this side — HealthKit
            //    forwards the state change to the Watch, whose delegate
            //    finishes the workout on .ended. The message is sent first
            //    because a session that's already ended can't send data.
            if let data = try? JSONSerialization.data(withJSONObject: ["command": "stop"]) {
                do {
                    try await session.sendToRemoteWorkoutSession(data: data)
                } catch {
                    NSLog("[HealthKitCadence] stop message to Watch failed: %@", error.localizedDescription)
                }
            }
            switch session.state {
            case .running, .paused, .prepared:
                session.end()
            default:
                break
            }
        }

        // Only meaningful for the 'healthkit' (iPhone-owned) path — JS
        // never calls this for 'appleWatch' sessions, since the Watch (not
        // the phone) controls when a mirrored workout starts and stops.
        // Still guarded defensively below in case that ever changes.
        AsyncFunction("stop") { () -> Void in
            guard #available(iOS 26.0, *) else { return }
            guard let session = self.session as? HKWorkoutSession,
                  let builder = self.builder as? HKLiveWorkoutBuilder
            else { return }

            guard !self.isMirroredFromWatch else {
                self.teardown()
                return
            }

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

    // Arms the mirrored-session handler — see the OnCreate block above
    // for why this runs at launch rather than being JS-triggered.
    private func startObservingMirroredSessions() {
        guard #available(iOS 26.0, *) else { return }
        healthStore.workoutSessionMirroringStartHandler = { [weak self] mirroredSession in
            guard let self else { return }
            Task { @MainActor in
                self.adopt(mirroredSession)
            }
        }
    }

    @available(iOS 26.0, *)
    private func adopt(_ mirroredSession: HKWorkoutSession) {
        let builder = mirroredSession.associatedWorkoutBuilder()
        let handler = makeDelegateHandler()

        mirroredSession.delegate = handler
        builder.delegate = handler

        session = mirroredSession
        self.builder = builder
        delegateHandler = handler
        isMirroredFromWatch = true
        resetDerivationState()

        // No beginCollection call — the Watch already owns collection
        // for a mirrored session; this side only receives what it sends.
        sendEvent("onStatusChanged", ["status": "tracking"])

        // If a workout's already in progress on the phone, the Watch should
        // know the target immediately rather than waiting for the next change.
        Task { await pushTargetToWatch() }
    }

    // Phone -> Watch over the mirrored session (the reverse direction of
    // the cadence stream). Payload {"target": Int|null, "tolerance": Int};
    // the Watch's WorkoutMirroringManager decodes it.
    private func pushTargetToWatch() async {
        guard #available(iOS 26.0, *) else { return }
        guard isMirroredFromWatch, let session = session as? HKWorkoutSession else { return }
        // NSNull, not a bare nil: JSONSerialization rejects Optional.none.
        let payload: [String: Any] = [
            "target": pendingTarget.map { $0 as Any } ?? NSNull(),
            "tolerance": pendingTolerance,
            "paceUnit": pendingPaceUnit.map { $0 as Any } ?? NSNull(),
            "targetPaceSeconds": pendingTargetPaceSeconds.map { $0 as Any } ?? NSNull(),
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: payload) else { return }
        // Best-effort: the Watch display is a nicety; a failed send must never
        // affect the phone-side workout.
        try? await session.sendToRemoteWorkoutSession(data: data)
    }

    // Shared between start()'s iPhone-owned session and adopt()'s
    // Watch-mirrored one — both wire the exact same three callbacks.
    @available(iOS 26.0, *)
    private func makeDelegateHandler() -> HealthKitCadenceDelegateHandler {
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
        // The path that actually carries cadence for a mirrored (Watch)
        // session. The Watch computes cadence from its own builder and
        // sends {"cadence": Int, "steps": Int} about once a second; the
        // iPhone side's builder never delivers step statistics for a
        // mirrored session (confirmed on device — onStepStatistics above
        // only ever fires for the iPhone-owned 'healthkit' path).
        handler.onRemoteData = { [weak self] datas in
            guard let self else { return }
            for data in datas {
                guard let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let cadence = payload["cadence"] as? Int
                else { continue }
                // Steps and speed (m/s) are Watch-only extras; Garmin and
                // the iPhone-owned path emit cadence alone. JS treats them
                // as optional.
                var event: [String: Any] = ["cadence": cadence]
                if let steps = payload["steps"] as? Int { event["steps"] = steps }
                if let speed = payload["speedMps"] as? Double { event["speedMps"] = speed }
                self.sendEvent("onCadenceReceived", event)
            }
        }
        return handler
    }

    private func teardown() {
        if #available(iOS 26.0, *) {
            (session as? HKWorkoutSession)?.delegate = nil
            (builder as? HKLiveWorkoutBuilder)?.delegate = nil
        }
        session = nil
        builder = nil
        delegateHandler = nil
        isMirroredFromWatch = false
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
