// auth.js
import { supabase } from './supabase-config.js';
import {
  createIdentity, restoreIdentity,
  rewrapRecoveryIdentity, rewrapIdentityForRecovery, refreshRecoveryIdentity,
  getLocalPrivateKey, saveLocalPrivateKey, wipeLocalKeys
} from './e2ee.js';
import { getConversationKey, encryptPayload, toB64 } from './chat-crypto.js';
import { installDeveloperToolsGuard } from './devtools-guard.js';

const firebaseConfig = {
  apiKey: "AIzaSyDT5PWeMm85EScNPaxU6QoE4VoISPAg4eQ",
  authDomain: "mgm-coet-unoffical.firebaseapp.com",
  databaseURL: "https://mgm-coet-unoffical-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "mgm-coet-unoffical",
  storageBucket: "mgm-coet-unoffical.firebasestorage.app",
  messagingSenderId: "456186174768",
  appId: "1:456186174768:web:bfb84d17df5ca242ee3cf5",
  measurementId: "G-2PSJWK1GNM"
};

// Load Firebase only when verification runs, so a blocked Firebase CDN does
// not prevent the rest of the portal modules and their button handlers from starting.
let firebaseAuthPromise;
function getFirebaseAuth() {
  if (!firebaseAuthPromise) {
    firebaseAuthPromise = Promise.all([
      import("https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js")
    ]).then(([appModule, authModule]) => {
      const app = appModule.getApps().find((item) => item.name === 'portal-email-auth')
        || appModule.initializeApp(firebaseConfig, 'portal-email-auth');
      return { auth: authModule.getAuth(app), ...authModule };
    }).catch(error => {
      firebaseAuthPromise = null;
      throw error;
    });
  }
  return firebaseAuthPromise;
}

export { supabase };

const SECURITY_NOTICE_SIGNOUT_KEY = 'mgm-security-notice-signout';
let manualSignOutInProgress = false;
let manualSignOutPromise = null;
installDeveloperToolsGuard(signOutForSecurityNotice);

const APP_URL = 'https://student-omega-fawn.vercel.app';
const PRODUCTION_LOGIN_URL = `${APP_URL}/login.html`;
const LOGIN_PAGE = 'login.html';
const HOME_PAGE = 'index.html';
const COET_EMAIL = /^[^\s@]+@coet\.in$/i;
let currentAccessRole = '';

function normalizedEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isStudentEmail(email) {
  return COET_EMAIL.test(normalizedEmail(email));
}

function requireLoginEmail(email) {
  const normalized = normalizedEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('Enter a valid email address.');
  return normalized;
}

function requireCoetEmail(email) {
  const normalized = normalizedEmail(email);
  if (!COET_EMAIL.test(normalized)) throw new Error('Only an @coet.in student email address is allowed.');
  return normalized;
}

async function requireStaffAccount(userId) {
  const { data: staff, error } = await supabase.from('academic_staff')
    .select('role').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!['admin', 'subadmin'].includes(staff?.role || '')) {
    throw new Error('This account is not assigned an academic staff role.');
  }
  return staff.role;
}

/* ============ Session ============ */

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    let returnTo = window.location.href;
    try { returnTo = window.top.location.href; } catch { /* use the current page */ }
    redirectToLogin(returnTo);
    return null;
  }
  const studentAccount = isStudentEmail(session.user.email);
  let staffRole = '';
  if (!studentAccount) {
    try { staffRole = await requireStaffAccount(session.user.id); }
    catch {
      await supabase.auth.signOut();
      (window.top || window).location.replace(LOGIN_PAGE);
      return null;
    }
  }
  currentAccessRole = staffRole || (studentAccount ? 'student' : '');
  const currentPage = window.location.pathname.split('/').pop().toLowerCase();
  if (studentAccount && currentPage !== 'google-profile.html') {
    const { data: studentProfile, error: profileError } = await supabase.from('profiles')
      .select('roll_no').eq('id', session.user.id).maybeSingle();
    if (!profileError && !studentProfile?.roll_no) {
      const setupUrl = new URL('/google-profile.html', window.location.origin);
      const returnTo = safeReturnTarget(window.location.href);
      if (returnTo) setupUrl.searchParams.set('returnTo', returnTo);
      (window.top || window).location.replace(setupUrl.href);
      return null;
    }
  }

  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      if (manualSignOutInProgress || window !== window.top) return;
      // A DevTools deterrent sign-out should end the session without deleting
      // the user's locally stored E2EE identity keys.
      try {
        if (sessionStorage.getItem(SECURITY_NOTICE_SIGNOUT_KEY) === '1') return;
      } catch { /* continue with normal key cleanup when storage is unavailable */ }
      // A remote sign-out must not wait for IndexedDB key cleanup to navigate.
      wipeLocalKeys(session.user.id).catch(() => {});
      goToLogin();
    }
  });
  return session;
}

