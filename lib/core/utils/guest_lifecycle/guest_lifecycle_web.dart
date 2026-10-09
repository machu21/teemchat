// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html;

void registerGuestBrowserExitListener(void Function() onExit) {
  try {
    html.window.addEventListener('beforeunload', (event) {
      onExit();
    });
    html.window.addEventListener('pagehide', (event) {
      onExit();
    });
  } catch (_) {}
}
