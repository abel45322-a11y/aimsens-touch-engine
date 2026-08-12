package com.aimsens.touchengine

import android.view.MotionEvent
import android.view.View
import android.view.Window
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray

@CapacitorPlugin(name = "TouchEnginePlugin")
class TouchEnginePlugin : Plugin() {

    private var isListening = false

    @PluginMethod
    fun startNativeTouchCapture(call: PluginCall) {
        val activity = activity ?: run {
            call.reject("Activity reference is null")
            return
        }

        activity.runOnUiThread {
            try {
                val window: Window = activity.window
                val decorView: View = window.decorView

                decorView.setOnTouchListener { _, event ->
                    handleNativeMotionEvent(event)
                    // Return false to allow web view to continue normal processing if desired,
                    // or true if capturing exclusively at OS view level.
                    false
                }

                isListening = true
                val ret = JSObject()
                ret.put("status", "LISTENING")
                ret.put("samplingHz", 180)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("Error attaching native MotionEvent listener", e)
            }
        }
    }

    @PluginMethod
    fun stopNativeTouchCapture(call: PluginCall) {
        val activity = activity ?: run {
            call.reject("Activity reference is null")
            return
        }

        activity.runOnUiThread {
            activity.window.decorView.setOnTouchListener(null)
            isListening = false
            val ret = JSObject()
            ret.put("status", "STOPPED")
            call.resolve(ret)
        }
    }

    /**
     * Captures high-frequency android.view.MotionEvent data including sub-frame historical points
     */
    private fun handleNativeMotionEvent(event: MotionEvent) {
        if (!isListening) return

        val data = JSObject()
        val actionString = when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> "down"
            MotionEvent.ACTION_MOVE -> "move"
            MotionEvent.ACTION_UP -> "up"
            MotionEvent.ACTION_CANCEL -> "cancel"
            else -> "other"
        }

        data.put("action", actionString)
        data.put("pointerCount", event.pointerCount)

        // Historical sub-frame touch points (Essential for 180Hz sampling on Oppo A58)
        val historicalArray = JSONArray()
        val historySize = event.historySize

        for (h in 0 until historySize) {
            val histPoint = JSObject()
            histPoint.put("x", event.getHistoricalX(0, h).toDouble())
            histPoint.put("y", event.getHistoricalY(0, h).toDouble())
            histPoint.put("pressure", event.getHistoricalPressure(0, h).toDouble())
            histPoint.put("timestamp", event.getHistoricalEventTime(h).toDouble())
            historicalArray.put(histPoint)
        }
        data.put("historical", historicalArray)

        // Current point data
        val pointsArray = JSONArray()
        for (i in 0 until event.pointerCount) {
            val pt = JSObject()
            pt.put("id", event.getPointerId(i))
            pt.put("x", event.getX(i).toDouble())
            pt.put("y", event.getY(i).toDouble())
            pt.put("pressure", event.getPressure(i).toDouble())
            pt.put("size", event.getSize(i).toDouble())
            pt.put("timestamp", event.eventTime.toDouble())
            pointsArray.put(pt)
        }
        data.put("points", pointsArray)

        // Dispatch low-latency event directly to JavaScript TouchEngine bridge
        notifyListeners("onTouchEvent", data)
    }
}