export async function redirectIfLoggedIn() {
  const session = await getSession();
  if (!session) return false;
  let staffRole = '';
  if (isStudentEmail(session.user.email)) {
    staffRole = 'student';
  } else {
    try { staffRole = await requireStaffAccount(session.user.id); }
    catch { await supabase.auth.signOut(); return false; }
  }
  currentAccessRole = staffRole;
  window.location.replace(getPostLoginTarget(session.user.email, staffRole));
  return true;
}

function safeReturnTarget(value) {
  try {
    const target = new URL(String(value || ''), window.location.href);
    if (target.origin !== window.location.origin || ['/login.html', '/signup.html'].includes(target.pathname)) return '';
    return target.href;
  } catch { return ''; }
}

export function getPostLoginTarget(email = '', accessRole = '') {
  const requested = new URLSearchParams(window.location.search).get('returnTo');
  const target = safeReturnTarget(requested);
  const role = accessRole || currentAccessRole;
  if (['admin', 'subadmin'].includes(role) && target && new URL(target).pathname.toLowerCase().endsWith('/google-profile.html')) return HOME_PAGE;
  return target || HOME_PAGE;
}

export function setRememberDevice(remember) {
  try { localStorage.setItem('mgm-portal-remember-device', remember ? 'true' : 'false'); }
  catch { /* use the per-tab setting below when persistent storage is unavailable */ }
  try { sessionStorage.setItem('mgm-portal-remember-device', remember ? 'true' : 'false'); }
  catch { /* session storage may also be restricted */ }
}

export function redirectToLogin(returnTo = window.location.href) {
  const loginUrl = new URL(LOGIN_PAGE, window.location.href);
  const safeTarget = safeReturnTarget(returnTo);
  if (safeTarget) loginUrl.searchParams.set('returnTo', safeTarget);
  (window.top || window).location.replace(loginUrl.href);
}

function goToLogin() {
  const target = window.top || window;
  try {
    const currentUrl = new URL(target.location.href);
    if (currentUrl.pathname.toLowerCase().endsWith('/login.html')) return;
    if (target.__mgmLoginRedirectStarted) return;
    target.__mgmLoginRedirectStarted = true;
    target.location.replace(new URL(LOGIN_PAGE, currentUrl).href);
  } catch {
    target.location.replace(LOGIN_PAGE);
  }
}

/* ============ Sign up ============ */

export async function signUp({ name, email, password, keyword, roll, branch, year, semester }) {
  if (typeof password !== 'string' || password.length < 12) {
    throw new Error('Create a password with at least 12 characters.');
  }
  if (!keyword || keyword.trim().length < 6) {
    throw new Error('The security keyword must contain at least 6 characters.');
  }

  const cleanEmail = requireCoetEmail(email);

  // 1. E2EE Keys generate karo
  const identity = await createIdentity(keyword, password);

  // 2. Supabase mein user profile, roll number aur keys save karo
  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      emailRedirectTo: PRODUCTION_LOGIN_URL,
      data: {
        full_name: name.trim(),
        roll_no: roll.trim(),
        branch, year, semester,
        public_key: identity.publicJwk,
        key_backup: identity.backup
      }
    }
  });
  if (error) throw error;

  if (data.user && data.user.identities?.length === 0) {
    throw new Error('Unable to create the account. Check your details or sign in.');
  }

  if (data.user) await saveLocalPrivateKey(data.user.id, identity.privateKey);

  // 3. Send Firebase verification. Reuse an existing unverified Firebase
  // account on retries instead of silently losing the email to
  // auth/email-already-in-use.
  let emailVerificationSent = false;
  let emailAlreadyVerified = false;
  let emailVerificationError = '';
  try {
    const result = await sendFirebaseVerification(cleanEmail, password, { createIfMissing: true });
    emailAlreadyVerified = result.alreadyVerified;
    emailVerificationSent = !result.alreadyVerified;
  } catch (fbErr) {
    emailVerificationError = describeFirebaseEmailError(fbErr);
    console.error('Firebase verification email failed:', fbErr.code || fbErr.message, fbErr);
  }

  await supabase.auth.signOut();
  if (data.user) { try { await wipeLocalKeys(data.user.id); } catch { /* signup remains complete */ } }
  return {
    needsEmailConfirm: true, emailVerificationSent, emailAlreadyVerified, emailVerificationError,
    keywordBackup: identity.backup,
    recoveryBackup: identity.recoveryBackup
  };
}

