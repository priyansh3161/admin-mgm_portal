export function makeRecoveryCodes(keywordBackup, recoveryBackup) {
  return {
    format: 'mgm-chat-recovery-v2',
    backup: recoveryBackup,
    keyword_backup: keywordBackup
  };
}

export function recoveryCodesBlob(recoveryCodes) {
  return new Blob([JSON.stringify(recoveryCodes, null, 2)], { type: 'application/json' });
}

export function downloadRecoveryCodes(recoveryCodes, filename = 'MGMCOET-Recovery-Codes.json') {
  const url = URL.createObjectURL(recoveryCodesBlob(recoveryCodes));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

