import Foundation
import WatchConnectivity

/// Answers "is there an Apple Watch, and is Adagio on it?" for the
/// Settings screen and the in-workout auto-start. WatchConnectivity is
/// used only for those two flags (`isPaired` / `isWatchAppInstalled`);
/// all live data still travels over the mirrored HKWorkoutSession.
///
/// WCSession must be activated before either flag is meaningful, and
/// activation completes asynchronously — hence the continuation dance.
final class WatchStatusBridge: NSObject, WCSessionDelegate {
    static let shared = WatchStatusBridge()

    private var activationWaiters: [CheckedContinuation<Void, Never>] = []
    private var isActivated = false

    struct Status {
        let supported: Bool
        let paired: Bool
        let appInstalled: Bool

        var dictionary: [String: Any] {
            ["supported": supported, "paired": paired, "appInstalled": appInstalled]
        }
    }

    func status() async -> Status {
        guard WCSession.isSupported() else {
            return Status(supported: false, paired: false, appInstalled: false)
        }
        await activate()
        let session = WCSession.default
        return Status(supported: true, paired: session.isPaired, appInstalled: session.isWatchAppInstalled)
    }

    private func activate() async {
        let session = WCSession.default
        if session.delegate == nil { session.delegate = self }
        if session.activationState == .activated {
            isActivated = true
            return
        }
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            activationWaiters.append(continuation)
            session.activate()
        }
    }

    // MARK: WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        isActivated = activationState == .activated
        let waiters = activationWaiters
        activationWaiters.removeAll()
        waiters.forEach { $0.resume() }
    }

    // Required on iOS; the session is re-activated on demand by activate().
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) {
        isActivated = false
    }
}