/* ============ Sign in ============ */

export async function startGoogleSignIn(rememberDevice = true) {
  setRememberDevice(rememberDevice);
  const callback = new URL('login.html', window.location.href);
  callback.searchParams.set('oauth', 'google');
  const returnTo = new URLSearchParams(window.location.search).get('returnTo');
  const safeTarget = safeReturnTarget(returnTo);
  if (safeTarget) callback.searchParams.set('returnTo', safeTarget);
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callback.href,
      queryParams: { prompt: 'select_account' }
    }
  });
  if (error) throw error;
}

export async function handleGoogleOAuthRedirect() {
  if (new URLSearchParams(window.location.search).get('oauth') !== 'google') return false;
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.user) throw new Error('Google sign-in could not be completed. Please try again.');
  const email = normalizedEmail(session.user.email);
  if (!session.user.email_confirmed_at) {
    await supabase.auth.signOut();
    throw new Error('Use a verified @coet.in student account or an approved staff account.');
  }
  if (!isStudentEmail(email)) {
    let staffRole;
    try { staffRole = await requireStaffAccount(session.user.id); }
    catch {
      await supabase.auth.signOut();
      throw new Error('This account is not assigned an academic staff role.');
    }
    currentAccessRole = staffRole;
    window.location.replace(getPostLoginTarget(email, staffRole));
    return true;
  }
  currentAccessRole = 'student';

  const { data: profile, error: profileError } = await supabase.from('profiles')
    .select('id,roll_no').eq('id', session.user.id).maybeSingle();
  if (profileError) throw new Error('Unable to check your student profile. Please try again.');
  if (profile?.roll_no) window.location.replace(getPostLoginTarget());
  else {
    const setupUrl = new URL('google-profile.html', window.location.href);
    const target = safeReturnTarget(new URLSearchParams(window.location.search).get('returnTo'));
    if (target) setupUrl.searchParams.set('returnTo', target);
    window.location.replace(setupUrl.href);
  }
  return true;
}

export async function completeGoogleProfile({ full_name, roll_no, branch, year, semester, password, keyword }) {
  const session = await getSession();
  if (!session?.user) throw new Error('Please sign in with Google again.');
  requireCoetEmail(session.user.email);
  if (!session.user.email_confirmed_at) throw new Error('Verify your @coet.in Google account first.');
  const name = String(full_name || '').trim();
  const roll = String(roll_no || '').trim();
  const cleanBranch = String(branch || '').trim();
  const cleanYear = String(year || '').trim();
  const cleanSemester = String(semester || '').trim();
  if (!name || name.length > 100 || !roll || roll.length > 32 || !cleanBranch || cleanBranch.length > 100) {
    throw new Error('Enter your name, roll number, and branch.');
  }
  if (!['1st Year', '2nd Year', '3rd Year', '4th Year'].includes(cleanYear) || !/^[1-8]$/.test(cleanSemester)) {
    throw new Error('Select a valid year and semester.');
  }
  if (String(password || '').length < 12) throw new Error('Create a portal password with at least 12 characters.');
  if (String(keyword || '').trim().length < 6) throw new Error('The security keyword must contain at least 6 characters.');

  const { error: passwordError } = await supabase.auth.updateUser({ password });
  if (passwordError) throw passwordError;
  const identity = await createIdentity(keyword, password);
  const { error: profileError } = await supabase.rpc('complete_google_student_profile', {
    p_full_name: name, p_roll_no: roll, p_branch: cleanBranch, p_year: cleanYear,
    p_semester: cleanSemester, p_public_key: identity.publicJwk,
    p_wrapped_key: identity.backup.wrapped_key, p_salt: identity.backup.salt,
    p_iv: identity.backup.iv, p_iterations: identity.backup.iterations
  });
  if (profileError) {
    if (profileError.code === '23505') throw new Error('That roll number is already linked to another portal account.');
    throw profileError;
  }
  let localKeySaved = true;
  try { await saveLocalPrivateKey(session.user.id, identity.privateKey); }
  catch { localKeySaved = false; }
  const { error: metadataError } = await supabase.auth.updateUser({ data: { full_name: name, roll_no: roll, branch: cleanBranch, year: cleanYear, semester: cleanSemester } });
  if (metadataError) console.warn('Profile saved, but Google account metadata could not be synced:', metadataError.message);
  return { user: session.user, keywordBackup: identity.backup, recoveryBackup: identity.recoveryBackup, localKeySaved };
}

