import { supabase } from './supabase';

export async function uploadModel(file: File, fileName: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from('models')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      console.error('Upload error:', error);
      return null;
    }

    return getModelUrl(data.path);
  } catch (error) {
    console.error('Upload failed:', error);
    return null;
  }
}

export function getModelUrl(path: string): string {
  const { data } = supabase.storage.from('models').getPublicUrl(path);
  return data.publicUrl;
}

export async function listModels(): Promise<string[]> {
  try {
    const { data, error } = await supabase.storage.from('models').list();

    if (error) {
      console.error('List error:', error);
      return [];
    }

    return data.map((file) => file.name);
  } catch (error) {
    console.error('List failed:', error);
    return [];
  }
}

export async function deleteModel(fileName: string): Promise<boolean> {
  try {
    const { error } = await supabase.storage.from('models').remove([fileName]);

    if (error) {
      console.error('Delete error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Delete failed:', error);
    return false;
  }
}
