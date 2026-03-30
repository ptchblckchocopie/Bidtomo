import { BRIDGE_URL, getAuthHeaders } from './_shared';

export async function deleteMedia(mediaId: string): Promise<boolean> {
  try {
    const response = await fetch(`${BRIDGE_URL}/api/bridge/media/${mediaId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      console.error('Failed to delete media:', response.status);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error deleting media:', error);
    return false;
  }
}

export async function uploadMedia(file: File): Promise<string | null> {
  try {
    const formData = new FormData();
    formData.append('file', file);

    // Auth via httpOnly cookie (credentials: 'include')
    // Don't set Content-Type — browser sets it with multipart boundary
    const response = await fetch(`${BRIDGE_URL}/api/bridge/media`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });

    if (!response.ok) {
      console.error('Failed to upload media:', response.status);
      const errorText = await response.text();
      console.error('Error details:', errorText);
      return null;
    }

    const data = await response.json();
    return data.doc?.id || data.id;
  } catch (error) {
    console.error('Error uploading media:', error);
    return null;
  }
}
