import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;
import Toybox.Activity;
import Toybox.ActivityRecording;
import Toybox.System;

// Adagio's Connect IQ Watch App entry point. Owns the
// ActivityRecording.Session lifecycle (start on app launch, save on
// exit) — AdagioCadenceView just reads live info via
// Activity.getActivityInfo(), which is only populated with real sensor
// data while a recording session is active.
//
// The session is now SAVED (not discarded) on exit, with a real
// GPS-tracking sport type — so a run recorded with this app gets real
// distance/pace/mileage in Garmin Connect, same as Garmin's own native
// Run activity would. Deliberately NOT building a direct Strava API
// integration for this: Garmin Connect already has an official Strava
// auto-sync (user-side one-time link, Garmin Connect app > Settings >
// Connected Apps > Strava) — any activity saved here rides that for
// free. The :name field is the actual attribution lever we control; it
// becomes the activity's title on both Garmin Connect and Strava.
class AdagioApp extends Application.AppBase {

    private var mSession as ActivityRecording.Session?;

    function initialize() {
        AppBase.initialize();
    }

    function onStart(state as Dictionary?) as Void {
        // SUB_SPORT_GENERIC, not SUB_SPORT_INDOOR_RUNNING — this used to
        // be indoor-only because the app only read accelerometer-derived
        // cadence and never position, so GPS was pointless overhead (and
        // indoor mode suppresses the GPS search entirely). Now that a
        // real run needs distance/pace/mileage, GPS has to actually be
        // requested — SUB_SPORT_GENERIC is a plain outdoor default,
        // distinct from SUB_SPORT_INDOOR_RUNNING which would still
        // suppress it.
        var started = false;
        mSession = ActivityRecording.createSession({
            :name => "Run with Adagio",
            :sport => Activity.SPORT_RUNNING,
            :subSport => Activity.SUB_SPORT_GENERIC,
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
            mSession.save();
        }
    }

    function getInitialView() as [Views] or [Views, InputDelegates] {
        return [new AdagioCadenceView()];
    }
}
