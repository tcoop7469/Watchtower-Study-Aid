/**
 * Utility functions for handling, optimizing, and extracting images for Image Reference notes.
 */

export const processImageFile = (file: File | Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const rawDataUrl = e.target?.result as string;
      if (!rawDataUrl) {
        return reject(new Error('Failed to read image file'));
      }

      // If file is under 1.5MB or is SVG/GIF, return raw data URI immediately
      // This is instant, perfectly lossless, and avoids any canvas rasterization issues
      if (
        file.size < 1.5 * 1024 * 1024 || 
        file.type === 'image/svg+xml' || 
        file.type === 'image/gif'
      ) {
        return resolve(rawDataUrl);
      }

      // For large images (>1.5MB), resize using canvas to prevent localStorage quota issues
      const img = new Image();
      img.onload = () => {
        try {
          const MAX_DIM = 1600;
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;

          if (width > MAX_DIM || height > MAX_DIM) {
            if (width > height) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            } else {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            return resolve(rawDataUrl);
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          // Use PNG if original is PNG, otherwise JPEG
          const format = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
          const optimized = canvas.toDataURL(format, 0.85);
          resolve(optimized);
        } catch {
          // If canvas processing encounters an error, fallback safely to raw dataUrl
          resolve(rawDataUrl);
        }
      };

      img.onerror = () => {
        // Fallback to original dataUrl
        resolve(rawDataUrl);
      };

      img.src = rawDataUrl;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const extractImageFromClipboard = async (
  clipboardData: DataTransfer
): Promise<{ file?: File; url?: string } | null> => {
  if (!clipboardData) return null;

  // 1. Check direct files
  if (clipboardData.files && clipboardData.files.length > 0) {
    for (let i = 0; i < clipboardData.files.length; i++) {
      const file = clipboardData.files[i];
      if (file.type.startsWith('image/')) {
        return { file };
      }
    }
  }

  // 2. Check items for images
  if (clipboardData.items && clipboardData.items.length > 0) {
    for (let i = 0; i < clipboardData.items.length; i++) {
      const item = clipboardData.items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) return { file };
      }
    }
  }

  // 3. Check HTML for img src (common when copying pictures from websites like JW.org)
  const html = clipboardData.getData('text/html');
  if (html) {
    const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (match && match[1]) {
      const src = match[1];
      if (src.startsWith('http') || src.startsWith('data:image/')) {
        return { url: src };
      }
    }
  }

  // 4. Check plain text for image URL or data URI
  const text = clipboardData.getData('text/plain')?.trim();
  if (text) {
    if (
      text.startsWith('data:image/') ||
      text.startsWith('http://') ||
      text.startsWith('https://')
    ) {
      return { url: text };
    }
  }

  return null;
};

export const extractImageFromDrag = async (
  dataTransfer: DataTransfer
): Promise<{ file?: File; url?: string } | null> => {
  if (!dataTransfer) return null;

  // 1. Check files
  if (dataTransfer.files && dataTransfer.files.length > 0) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      const file = dataTransfer.files[i];
      if (file.type.startsWith('image/')) {
        return { file };
      }
    }
  }

  // 2. Check items
  if (dataTransfer.items && dataTransfer.items.length > 0) {
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) return { file };
      }
    }
  }

  // 3. Check HTML
  const html = dataTransfer.getData('text/html');
  if (html) {
    const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (match && match[1]) {
      return { url: match[1] };
    }
  }

  // 4. Check URI list or plain text
  const uri = dataTransfer.getData('text/uri-list')?.trim();
  if (uri && (uri.startsWith('http') || uri.startsWith('data:image/'))) {
    return { url: uri };
  }

  const text = dataTransfer.getData('text/plain')?.trim();
  if (text && (text.startsWith('http') || text.startsWith('data:image/'))) {
    return { url: text };
  }

  return null;
};