export async function signIn({ id, password }) {
  if (!String(id || '').trim() || !password) throw new Error('Enter your roll number/email and password.');
  const { data: loginResult, error: loginError } = await supabase.functions.invoke('portal-login', {
    body: { identifier: String(id).trim(), password }
  });
  if (loginError || !loginResult?.session) {
    throw new Error(loginResult?.error || 'Invalid roll number/email or password.');
  }
  const { data: authResult, error: sessionError } = await supabase.auth.setSession(loginResult.session);
  if (sessionError || !authResult.session?.user) {
    await supabase.auth.signOut();
    throw new Error('Invalid roll number/email or password.');
  }
  const user = authResult.session.user;
  const email = normalizedEmail(user.email);
  const studentAccount = isStudentEmail(email);

  // 1. Firebase se check karo ki user ne email verify kiya hai ya nahi
  if (studentAccount) {
    try {
      const firebase = await getFirebaseAuth();
      const fbCred = await firebase.signInWithEmailAndPassword(firebase.auth, email, password);
      await firebase.reload(fbCred.user);
      if (!fbCred.user.emailVerified) {
        await supabase.auth.signOut();
        currentAccessRole = '';
        try { await firebase.signOut(firebase.auth); } catch { /* keep the portal session signed out */ }
        throw new Error('EMAIL_NOT_VERIFIED');
      }
      await firebase.signOut(firebase.auth);
    } catch (fbErr) {
      if (fbErr.message === 'EMAIL_NOT_VERIFIED') {
        throw new Error('Please verify your email address first! Check your inbox for the verification link.');
      }
    }
  }

  // The server resolves roll numbers without returning the account email until
  // Supabase Auth has accepted the password.
  let staffRole = '';
  if (!studentAccount) {
    try { staffRole = await requireStaffAccount(user.id); }
    catch (staffError) {
      await supabase.auth.signOut();
      throw staffError;
    }
  }
  currentAccessRole = staffRole || (studentAccount ? 'student' : '');

  const e2eeReady = await hasLocalKey(user.id);
  if (e2eeReady) await cleanupSignupMetadata(user);
  return { user, e2eeReady, staffRole };
}

function describeFirebaseEmailError(error) {
  const code = String(error?.code || '');
  if (code === 'auth/operation-not-allowed') {
    return 'Email/password sign-in is disabled in the authentication settings.';
  }
  if (code === 'auth/unauthorized-continue-uri' || code === 'auth/invalid-continue-uri') {
    return 'The verification return URL is not allowed. Add student-omega-fawn.vercel.app to the authentication provider’s authorized domains.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Email requests were temporarily limited. Wait a little and try again.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account already exists for this email, but its password did not match. Use the same password as your portal account or contact support.';
  }
  if (code === 'auth/user-not-found' || code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
    return 'We could not verify these credentials. Check the email and password, then try again.';
  }
  // Keep provider-specific diagnostics in the console only; signup UI stays
  // provider-neutral and does not expose raw authentication error text.
  return 'The verification service could not send the email. Please try again later.';
}

