import ExpoModulesCore

// Forwards Garmin Connect Mobile's device-selection callback URL into
// GarminCadenceModule. A separate lightweight class rather than putting
// this directly on the Module, since AppDelegateSubscribers and Modules
// are registered/discovered independently by Expo (see
// expo-module.config.json's separate "modules" and
// "appDelegateSubscribers" entries).
public class GarminCadenceAppDelegateSubscriber: ExpoAppDelegateSubscriber {
    public func application(
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {
        return GarminCadenceModule.shared?.handleOpenURL(url) ?? false
    }
}
