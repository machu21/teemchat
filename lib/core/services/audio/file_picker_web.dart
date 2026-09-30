// ignore: avoid_web_libraries_in_flutter
import 'dart:async';
// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html;
import 'file_picker_adapter.dart';

FilePickerAdapter createFilePickerAdapter() => FilePickerWeb();

class FilePickerWeb implements FilePickerAdapter {
  @override
  Future<PickedAudioFile?> pickAudioFile() {
    final completer = Completer<PickedAudioFile?>();
    final uploadInput = html.FileUploadInputElement()
      ..accept = 'audio/mp3,audio/mpeg,audio/wav,audio/ogg,audio/m4a,.mp3,.wav,.ogg,.m4a'
      ..multiple = false;

    uploadInput.click();

    uploadInput.onChange.listen((e) {
      final files = uploadInput.files;
      if (files == null || files.isEmpty) {
        completer.complete(null);
        return;
      }

      final file = files[0];
      final reader = html.FileReader();

      reader.onLoadEnd.listen((_) {
        try {
          final result = reader.result;
          final bytes = (result as List<dynamic>).cast<int>();
          final blob = html.Blob([bytes], file.type.isNotEmpty ? file.type : 'audio/mpeg');
          final blobUrl = html.Url.createObjectUrlFromBlob(blob);

          completer.complete(
            PickedAudioFile(
              name: file.name,
              url: blobUrl,
              bytes: bytes,
            ),
          );
        } catch (err) {
          completer.complete(null);
        }
      });

      reader.onError.listen((_) {
        completer.complete(null);
      });

      reader.readAsArrayBuffer(file);
    });

    return completer.future;
  }
}
