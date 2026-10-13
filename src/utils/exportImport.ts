import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { getAllDataForExport, importData } from '../db/Database';

export async function exportLibrary(): Promise<void> {
  const data = await getAllDataForExport();
  const json = JSON.stringify(data, null, 2);
  const path = FileSystem.documentDirectory + 'lyrics-library-export.json';
  await FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, { mimeType: 'application/json' });
  }
}

export async function importLibrary(): Promise<{ imported: number; skipped: number } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
  if (result.canceled || !result.assets || result.assets.length === 0) return null;
  if ((result.assets[0].size || 0) > 20 * 1024 * 1024) throw new Error('Choose a backup smaller than 20 MB.');
  const uri = result.assets[0].uri;
  const raw = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
  if (raw.length > 20 * 1024 * 1024) throw new Error('Choose a backup smaller than 20 MB.');
  const data = JSON.parse(raw);
  return importData(data);
}
