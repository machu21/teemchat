package com.antigravity.virtualworld;

import android.graphics.Color;
import android.view.View;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Makes the Android status and navigation bars follow TeemChat's in-app theme
 * (which is separate from the phone's system theme). Sets the bar icon colour,
 * and the colour shown behind the bars when the WebView is inset rather than
 * drawn edge to edge (older WebView versions).
 */
@CapacitorPlugin(name = "ThemeBars")
public class ThemeBarsPlugin extends Plugin {

    @PluginMethod
    public void apply(PluginCall call) {
        boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        String color = call.getString("color");

        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            View decor = window.getDecorView();
            if (color != null) {
                try {
                    decor.setBackgroundColor(Color.parseColor(color));
                } catch (IllegalArgumentException ignored) {
                    // Bad colour string: keep the current background.
                }
            }
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decor);
            controller.setAppearanceLightStatusBars(!dark);
            controller.setAppearanceLightNavigationBars(!dark);
            call.resolve();
        });
    }
}
