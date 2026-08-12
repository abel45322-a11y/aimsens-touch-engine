package com.aimsens.touchengine

import android.os.Bundle
import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Register custom native TouchEngine Kotlin plugin
        registerPlugin(TouchEnginePlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
