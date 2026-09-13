require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'AppleMusic'
  s.version        = package['version']
  s.summary        = package['description']
  s.homepage       = 'https://github.com/Darrenk328/Adagio-Darren'
  s.license        = 'MIT'
  s.author         = 'Adagio'
  # MusicKit itself needs iOS 15+, but this MUST stay at or below
  # Adagio's actual deployment target (13.4, ios/Adagio.xcodeproj's
  # IPHONEOS_DEPLOYMENT_TARGET) the same way garmin-cadence's podspec
  # does — set higher than that and CocoaPods silently drops the whole
  # pod from the build ("doesn't support iOS platform", no hard error).
  # AppleMusicModule.swift guards every MusicKit call with
  # `#available(iOS 15.0, *)` itself instead.
  s.platforms      = { :ios => '13.4' }
  s.source         = { :git => 'https://github.com/Darrenk328/Adagio-Darren' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # MusicKit and StoreKit are system frameworks (no vendoring needed,
  # unlike Garmin's ConnectIQ.xcframework) — just link them.
  s.frameworks = 'MusicKit', 'StoreKit'

  s.source_files = 'src/**/*.{h,m,swift}'
end
