import 'file_picker_adapter.dart';

FilePickerAdapter createFilePickerAdapter() => FilePickerStub();

class FilePickerStub implements FilePickerAdapter {
  @override
  Future<PickedAudioFile?> pickAudioFile() async {
    return null;
  }
}
