import 'file_picker_stub.dart' if (dart.library.html) 'file_picker_web.dart';

class PickedAudioFile {
  final String name;
  final String url;
  final List<int> bytes;

  PickedAudioFile({
    required this.name,
    required this.url,
    required this.bytes,
  });
}

abstract class FilePickerAdapter {
  factory FilePickerAdapter() => createFilePickerAdapter();

  Future<PickedAudioFile?> pickAudioFile();
}
