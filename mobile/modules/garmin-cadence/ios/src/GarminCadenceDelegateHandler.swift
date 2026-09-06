import Foundation
import ConnectIQ

// Expo's Module base class can't directly conform to Obj-C protocols that
// require NSObjectProtocol (confirmed by the compiler: "cannot declare
// conformance to 'NSObjectProtocol' in Swift; 'GarminCadenceModule'
// should inherit 'NSObject' instead") — Module isn't a plain NSObject
// subclass. So the actual ConnectIQ SDK delegate conformance lives here,
// on a plain NSObject class instead, and GarminCadenceModule owns one
// instance of this and wires up closures to forward into sendEvent.
class GarminCadenceDelegateHandler: NSObject, IQUIOverrideDelegate, IQDeviceEventDelegate, IQAppMessageDelegate {

    var onNeedsGCM: (() -> Void)?
    var onDeviceStatusChanged: ((IQDevice, IQDeviceStatus) -> Void)?
    var onCharacteristicsDiscovered: ((IQDevice) -> Void)?
    var onMessageReceived: ((Any, IQApp) -> Void)?

    func needsToInstallConnectMobile() {
        onNeedsGCM?()
    }

    func deviceStatusChanged(_ device: IQDevice, status: IQDeviceStatus) {
        onDeviceStatusChanged?(device, status)
    }

    func deviceCharacteristicsDiscovered(_ device: IQDevice) {
        onCharacteristicsDiscovered?(device)
    }

    func receivedMessage(_ message: Any, from app: IQApp) {
        onMessageReceived?(message, app)
    }
}