async function sendFirebaseVerification(email, password, { createIfMissing = false } = {}) {
  const firebase = await getFirebaseAuth();
  let credential;
  if (!createIfMissing) {
    credential = await firebase.signInWithEmailAndPassword(firebase.auth, email, password);
  } else {
    try {
      credential = await firebase.createUserWithEmailAndPassword(firebase.auth, email, password);
    } catch (error) {
      if (error?.code !== 'auth/email-already-in-use') throw error;
      credential = await firebase.signInWithEmailAndPassword(firebase.auth, email, password);
    }
  }

  try {
    await firebase.reload(credential.user);
    const alreadyVerified = Boolean(credential.user.emailVerified);
    if (!alreadyVerified) {
      await firebase.sendEmailVerification(credential.user, {
        url: PRODUCTION_LOGIN_URL,
        handleCodeInApp: false
      });
    }
    return { alreadyVerified };
  } finally {
    try { await firebase.signOut(firebase.auth); }
    catch (error) { console.warn('Firebase sign-out after verification request failed:', error?.message || error); }
  }
}

export async function resendVerificationEmail({ id, password }) {
  if (!id?.trim() || !password) throw new Error('Enter your roll number/email and password first.');
  if (!id.includes('@')) throw new Error('Enter your @coet.in email address to resend verification.');
  const email = requireCoetEmail(id);
  let result;
  try {
    result = await sendFirebaseVerification(email, password);
  } catch (error) {
    const mayNeedFirebaseAccount = ['auth/user-not-found', 'auth/invalid-credential', 'auth/wrong-password']
      .includes(error?.code);
    if (!mayNeedFirebaseAccount) throw new Error(describeFirebaseEmailError(error));

    // If the portal account exists but its Firebase identity was never created
    // (for example Firebase was unavailable during signup), verify the portal
    // credentials before creating that Firebase identity here.
    const { error: portalError } = await supabase.auth.signInWithPassword({ email, password });
    if (portalError) {
      throw new Error('Could not verify your portal credentials to set up email verification. Check your password and confirm any portal email link first.');
    }
    try {
      result = await sendFirebaseVerification(email, password, { createIfMissing: true });
    } catch (firebaseError) {
      throw new Error(describeFirebaseEmailError(firebaseError));
    } finally {
      await supabase.auth.signOut();
    }
  }
  return { email, ...result, sent: !result.alreadyVerified };
}

/* ============ E2EE unlock ============ */

export async function hasLocalKey(userId) {
  try { return !!(await getLocalPrivateKey(userId)); } catch { return false; }
}

export async function unlockWithKeyword(keyword) {
  const session = await getSession();
  if (!session) throw new Error('NOT_LOGGED_IN');
  const user = session.user;

  const { data: backup, error } = await supabase
    .from('key_backups').select('*').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  if (!backup) throw new Error('NO_BACKUP');

  const key = await restoreIdentity(backup, keyword);
  await saveLocalPrivateKey(user.id, key);
  try { await cleanupSignupMetadata(user); } catch { /* ignore */ }
  return key;
}

export async function unlockWithRecoveryFile(file, password) {
  const session = await getSession();
  if (!session) throw new Error('NOT_LOGGED_IN');
  if (!file || file.size > 1024 * 1024) throw new Error('INVALID_RECOVERY_FILE');
  let recovery;
  try {
    recovery = JSON.parse(await file.text());
    if (!recovery?.backup || !['mgm-chat-recovery-v1', 'mgm-chat-recovery-v2', 'mgm-chat-recovery-v3'].includes(recovery.format)) throw new Error('INVALID_FILE');
  } catch {
    throw new Error('INVALID_RECOVERY_FILE');
  }
  const key = await restoreIdentity(recovery.backup, password, recovery.format === 'mgm-chat-recovery-v1');
  await saveLocalPrivateKey(session.user.id, key);
  return key;
}

