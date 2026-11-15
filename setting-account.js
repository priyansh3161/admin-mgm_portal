import { requireAuth, loadProfile, saveProfile, saveAvatarUrl, changePassword, resetPasswordRequest, signOutEverywhere, supabase } from './auth.js';
  import { getNotificationPreferences, saveNotificationPreferences, requestBrowserNotifications, subscribeToBrowserPush } from './portal-notifications.js';
  import { VAPID_PUBLIC_KEY } from './push-config.js';
  const $ = (id) => document.getElementById(id);
  const darkModeToggle = $('darkModeToggle');
  const PORTAL_THEME_KEY = 'mgm_portal_dark_mode';
  let savedDarkMode = false;
  try {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${PORTAL_THEME_KEY}=([01])`));
    if (match) savedDarkMode = match[1] === '1';
    else savedDarkMode = localStorage.getItem(PORTAL_THEME_KEY) === '1';
  } catch (_) {
    try { savedDarkMode = localStorage.getItem(PORTAL_THEME_KEY) === '1'; } catch (_) {}
  }
  darkModeToggle.checked = savedDarkMode;
  document.documentElement.classList.toggle('portal-dark-mode', savedDarkMode);
  darkModeToggle.addEventListener('change', () => {
    const enabled = darkModeToggle.checked;
    document.documentElement.classList.toggle('portal-dark-mode', enabled);
    // Save from the settings page too, so the preference persists even if
    // the portal shell callback is unavailable (for example, when opened directly).
    try { localStorage.setItem(PORTAL_THEME_KEY, enabled ? '1' : '0'); } catch (_) {}
    try { document.cookie = `${PORTAL_THEME_KEY}=${enabled ? '1' : '0'}; Path=/; Max-Age=31536000; SameSite=Lax`; } catch (_) {}
    if (window.parent?.setPortalDarkMode) window.parent.setPortalDarkMode(enabled);
  });
  const compactViewToggle = $('compactViewToggle');
  const defaultLandingPage = $('defaultLandingPage');
  const PREFERENCES_KEY = 'mgm_portal_preferences';
  let savedPreferences = { compact: false, landingPage: 'dashboard' };
  try {
    const storedPreferences = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || '{}');
    if (storedPreferences && typeof storedPreferences === 'object') {
      savedPreferences = { ...savedPreferences, ...storedPreferences };
    }
  } catch (_) {}
  compactViewToggle.checked = Boolean(savedPreferences.compact);
  defaultLandingPage.value = savedPreferences.landingPage || 'dashboard';
  $('savePreferencesBtn').addEventListener('click', () => {
    const preferences = {
      compact: compactViewToggle.checked,
      landingPage: defaultLandingPage.value
    };
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
      savedPreferences = preferences;
      window.parent?.applyPortalPreferences?.(preferences);
      portalToast('Preferences saved.');
    } catch (error) {
      portalToast('Unable to save preferences: ' + (error.message || error), 'error');
    }
  });
  let currentAvatarUrl = '';
  let currentAvatarPublicId = '';
  let currentFullName = 'Student';
  let savedProfile = null;

  function renderAvatar(url, name = currentFullName) {
    const avatars = [$('setAvatar'), document.querySelector('.profile-mini .avatar')].filter(Boolean);
    avatars.forEach(avatar => {
      avatar.replaceChildren();
      if (url) {
        const image = document.createElement('img');
        image.src = url;
        image.alt = 'Profile picture';
        image.onerror = () => renderAvatar('', name);
        avatar.append(image);
      } else {
        avatar.textContent = (name || 'S').trim().charAt(0).toUpperCase() || 'S';
      }
    });
    try {
      const shellAvatar = window.parent.document.getElementById('avatarLetter');
      if (shellAvatar) {
        shellAvatar.replaceChildren();
        if (url) {
          const image = document.createElement('img');
          image.src = url;
          image.alt = 'Profile picture';
          image.onerror = () => { shellAvatar.textContent = (name || 'S').trim().charAt(0).toUpperCase() || 'S'; };
          shellAvatar.append(image);
        } else shellAvatar.textContent = (name || 'S').trim().charAt(0).toUpperCase() || 'S';
      }
    } catch { /* direct standalone settings page */ }
  }

  async function profileMediaAction(action, fields = {}) {
    const body = new FormData();
    body.set('action', action);
    Object.entries(fields).forEach(([key, value]) => body.set(key, value));
    const { data, error } = await supabase.functions.invoke('profile-media', { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  }

  const session = await requireAuth();
  const notificationUserId = session?.user?.id;
  const notificationInputs = [...document.querySelectorAll('[data-notification-category]')];
  const notificationStatus = $('browserNotificationStatus');
  const backgroundPushStatus = $('backgroundPushStatus');
  const notificationRealtimeStatus = $('notificationRealtimeStatus');
  const enableNotificationsButton = $('enableBrowserNotifications');
  const testNotificationsButton = $('testBrowserNotifications');
  let notificationPreferences = getNotificationPreferences(notificationUserId);
  const applyNotificationPreferences = () => {
    notificationInputs.forEach(input => {
      input.checked = Boolean(notificationPreferences[input.dataset.notificationCategory]);
    });
  };
  const persistNotificationPreferences = async () => {
    if (!notificationUserId) return;
    const { error } = await supabase.from('portal_notification_preferences').upsert({
      user_id: notificationUserId,
      attendance: Boolean(notificationPreferences.attendance),
      community: Boolean(notificationPreferences.community),
      academics: Boolean(notificationPreferences.academics),
      email_digest: Boolean(notificationPreferences.emailDigest)
    }, { onConflict: 'user_id' });
    if (error) throw error;
  };
  if (notificationUserId) {
    const { data: storedNotificationPreferences, error: preferenceLoadError } = await supabase
      .from('portal_notification_preferences')
      .select('attendance,community,academics,email_digest')
      .eq('user_id', notificationUserId)
      .maybeSingle();
    if (!preferenceLoadError && storedNotificationPreferences) {
      notificationPreferences = {
        ...notificationPreferences,
        attendance: storedNotificationPreferences.attendance,
        community: storedNotificationPreferences.community,
        academics: storedNotificationPreferences.academics,
        emailDigest: storedNotificationPreferences.email_digest
      };
      saveNotificationPreferences(notificationUserId, notificationPreferences);
    }
    if (!preferenceLoadError) {
      persistNotificationPreferences().catch(error => console.warn('Notification preferences could not be synced:', error.message));
    }
    applyNotificationPreferences();
    notificationInputs.forEach(input => input.addEventListener('change', async () => {
      notificationPreferences[input.dataset.notificationCategory] = input.checked;
      try {
        saveNotificationPreferences(notificationUserId, notificationPreferences);
        await persistNotificationPreferences();
      } catch (error) {
        portalToast('Unable to save notification preferences: ' + (error.message || error), 'error');
      }
    }));
  }
  function renderNotificationPermission() {
    if (!('Notification' in window)) {
      notificationStatus.textContent = 'This browser does not support browser notifications.';
      enableNotificationsButton.disabled = true;
      return;
    }
    const labels = { granted: 'Browser notification permission is allowed on this device.', denied: 'Notifications are blocked by your browser. Change this site’s permission in browser settings.', default: 'Allow notifications to receive alerts from this site.' };
    notificationStatus.textContent = labels[Notification.permission] || labels.default;
    enableNotificationsButton.textContent = 'Enable push on this device';
    enableNotificationsButton.disabled = Notification.permission === 'denied';
  }
  renderNotificationPermission();
  const iosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installedWebApp = navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  async function renderBackgroundPushStatus() {
    if (!window.isSecureContext) {
      backgroundPushStatus.textContent = 'Push notifications need a secure HTTPS connection.';
      return;
    }
    if (iosDevice && !installedWebApp) {
      backgroundPushStatus.textContent = 'On iPhone/iPad, add this site to the Home Screen and open it there to enable push.';
      return;
    }
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      backgroundPushStatus.textContent = 'Background push is not supported by this browser.';
      return;
    }
    if (!notificationUserId) {
      backgroundPushStatus.textContent = 'Sign in to connect this device to your account.';
      return;
    }
    if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.includes('PASTE_')) {
      backgroundPushStatus.textContent = 'Push server setup is incomplete: add the VAPID public key and matching Supabase secrets.';
      return;
    }
    try {
      const registration = await navigator.serviceWorker.getRegistration('./');
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) {
        backgroundPushStatus.textContent = 'This device is not subscribed yet. Enable push to connect it.';
        return;
      }
      const { data, error } = await supabase.from('portal_push_subscriptions')
        .select('endpoint').eq('user_id', notificationUserId).eq('endpoint', subscription.endpoint).maybeSingle();
      if (error) {
        backgroundPushStatus.textContent = error.code === '42P01' || error.code === 'PGRST205'
          ? 'Push database setup is missing. Run schema_web_push.sql in Supabase.'
          : 'Could not check the push subscription. Check the Supabase connection.';
        return;
      }
      backgroundPushStatus.textContent = data
        ? 'This device is connected for background push. Keep browser and device notifications enabled.'
        : 'This browser has a push subscription that is not linked to this account. Enable push to reconnect it.';
    } catch (error) {
      backgroundPushStatus.textContent = 'Could not check this device’s push status: ' + (error.message || error);
    }
  }
  void renderBackgroundPushStatus();
  const connectionKey = notificationUserId
    ? `mgm_portal_notifications_connection_${notificationUserId}`
    : '';
  const renderNotificationConnection = () => {
    const connectionState = connectionKey ? localStorage.getItem(connectionKey) : null;
    notificationRealtimeStatus.textContent = connectionState === 'connected'
      ? 'Live event connection is active.'
      : connectionState === 'error'
        ? 'Live event connection failed. Check Supabase Realtime configuration.'
        : 'Live event connection is starting. Reopen Settings in a moment to check it.';
  };
  renderNotificationConnection();
  window.addEventListener('storage', event => {
    if (event.key === connectionKey) renderNotificationConnection();
  });
  enableNotificationsButton.addEventListener('click', async () => {
    enableNotificationsButton.disabled = true;
    const oldLabel = enableNotificationsButton.textContent;
    enableNotificationsButton.textContent = 'Connecting…';
    try {
      if (!notificationUserId) throw new Error('Sign in before enabling push notifications.');
      if (!window.isSecureContext) throw new Error('Background push requires a secure HTTPS connection.');
      if (!('Notification' in window)) throw new Error('This browser does not support notifications.');
      let permission = Notification.permission;
      if (permission === 'default') {
        permission = window.parent?.requestPortalNotificationPermission
          ? await window.parent.requestPortalNotificationPermission()
          : await requestBrowserNotifications();
      }
      renderNotificationPermission();
      if (permission !== 'granted') throw new Error(permission === 'denied'
        ? 'Notifications are blocked. Allow this site in browser settings, then try again.'
        : 'Notification permission was not granted.');

      const subscription = await subscribeToBrowserPush(VAPID_PUBLIC_KEY);
      const { error } = await supabase.from('portal_push_subscriptions').upsert({
        user_id: notificationUserId,
        endpoint: subscription.endpoint,
        subscription
      }, { onConflict: 'endpoint' });
      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') {
          throw new Error('Push database setup is missing. Run schema_web_push.sql in Supabase.');
        }
        throw error;
      }
      await renderBackgroundPushStatus();
      backgroundPushStatus.textContent = 'Push is enabled on this device. Send a test push to confirm delivery.';
      portalToast('Background push enabled on this device.');
    } catch (error) {
      backgroundPushStatus.textContent = error.message || 'Unable to enable background push.';
      portalToast(backgroundPushStatus.textContent, 'error');
    } finally {
      enableNotificationsButton.disabled = !('Notification' in window) || Notification.permission === 'denied';
      enableNotificationsButton.textContent = oldLabel;
    }
  });
  testNotificationsButton.addEventListener('click', async () => {
    testNotificationsButton.disabled = true;
    const oldLabel = testNotificationsButton.textContent;
    testNotificationsButton.textContent = 'Sending…';
    try {
      if (!notificationUserId) throw new Error('Sign in before sending a test push.');
      if (!('Notification' in window)) throw new Error('This browser does not support notifications.');
      if (Notification.permission !== 'granted') throw new Error('Enable browser notifications on this device first.');
      const { data, error } = await supabase.functions.invoke('portal-push', { body: { type: 'TEST' } });
      if (error) throw new Error(error.message || 'The push function could not be reached.');
      if (!data?.sent) throw new Error('No push was delivered. Check this device’s subscription and Supabase push setup.');
      backgroundPushStatus.textContent = `Test push sent (${data.sent} device${data.sent === 1 ? '' : 's'}). Check the notification tray.`;
      portalToast('Test push sent. Check this device’s notifications.');
    } catch (error) {
      backgroundPushStatus.textContent = error.message || 'Unable to send a test push.';
      portalToast(backgroundPushStatus.textContent, 'error');
    } finally {
      testNotificationsButton.disabled = false;
      testNotificationsButton.textContent = oldLabel;
    }
  });
  if(session){
    try{
      const p = await loadProfile();
      currentFullName = p.full_name || session.user.email || 'Student';
      $('setName').value = p.full_name || '';
      $('setRoll').value = p.roll_no || '';
      $('setYear').value = p.year || '';
      $('setSemester').value = p.semester == null ? '' : String(p.semester);
      $('setEmail').value = p.email || '';
      $('setPersonalEmail').value = p.personal_email || '';
      $('setBio').value = p.bio || '';
      savedProfile = {
        full_name: $('setName').value,
        roll_no: $('setRoll').value,
        year: $('setYear').value,
        semester: $('setSemester').value,
        personal_email: $('setPersonalEmail').value,
        bio: $('setBio').value
      };
      const miniProfile = document.querySelector('.profile-mini .info');
      if (miniProfile) {
        miniProfile.querySelector('strong').textContent = currentFullName;
        miniProfile.querySelector('span').textContent = p.roll_no || '';
      }
      currentAvatarUrl = p.avatar_url || session.user.user_metadata?.avatar_url || '';
      currentAvatarPublicId = session.user.user_metadata?.avatar_public_id || '';
      renderAvatar(currentAvatarUrl);
    }catch(e){ portalToast('Unable to load profile: ' + e.message, 'error'); }
  }

  $('setName').addEventListener('input', () => {
    if (!currentAvatarUrl) renderAvatar('', $('setName').value || 'Student');
  });
  $('changePhotoBtn').addEventListener('click', () => $('avatarFile').click());
  $('avatarFile').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      portalToast('Choose a JPG, PNG, or WebP image.', 'error'); event.target.value = ''; return;
    }
    if (file.size > 5 * 1024 * 1024) {
      portalToast('The image must be 5 MB or smaller.', 'error'); event.target.value = ''; return;
    }
    const button = $('changePhotoBtn');
    button.disabled = true;
    let uploadedPublicId = '';
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading…';
    try {
      const oldPublicId = currentAvatarPublicId;
      const result = await profileMediaAction('upload_avatar', { file });
      uploadedPublicId = result.public_id;
      await saveAvatarUrl(result.secure_url, result.public_id);
      currentAvatarUrl = result.secure_url;
      currentAvatarPublicId = result.public_id;
      uploadedPublicId = '';
      renderAvatar(currentAvatarUrl);
      if (oldPublicId) {
        try { await profileMediaAction('delete_avatar', { public_id: oldPublicId }); }
        catch (error) { portalToast('Picture updated, but the previous Cloudinary image could not be deleted: ' + (error.message || error), 'error'); return; }
      }
      portalToast('Profile picture updated.');
    } catch (error) {
      if (uploadedPublicId) {
        try { await profileMediaAction('delete_avatar', { public_id: uploadedPublicId }); } catch { /* keep the upload error */ }
      }
      portalToast('Unable to upload profile picture: ' + (error.message || error), 'error');
    } finally {
      button.disabled = false;
      button.innerHTML = '<i class="fas fa-upload"></i> Change Photo';
      event.target.value = '';
    }
  });
  $('removePhotoBtn').addEventListener('click', async () => {
    if (!currentAvatarUrl) return;
    const button = $('removePhotoBtn'); button.disabled = true;
    try {
      const oldPublicId = currentAvatarPublicId;
      await saveAvatarUrl('');
      currentAvatarUrl = '';
      currentAvatarPublicId = '';
      renderAvatar('', $('setName').value || 'Student');
      if (oldPublicId) await profileMediaAction('delete_avatar', { public_id: oldPublicId });
      portalToast('Profile picture removed.');
    } catch (error) {
      portalToast('Unable to remove profile picture: ' + (error.message || error), 'error');
    } finally { button.disabled = false; }
  });

  $('saveProfileBtn').addEventListener('click', async () => {
    const button = $('saveProfileBtn');
    try{
      const profile = {
        full_name: $('setName').value,
        bio: $('setBio').value,
        personal_email: $('setPersonalEmail').value
      };
      button.disabled = true;
      await saveProfile(profile);
      savedProfile = {
        ...profile,
        roll_no: $('setRoll').value,
        year: $('setYear').value,
        semester: $('setSemester').value
      };
      currentFullName = $('setName').value.trim() || currentFullName;
      const miniProfile = document.querySelector('.profile-mini .info');
      if (miniProfile) {
        miniProfile.querySelector('strong').textContent = currentFullName;
        miniProfile.querySelector('span').textContent = $('setRoll').value.trim();
      }
      try {
        const shellName = window.parent.document.getElementById('profileName');
        const shellId = window.parent.document.getElementById('profileId');
        if (shellName) shellName.textContent = currentFullName;
        if (shellId) shellId.textContent = profile.roll_no.trim();
      } catch { /* direct standalone settings page */ }
      if (!currentAvatarUrl) renderAvatar('', currentFullName);
      portalToast('Profile saved.');
    }catch(e){ portalToast('Save failed: ' + e.message, 'error'); }
    finally { button.disabled = false; }
  });

  $('cancelProfileBtn').addEventListener('click', () => {
    if (!savedProfile) return;
    $('setName').value = savedProfile.full_name;
    $('setRoll').value = savedProfile.roll_no;
    $('setYear').value = savedProfile.year;
    $('setSemester').value = savedProfile.semester;
    $('setPersonalEmail').value = savedProfile.personal_email;
    $('setBio').value = savedProfile.bio;
    currentFullName = savedProfile.full_name || currentFullName;
    const miniProfile = document.querySelector('.profile-mini .info');
    if (miniProfile) {
      miniProfile.querySelector('strong').textContent = currentFullName;
      miniProfile.querySelector('span').textContent = savedProfile.roll_no || '';
    }
    if (!currentAvatarUrl) renderAvatar('', currentFullName);
  });

  $('updatePassBtn').addEventListener('click', async () => {
    if($('newPass').value !== $('confPass').value){ portalToast('The new passwords do not match.', 'error'); return; }
    try{
      await changePassword($('curPass').value, $('newPass').value);
      $('curPass').value = $('newPass').value = $('confPass').value = '';
      portalToast('Password updated.');
    }catch(e){ portalToast(e.message, 'error'); }
  });

  $('forgotSettingsPassBtn').addEventListener('click', async () => {
    const email = session?.user?.email;
    if (!email) { portalToast('Your account email could not be found. Please sign in again.', 'error'); return; }
    const button = $('forgotSettingsPassBtn');
    button.disabled = true;
    button.textContent = 'Sending reset link…';
    try {
      await resetPasswordRequest(email);
      portalToast('Password reset link sent to your registered email. Check your Spam/Junk folder too.');
    } catch (error) {
      portalToast('Unable to send reset link: ' + (error.message || error), 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Forgot current password?';
    }
  });

  $('forceLogoutBtn').addEventListener('click', async () => {
    if(await portalConfirm('Sign out of this account on all devices?', { danger: true, confirmText: 'Sign out everywhere' })) await signOutEverywhere();
  });
