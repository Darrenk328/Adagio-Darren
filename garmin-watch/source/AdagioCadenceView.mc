import Toybox.WatchUi;
import Toybox.Graphics;
import Toybox.Activity;
import Toybox.Timer;
import Toybox.Lang;
import Toybox.Communications;

// Draws the current running cadence in the middle of the screen,
// refreshed once a second so the number always feels live — but only
// transmits to the paired phone at most once every
// TRANSMIT_MIN_INTERVAL_SEC, and skips the send entirely if cadence
// hasn't changed since the last one sent. A hard workout is an hour of
// continuous, mostly-steady cadence; sending every single second for
// that whole time (the original prototype's behavior, fine for a
// 60-second test) is unnecessary BLE traffic and battery draw for no
// real benefit — the phone-side voice-nudge feature this feeds only
// reacts to sustained drift over several seconds anyway, not
// single-tick blips, so a few seconds of latency costs nothing there.
//
// Units: Activity.Info.currentCadence already returns full steps/min for
// a Running-sport session — confirmed empirically (see
// garmin-cadence-prototype's testing/ for how this was verified against
// a known FIT-file cadence value). No *2 adjustment needed here, unlike
// the FIT file format itself, which does need doubling for real steps/min.
class AdagioCadenceView extends WatchUi.View {

    private const TRANSMIT_MIN_INTERVAL_SEC = 3;

    private var mTimer as Timer.Timer?;
    private var mListener as AdagioTransmitListener?;
    private var mLastCadence as Number?;
    private var mLastTransmittedCadence as Number?;
    // Starts already past the threshold so the very first available
    // reading transmits immediately, rather than waiting out a full
    // throttle interval before ever sending anything.
    private var mSecondsSinceLastTransmit as Number = TRANSMIT_MIN_INTERVAL_SEC;

    function initialize() {
        View.initialize();
        mListener = new AdagioTransmitListener();
    }

    function onLayout(dc as Graphics.Dc) as Void {
        // No layout resource — we draw directly in onUpdate.
    }

    function onShow() as Void {
        mTimer = new Timer.Timer();
        mTimer.start(method(:onTimerTick), 1000, true);
    }

    function onHide() as Void {
        if (mTimer != null) {
            mTimer.stop();
            mTimer = null;
        }
    }

    function onTimerTick() as Void {
        var info = Activity.getActivityInfo();
        mLastCadence = (info != null) ? info.currentCadence : null;
        mSecondsSinceLastTransmit += 1;

        if (mLastCadence != null && shouldTransmit()) {
            Communications.transmit(mLastCadence, null, mListener);
            mLastTransmittedCadence = mLastCadence;
            mSecondsSinceLastTransmit = 0;
        }

        WatchUi.requestUpdate();
    }

    private function shouldTransmit() as Lang.Boolean {
        if (mSecondsSinceLastTransmit < TRANSMIT_MIN_INTERVAL_SEC) {
            return false;
        }
        return mLastCadence != mLastTransmittedCadence;
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        dc.setColor(Graphics.COLOR_WHITE, Graphics.COLOR_BLACK);
        dc.clear();

        var label = (mLastCadence != null) ? mLastCadence.format("%d") : "--";

        dc.drawText(
            dc.getWidth() / 2,
            dc.getHeight() / 2,
            Graphics.FONT_NUMBER_HOT,
            label,
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER
        );
    }
}
