import { useState } from 'react';
import { Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { uploadModel } from '../lib/modelStorage';

export default function ModelUpload() {
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      setError('File size must be under 50MB');
      return;
    }

    const validTypes = [
      'model/gltf-binary',
      'model/gltf+json',
      'application/octet-stream',
      '.glb',
      '.gltf',
      '.obj',
      '.fbx'
    ];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!validTypes.includes(file.type) && !validTypes.includes(fileExtension)) {
      setError('Please upload a GLB, GLTF, OBJ, or FBX file');
      return;
    }

    setUploading(true);
    setError(null);
    setUploadedUrl(null);

    const fileName = `mascot-${Date.now()}.${file.name.split('.').pop()}`;
    const url = await uploadModel(file, fileName);

    setUploading(false);

    if (url) {
      setUploadedUrl(url);
    } else {
      setError('Upload failed. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-8">
      <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 rounded-2xl p-8 max-w-md w-full">
        <h1 className="text-3xl font-bold text-white mb-6 text-center">
          Upload 3D Mascot Model
        </h1>

        <div className="space-y-6">
          <div className="bg-slate-700/30 rounded-lg p-4 text-sm text-slate-300">
            <p className="font-semibold mb-2">Accepted formats:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>GLB (recommended)</li>
              <li>GLTF</li>
              <li>OBJ</li>
              <li>FBX</li>
            </ul>
            <p className="mt-2">Max size: 50MB</p>
          </div>

          <label className="block">
            <div className="border-2 border-dashed border-slate-600 hover:border-purple-500 transition-colors rounded-lg p-8 text-center cursor-pointer">
              <input
                type="file"
                className="hidden"
                onChange={handleFileChange}
                accept=".glb,.gltf,.obj,.fbx"
                disabled={uploading}
              />

              {uploading ? (
                <div className="flex flex-col items-center space-y-3">
                  <Loader2 className="w-12 h-12 text-purple-400 animate-spin" />
                  <p className="text-slate-300">Uploading...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center space-y-3">
                  <Upload className="w-12 h-12 text-slate-400" />
                  <p className="text-slate-300">Click to select file</p>
                  <p className="text-sm text-slate-500">or drag and drop</p>
                </div>
              )}
            </div>
          </label>

          {error && (
            <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-200 text-sm">{error}</p>
            </div>
          )}

          {uploadedUrl && (
            <div className="bg-green-500/20 border border-green-500 rounded-lg p-4 space-y-3">
              <div className="flex items-start space-x-3">
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <p className="text-green-200 text-sm">Upload successful!</p>
              </div>
              <div className="bg-slate-900/50 rounded p-2 break-all">
                <p className="text-xs text-slate-400 mb-1">URL:</p>
                <p className="text-xs text-slate-300 font-mono">{uploadedUrl}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
