import Toybox.Communications;
import Toybox.System;

// Minimal ConnectionListener for Communications.transmit() — both methods
// are required overrides per the API docs. Just logs to the debug
// console (visible in the simulator's console / over USB on a real
// device) rather than implementing a retry/queue strategy — a dropped
// cadence reading isn't worth retrying, the next one is a second away.
class AdagioTransmitListener extends Communications.ConnectionListener {

    function initialize() {
        Communications.ConnectionListener.initialize();
    }

    function onComplete() as Void {
    }

    function onError() as Void {
        System.println("Adagio: cadence transmit failed");
    }
}
