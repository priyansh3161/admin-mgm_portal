export async function getEdgeFunctionErrorMessage(error, fallback = 'The server rejected the request.') {
  const context = error?.context;
  if (context && typeof context.clone === 'function') {
    try {
      const body = await context.clone().json();
      if (typeof body?.error === 'string' && body.error) return body.error;
      if (typeof body?.message === 'string' && body.message) return body.message;
    } catch { /* use the SDK message if the response is not JSON */ }
    if (context.status) return fallback + ' (HTTP ' + context.status + ')';
  }
  return error?.message || fallback;
}

export async function getCloudinaryUploadSignature(client, options) {
  const { data, error } = await client.functions.invoke('cloudinary-signature', { body: options });
  if (error) throw new Error(await getEdgeFunctionErrorMessage(error, 'Could not authorize this upload.'));
  if (data?.error) throw new Error(data.error);
  if (!data?.cloud_name || !data?.api_key || !data?.signature || !data?.timestamp || !data?.public_id || !data?.upload_preset) {
    throw new Error('The upload authorization response is incomplete.');
  }
  return data;
}

export function uploadSignedCloudinaryFile(signature, file, { filename, onProgress } = {}) {
  const form = new FormData();
  form.append('file', file, filename || file.name || 'upload.dat');
  for (const key of ['api_key', 'timestamp', 'public_id', 'upload_preset', 'overwrite', 'allowed_formats', 'signature']) {
    // Optional signature parameters must be omitted when absent. Sending the
    // literal string "undefined" changes Cloudinary's signed parameter set.
    if (signature[key] !== undefined && signature[key] !== null) {
      form.append(key, String(signature[key]));
    }
  }
  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(signature.cloud_name)}/${encodeURIComponent(signature.resource_type)}/upload`;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint);
    xhr.timeout = 180000;
    if (onProgress) xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(100, Math.round(event.loaded / event.total * 100)));
    };
    xhr.onload = () => {
      let payload = {};
      try { payload = JSON.parse(xhr.responseText || '{}'); } catch { /* report HTTP status below */ }
      if (xhr.status < 200 || xhr.status >= 300 || !payload.secure_url) {
        reject(new Error(payload.error?.message || `Cloudinary upload failed (HTTP ${xhr.status}).`));
        return;
      }
      resolve({ ...payload, cloud_name: signature.cloud_name });
    };
    xhr.onerror = () => reject(new Error('Browser could not reach Cloudinary.'));
    xhr.ontimeout = () => reject(new Error('Cloudinary upload timed out.'));
    xhr.onabort = () => reject(new Error('Cloudinary upload was cancelled.'));
    xhr.send(form);
  });
}
