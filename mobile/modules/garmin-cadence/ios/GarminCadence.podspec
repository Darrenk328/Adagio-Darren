require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'GarminCadence'
  s.version        = package['version']
  s.summary        = package['description']
  s.homepage       = 'https://github.com/Darrenk328/Adagio-Darren'
  s.license        = 'MIT'
  s.author         = 'Adagio'
  # Garmin's ConnectIQ.xcframework itself only requires iOS 12.0 (checked
  # via its own Info.plist's MinimumOSVersion) — this just needs to not
  # exceed Adagio's actual Podfile deployment target (currently 13.4,
  # ios/Podfile.properties.json's ios.deploymentTarget). Setting this
  # higher than that silently excludes the whole pod from the build
  # ("garmin-cadence doesn't support iOS platform", no hard error) rather
  # than failing loudly — caught exactly that way once already.
  s.platforms      = { :ios => '13.4' }
  s.source         = { :git => 'https://github.com/Darrenk328/Adagio-Darren' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # ConnectIQ.xcframework is Garmin's own official, closed-source prebuilt
  # framework (github.com/garmin/connectiq-companion-app-sdk-ios @ 1.8.0),
  # vendored directly here rather than pulled in via Swift Package Manager.
  # Per Expo's own "wrap third-party native libraries" guidance, a podspec's
  # vendored_frameworks path can't traverse above the podspec's own
  # directory, so the framework lives under ios/Frameworks/ alongside this
  # file rather than e.g. at the repo root.
  s.vendored_frameworks = 'Frameworks/ConnectIQ.xcframework'

  # Keeping Swift sources in ios/src/ (not directly under ios/) so this
  # glob can't accidentally sweep up anything inside Frameworks/.
  s.source_files = 'src/**/*.{h,m,swift}'
end
