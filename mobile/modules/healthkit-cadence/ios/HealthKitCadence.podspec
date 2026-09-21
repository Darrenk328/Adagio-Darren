require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'HealthKitCadence'
  s.version        = package['version']
  s.summary        = package['description']
  s.homepage       = 'https://github.com/Darrenk328/Adagio-Darren'
  s.license        = 'MIT'
  s.author         = 'Adagio'
  # Must stay at or below Adagio's actual deployment target (13.4,
  # ios/Adagio.xcodeproj's IPHONEOS_DEPLOYMENT_TARGET) — see
  # AppleMusic.podspec's comment for what happens if a pod's platform
  # exceeds it (CocoaPods silently drops the whole pod, no error).
  # HKWorkoutSession/HKLiveWorkoutBuilder themselves are much older than
  # 13.4, so this isn't the live constraint MusicKit was; kept explicit
  # for consistency with the other local modules.
  s.platforms      = { :ios => '13.4' }
  s.source         = { :git => 'https://github.com/Darrenk328/Adagio-Darren' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Both system frameworks — no vendoring needed. WatchConnectivity is
  # only used for the paired / app-installed flags (WatchStatusBridge).
  s.frameworks = 'HealthKit', 'WatchConnectivity'

  s.source_files = 'src/**/*.{h,m,swift}'
end
