//
//  Adagio_Watch_ConnectionApp.swift
//  Adagio Watch Connection Watch App
//
//  Created by Darren Kapturski on 9/19/26.
//

import HealthKit
import SwiftUI
import WatchKit

@main
struct Adagio_Watch_Connection_Watch_AppApp: App {
    @WKApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

/// Exists for one callback: when the iPhone calls
/// HKHealthStore.startWatchApp(with:) (Adagio's "Start workout"), watchOS
/// launches this app — in the background if it isn't open — and hands the
/// workout configuration here. Starting the mirrored session from this
/// point is what lets the runner start everything from the phone without
/// touching the Watch.
final class AppDelegate: NSObject, WKApplicationDelegate {
    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        Task { @MainActor in
            await WorkoutMirroringManager.shared.start(configuration: workoutConfiguration)
        }
    }
}