export async function changeSecurityKeyword({ currentPassword, currentKeyword, newKeyword }) {
  if (!currentPassword || !currentKeyword?.trim() || !newKeyword?.trim()) {
    throw new Error('MISSING_KEYWORD_FIELDS');
  }
  if (newKeyword.trim().length < 6) throw new Error('KEYWORD_TOO_SHORT');
  if (currentKeyword.trim().toLowerCase().normalize('NFKC') === newKeyword.trim().toLowerCase().normalize('NFKC')) {
    throw new Error('KEYWORD_UNCHANGED');
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const session = sessionData?.session;
  if (sessionError || !session?.user?.id) throw new Error('NOT_LOGGED_IN');
  await verifyAccountPassword(session, currentPassword);

  const { data: backup, error: backupError } = await supabase
    .from('key_backups').select('wrapped_key,salt,iv,iterations')
    .eq('user_id', session.user.id).maybeSingle();
  if (backupError) throw backupError;
  if (!backup) throw new Error('NO_BACKUP');

  const next = await rewrapIdentityForRecovery(backup, currentKeyword, newKeyword, currentPassword);
  await rotateKeyBackup(backup, next.keywordBackup);
  try { await cleanupSignupMetadata(session.user); } catch { /* ignore legacy metadata cleanup failure */ }
  return { keywordBackup: next.keywordBackup, recoveryBackup: next.recoveryBackup };
}

export async function resetSecurityKeywordWithRecoveryFile({ currentPassword, recoveryFile, newKeyword }) {
  if (!currentPassword || !recoveryFile || !newKeyword?.trim()) throw new Error('MISSING_RECOVERY_FIELDS');
  if (recoveryFile.size > 1024 * 1024) throw new Error('INVALID_RECOVERY_FILE');
  if (newKeyword.trim().length < 6) throw new Error('KEYWORD_TOO_SHORT');
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const session = sessionData?.session;
  if (sessionError || !session?.user?.id) throw new Error('NOT_LOGGED_IN');
  await verifyAccountPassword(session, currentPassword);

  let recovery;
  try {
    recovery = JSON.parse(await recoveryFile.text());
    if (recovery?.format === 'mgm-chat-recovery-v1') throw new Error('LEGACY_RECOVERY_FILE');
    if (!['mgm-chat-recovery-v2', 'mgm-chat-recovery-v3'].includes(recovery?.format) || !recovery.backup) throw new Error('INVALID_FILE');
  } catch {
    if (recovery?.format === 'mgm-chat-recovery-v1') throw new Error('LEGACY_RECOVERY_FILE');
    throw new Error('INVALID_RECOVERY_FILE');
  }
  const { data: backup, error: backupError } = await supabase
    .from('key_backups').select('wrapped_key,salt,iv,iterations')
    .eq('user_id', session.user.id).maybeSingle();
  if (backupError) throw backupError;
  if (!backup) throw new Error('NO_BACKUP');

  let next;
  try { next = await rewrapRecoveryIdentity(recovery.backup, currentPassword, newKeyword); }
  catch (error) {
    if (error.message === 'WRONG_KEYWORD') throw new Error('WRONG_RECOVERY_PASSWORD');
    throw error;
  }
  await rotateKeyBackup(backup, next.keywordBackup);
  try { await cleanupSignupMetadata(session.user); } catch { /* ignore legacy metadata cleanup failure */ }
  return { keywordBackup: next.keywordBackup, recoveryBackup: next.recoveryBackup };
}

// Start a fresh E2EE identity when both the old keyword and recovery file are
// unavailable. Old ciphertext cannot be decrypted with the replacement key.
export async function resetChatIdentity({ currentPassword, newKeyword }) {
  if (!currentPassword || !newKeyword?.trim()) throw new Error('MISSING_RESET_FIELDS');
  if (newKeyword.trim().length < 6) throw new Error('KEYWORD_TOO_SHORT');
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const session = sessionData?.session;
  if (sessionError || !session?.user?.id) throw new Error('NOT_LOGGED_IN');
  await verifyAccountPassword(session, currentPassword);

  const identity = await createIdentity(newKeyword, currentPassword);
  const { data: myGroups, error: myGroupsError } = await supabase.from('group_members')
    .select('conversation_id').eq('user_id', session.user.id);
  if (myGroupsError) throw myGroupsError;
  const groupIds = [...new Set((myGroups || []).map((row) => row.conversation_id))];
  const groupRotations = [];
  if (groupIds.length) {
    const [{ data: memberRows, error: membersError }, { data: conversations, error: conversationsError }] = await Promise.all([
      supabase.from('group_members').select('conversation_id,user_id').in('conversation_id', groupIds),
      supabase.from('conversations').select('id,group_key_version,is_group').in('id', groupIds)
    ]);
    if (membersError) throw membersError;
    if (conversationsError) throw conversationsError;
    const memberIds = [...new Set((memberRows || []).map((row) => row.user_id))];
    const { data: profiles, error: profilesError } = await supabase.from('profiles')
      .select('id,public_key').in('id', memberIds.filter((id) => id !== session.user.id));
    if (profilesError) throw profilesError;
    const publicKeys = new Map((profiles || []).map((profile) => [profile.id, profile.public_key]));

    for (const conversation of conversations || []) {
      if (!conversation.is_group) continue;
      const users = (memberRows || []).filter((row) => row.conversation_id === conversation.id).map((row) => row.user_id);
      if (!users.includes(session.user.id)) continue;
      const rawKey = crypto.getRandomValues(new Uint8Array(32));
      const ciphertexts = [], ivs = [];
      for (const userId of users) {
        const peerPublicKey = userId === session.user.id ? identity.publicJwk : publicKeys.get(userId);
        if (!peerPublicKey) throw new Error('A group member is missing an encryption key; no changes were made.');
        const wrappingKey = await getConversationKey(`${conversation.id}:group`, identity.privateKey, peerPublicKey);
        const envelope = await encryptPayload(wrappingKey, { t: 'group-key', key: toB64(rawKey) });
        ciphertexts.push(envelope.ciphertext);
        ivs.push(envelope.iv);
      }
      groupRotations.push({
        conversation_id: conversation.id,
        expected_version: Number(conversation.group_key_version) || 1,
        member_ids: users,
        ciphertexts,
        ivs
      });
    }
  }

  const { error } = await supabase.rpc('reset_my_chat_identity', {
    p_public_key: identity.publicJwk,
    p_wrapped_key: identity.backup.wrapped_key,
    p_salt: identity.backup.salt,
    p_iv: identity.backup.iv,
    p_iterations: identity.backup.iterations,
    p_group_rotations: groupRotations
  });
  if (error) throw error;

  let localKeySaved = true;
  try { await saveLocalPrivateKey(session.user.id, identity.privateKey); }
  catch { localKeySaved = false; }
  try { await cleanupSignupMetadata(session.user); } catch { /* ignore legacy metadata cleanup failure */ }
  return {
    keywordBackup: identity.backup,
    recoveryBackup: identity.recoveryBackup,
    localKeySaved
  };
}

export async function refreshRecoveryCodes({ currentPassword, currentKeyword }) {
  if (!currentPassword || !currentKeyword?.trim()) throw new Error('MISSING_KEYWORD_FIELDS');
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const session = sessionData?.session;
  if (sessionError || !session?.user?.id) throw new Error('NOT_LOGGED_IN');
  await verifyAccountPassword(session, currentPassword);

  const { data: backup, error: backupError } = await supabase
    .from('key_backups').select('wrapped_key,salt,iv,iterations')
    .eq('user_id', session.user.id).maybeSingle();
  if (backupError) throw backupError;
  if (!backup) throw new Error('NO_BACKUP');

  const next = await refreshRecoveryIdentity(backup, currentKeyword, currentPassword);
  return { keywordBackup: next.keywordBackup, recoveryBackup: next.recoveryBackup };
}

async function rotateKeyBackup(backup, nextBackup) {
  const { error: updateError } = await supabase.rpc('rotate_my_key_backup', {
    p_expected_salt: backup.salt,
    p_wrapped_key: nextBackup.wrapped_key,
    p_salt: nextBackup.salt,
    p_iv: nextBackup.iv,
    p_iterations: nextBackup.iterations
  });
  if (updateError) throw updateError;
}

async function verifyAccountPassword(session, password) {
  const { error } = await supabase.auth.signInWithPassword({
    email: session.user.email,
    password
  });
  if (error) throw new Error('WRONG_ACCOUNT_PASSWORD');
}

async function cleanupSignupMetadata(user) {
  if (user.user_metadata?.key_backup) {
    await supabase.auth.updateUser({ data: { key_backup: null, public_key: null } });
  }
}

/* ============ Sign out ============ */

export async function signOut() {
  if (manualSignOutPromise) return manualSignOutPromise;
  manualSignOutPromise = (async () => {
    const session = await getSession().catch(() => null);
    manualSignOutInProgress = true;
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
    } catch {
      // A local logout must still finish if Supabase cannot clear its session.
      try { localStorage.removeItem('mgm-portal-auth'); } catch { /* storage may be blocked */ }
      try { sessionStorage.removeItem('mgm-portal-auth'); } catch { /* storage may be blocked */ }
    }
    if (session?.user?.id) {
      await Promise.race([
        wipeLocalKeys(session.user.id).catch(() => {}),
        new Promise((resolve) => window.setTimeout(resolve, 300))
      ]);
    }
    goToLogin();
  })();
  try { await manualSignOutPromise; }
  finally {
    manualSignOutPromise = null;
    manualSignOutInProgress = false;
  }
}

