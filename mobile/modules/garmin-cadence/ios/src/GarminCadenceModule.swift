import ExpoModulesCore
import ConnectIQ

// The Adagio watch app's manifest.xml `id` (garmin-watch/manifest.xml),
// reformatted as a dashed NSUUID string. Must be updated here if that
// app is ever re-signed with a new id.
private let watchAppUUIDString = "61CF7009-427E-4C2C-9E43-020A19CE0E79"

// Must match a CFBundleURLSchemes entry added by withGarminCadence.js
// (the config plugin), and be distinct from Adagio's existing
// "adagio://callback" Spotify OAuth scheme.
let garminCompanionURLScheme = "adagio-garmin-ciq"

public class GarminCadenceModule: Module {

    // Expo instantiates one Module per app context; GarminCadenceAppDelegateSubscriber
    // (a plain AppDelegateSubscriber, not itself a Module) needs a way to
    // reach this instance to forward the GCM device-selection callback URL.
    static weak var shared: GarminCadenceModule?

    // See GarminCadenceDelegateHandler.swift for why the actual ConnectIQ
    // delegate conformance can't live directly on this class.
    private let delegateHandler = GarminCadenceDelegateHandler()

    private var device: IQDevice?
    private var watchApp: IQApp?

    public required init(appContext: AppContext) {
        super.init(appContext: appContext)
        GarminCadenceModule.shared = self

        delegateHandler.onNeedsGCM = { [weak self] in
            self?.sendEvent("onConnectionStatusChanged", ["status": "needsGCM"])
            ConnectIQ.sharedInstance().showAppStoreForConnectMobile()
        }

        delegateHandler.onDeviceStatusChanged = { [weak self] device, status in
            self?.handleDeviceStatusChanged(device, status: status)
        }

        delegateHandler.onCharacteristicsDiscovered = { [weak self] device in
            self?.handleCharacteristicsDiscovered(device)
        }

        delegateHandler.onMessageReceived = { [weak self] message, _ in
            if let number = message as? NSNumber {
                DispatchQueue.main.async {
                    self?.sendEvent("onCadenceReceived", ["cadence": number.intValue])
                }
            }
        }
    }

    public func definition() -> ModuleDefinition {
        Name("GarminCadenceModule")

        // status: "needsGCM" | "opening" | "found" | "connected" | "ready"
        //       | "notConnected" | "bluetoothNotReady" | "notFound"
        //       | "invalidDevice" | "noDeviceReturned"
        // "ready" is the one that means it's actually safe to receive
        // cadence — see handleCharacteristicsDiscovered below.
        Events("onConnectionStatusChanged", "onCadenceReceived")

        OnCreate {
            ConnectIQ.sharedInstance().initialize(
                withUrlScheme: garminCompanionURLScheme,
                uiOverrideDelegate: self.delegateHandler
            )
        }

        Function("findDevice") { () -> Void in
            self.sendEvent("onConnectionStatusChanged", ["status": "opening"])
            ConnectIQ.sharedInstance().showDeviceSelection()
        }
    }

    /// Called by GarminCadenceAppDelegateSubscriber's open(url:options:) —
    /// Garmin Connect Mobile hands control back to us via this URL scheme
    /// after the user picks a device.
    @discardableResult
    func handleOpenURL(_ url: URL) -> Bool {
        guard let devices = ConnectIQ.sharedInstance().parseDeviceSelectionResponse(from: url) as? [IQDevice],
              let chosen = devices.first else {
            sendEvent("onConnectionStatusChanged", ["status": "noDeviceReturned"])
            return false
        }

        device = chosen
        watchApp = IQApp(uuid: UUID(uuidString: watchAppUUIDString)!, store: UUID(), device: chosen)
        ConnectIQ.sharedInstance().register(forDeviceEvents: chosen, delegate: delegateHandler)

        sendEvent("onConnectionStatusChanged", ["status": "found", "deviceName": chosen.friendlyName ?? "Garmin Watch"])
        return true
    }

    private func handleDeviceStatusChanged(_ device: IQDevice, status: IQDeviceStatus) {
        // CoreBluetooth delivers this on a background queue — sendEvent
        // itself is safe to call off-main, but keeping this dispatch
        // explicit and consistent with the standalone prototype, where
        // omitting it on the SwiftUI @Published equivalent was a real,
        // confirmed bug (silently-stale UI, not a crash).
        DispatchQueue.main.async {
            switch status {
            case .connected:
                // NOT "ready" yet — per Garmin's own docs, .connected
                // doesn't guarantee BLE characteristics have been
                // discovered. Registering for app messages before that
                // could silently drop early cadence readings. The
                // original standalone prototype skipped this wait
                // entirely (didn't implement deviceCharacteristicsDiscovered
                // at all) and happened to work anyway, likely just from
                // lucky timing — not something to carry into production.
                self.sendEvent("onConnectionStatusChanged", ["status": "connected", "deviceName": device.friendlyName ?? ""])
            case .notConnected:
                self.sendEvent("onConnectionStatusChanged", ["status": "notConnected", "deviceName": device.friendlyName ?? ""])
            case .bluetoothNotReady:
                self.sendEvent("onConnectionStatusChanged", ["status": "bluetoothNotReady"])
            case .notFound:
                self.sendEvent("onConnectionStatusChanged", ["status": "notFound"])
            case .invalidDevice:
                self.sendEvent("onConnectionStatusChanged", ["status": "invalidDevice"])
            @unknown default:
                self.sendEvent("onConnectionStatusChanged", ["status": "unknown"])
            }
        }
    }

    private func handleCharacteristicsDiscovered(_ device: IQDevice) {
        guard let watchApp = watchApp else { return }
        ConnectIQ.sharedInstance().register(forAppMessages: watchApp, delegate: delegateHandler)
        DispatchQueue.main.async {
            self.sendEvent("onConnectionStatusChanged", ["status": "ready", "deviceName": device.friendlyName ?? ""])
        }
    }
}
