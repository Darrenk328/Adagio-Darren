import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;
import Toybox.Activity;
import Toybox.ActivityRecording;
import Toybox.System;

// Adagio's Connect IQ Watch App entry point. Owns the
// ActivityRecording.Session lifecycle (start on app launch, discard on
// exit) — AdagioCadenceView just reads live info via
// Activity.getActivityInfo(), which is only populated with real sensor
// data while a recording session is active.
//
// Recorded data is discarded (not saved) on exit — this app exists to
// feed live cadence into the Adagio phone app during a workout, not to
// duplicate Garmin's own activity-recording/history features.
class AdagioApp extends Application.AppBase {

    private var mSession as ActivityRecording.Session?;

    function initialize() {
        AppBase.initialize();
    }

    function onStart(state as Dictionary?) as Void {
        // SUB_SPORT_INDOOR_RUNNING, not SUB_SPORT_STREET — this app only
        // ever reads accelerometer-derived cadence (Activity.Info.currentCadence),
        // never position, so there's no reason to ask the OS to acquire
        // GPS at all. SUB_SPORT_STREET (an outdoor/GPS subtype) triggers
        // the watch's standard GPS-search status icon indefinitely
        // indoors, for zero benefit to an app that never reads position
        // (confirmed on a real Forerunner 55, in the original prototype).
        var started = false;
        mSession = ActivityRecording.createSession({
            :name => "Adagio",
            :sport => Activity.SPORT_RUNNING,
            :subSport => Activity.SUB_SPORT_INDOOR_RUNNING,
        });
        started = mSession.start();
        if (!started) {
            // No user-facing surface for this today (no error state in
            // AdagioCadenceView) — logged so it's at least visible over
            // USB/simulator console rather than silently failing. The
            // prototype never checked this return value at all.
            System.println("Adagio: ActivityRecording session failed to start");
        }
    }

    function onStop(state as Dictionary?) as Void {
        if (mSession != null && mSession.isRecording()) {
            mSession.stop();
        }
        if (mSession != null) {
            mSession.discard();
        }
    }

    function getInitialView() as [Views] or [Views, InputDelegates] {
        return [new AdagioCadenceView()];
    }
}