export async function signOutEverywhere() {
  const session = await getSession();
  if (session) { try { await wipeLocalKeys(session.user.id); } catch { /* still sign out */ } }
  await supabase.auth.signOut({ scope: 'global' });
  goToLogin();
}

export async function signOutForSecurityNotice() {
  try { sessionStorage.setItem(SECURITY_NOTICE_SIGNOUT_KEY, '1'); }
  catch { /* session storage can be disabled by browser policy */ }
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) {
    try { localStorage.removeItem('mgm-portal-auth'); } catch { /* storage may be disabled */ }
    try { sessionStorage.removeItem('mgm-portal-auth'); } catch { /* storage may be disabled */ }
    throw error;
  }
}

/* ============ Profile ============ */

export async function loadProfile() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabase.rpc('get_my_portal_profile');
  if (error) throw error;
  return data || null;
}

export async function saveProfile({ full_name, bio, personal_email }) {
  const session = await getSession();
  if (!session) throw new Error('Please sign in again to update your profile.');

  const cleanName = String(full_name || '').trim();
  const cleanBio = String(bio || '').trim();
  const cleanPersonalEmail = String(personal_email || '').trim();
  if (!cleanName || cleanName.length > 100) throw new Error('Enter a name up to 100 characters.');
  if (cleanBio.length > 240) throw new Error('Bio must be 240 characters or fewer.');
  if (cleanPersonalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanPersonalEmail)) {
    throw new Error('Enter a valid personal email address.');
  }

  const { data: saved, error } = await supabase
    .from('profiles')
    .update({
      full_name: cleanName,
      bio: cleanBio,
      personal_email: cleanPersonalEmail
    })
    .eq('id', session.user.id)
    .select('id')
    .maybeSingle();
  if (error) {
    if (error.code === '23505') throw new Error('This roll number is already assigned to another account.');
    throw error;
  }
  if (!saved) throw new Error('Your student profile row was not found. Please sign out and sign in again, then retry.');

  // Keep the display name in sync for legacy UI. Enrollment identity remains
  // authoritative in profiles and cannot be changed from browser settings.
  const { error: metadataError } = await supabase.auth.updateUser({
    data: { full_name: cleanName }
  });
  if (metadataError) {
    console.warn('Student profile saved, but auth metadata could not be synced:', metadataError.message);
  }
}

export async function saveAvatarUrl(avatarUrl, publicId = null) {
  const session = await getSession();
  if (!session) throw new Error('Please sign in again to update your profile picture.');
  const { data: saved, error: profileError } = await supabase.from('profiles')
    .update({ avatar_url: avatarUrl || null })
    .eq('id', session.user.id)
    .select('id')
    .maybeSingle();
  if (profileError) throw profileError;
  if (!saved) throw new Error('Your student profile row was not found. Please sign out and sign in again, then retry.');
  const { error } = await supabase.auth.updateUser({
    data: { avatar_url: avatarUrl || null, avatar_public_id: avatarUrl ? publicId : null }
  });
  if (error) console.warn('Profile picture saved, but auth metadata could not be synced:', error.message);
}

/* ============ Password ============ */

export async function changePassword(currentPassword, newPassword) {
  if (typeof newPassword !== 'string' || newPassword.length < 12) throw new Error('The new password must contain at least 12 characters.');
  const session = await getSession();
  const email = session.user.email;

  const { error: reauthErr } = await supabase.auth.signInWithPassword({
    email, password: currentPassword
  });
  if (reauthErr) throw new Error('The current password is incorrect.');

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;

  // Firebase me sync karo agar exist karta hai
  try {
    const firebase = await getFirebaseAuth();
    const fbCred = await firebase.signInWithEmailAndPassword(firebase.auth, email, currentPassword);
    await firebase.updatePassword(fbCred.user, newPassword);
    await firebase.signOut(firebase.auth);
  } catch (e) { /* ignore */ }
}

/* ============ Forgot Password ============ */

export async function resetPasswordRequest(idOrEmail) {
  if (!String(idOrEmail || '').includes('@')) {
    throw new Error('Enter your account email address to request a password reset.');
  }
  const email = requireLoginEmail(idOrEmail);
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${APP_URL}/reset_password.html`,
  });
  if (error) throw new Error('Unable to send reset link. Try again.');
}
