import { supabase } from "./supabase-config.js";
    import { getCloudinaryUploadSignature, getEdgeFunctionErrorMessage, uploadSignedCloudinaryFile } from "./cloudinary-upload.js";
    const CAT_META = {
      Textbook: { icon: 'fa-book', cls: 'icon-blue' },
      Notes: { icon: 'fa-file-lines', cls: 'icon-indigo' },
      Syllabus: { icon: 'fa-list-check', cls: 'icon-amber' },
      PYQ: { icon: 'fa-file-circle-question', cls: 'icon-cyan' }
    };

    const ICON_BG = {
      'icon-blue': 'linear-gradient(145deg,var(--blue-light),var(--blue-deep))',
      'icon-indigo': 'linear-gradient(145deg,var(--indigo-light),var(--indigo))',
      'icon-amber': 'linear-gradient(145deg,var(--amber-light),var(--amber))',
      'icon-cyan': 'linear-gradient(145deg,var(--cyan-light),var(--cyan))'
    };

    let resources = [];
    let activeCat = 'All';
    let searchTerm = '';
    let selectedShareResource = null;
    let currentUser = null;

    async function invokeELibraryFunction(body, { signal } = {}) {
      const invoke = (session) => supabase.functions.invoke('elibrary-resources', {
        body,
        headers: { Authorization: `Bearer ${session.access_token}` },
        ...(signal ? { signal } : {})
      });
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session) throw new Error('Your sign-in has expired. Sign in again to use E-Library.');

      let result = await invoke(sessionData.session);
      if (result.error?.context?.status !== 401) return result;

      // Background tabs can wake with a stale access token before Supabase's
      // automatic refresh timer runs. Refresh once, then retry the operation.
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshed.session) {
        throw new Error('Your sign-in has expired. Sign in again to use E-Library.');
      }
      currentUser = refreshed.session.user;
      result = await invoke(refreshed.session);
      return result;
    }


    function escapeHTML(value) {
      return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    function safeResourceUrl(value) {
      try {
        const url = new URL(String(value || ''), location.href);
        const parts = url.pathname.split('/').filter(Boolean);
        if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || url.port || url.username || url.password ||
            url.search || url.hash || parts[0] !== 'n4yrq0td' || !['image', 'raw'].includes(parts[1]) || parts[2] !== 'upload' ||
            parts.some((part) => part === '.' || part === '..')) return '';
        return url.href;
      } catch {
        return '';
      }
    }

    function resourcePageUrl(resource) {
      // Open shared resources inside the portal shell so the recipient keeps
      // the normal portal navigation and can return to Community/E-Library.
      const url = new URL('index.html', location.href);
      url.searchParams.set('resource', String(resource.id));
      url.hash = 'elibrary';
      return url.href;
    }

    function openResource(resource) {
      const link = safeResourceUrl(resource?.link);
      if (!resource || !link) {
        portalToast('This resource link is invalid or insecure.', 'error');
        return;
      }
      document.getElementById('viewerTitle').textContent = String(resource.title || 'Resource');
      document.getElementById('viewerOpenLink').href = link;
      document.getElementById('viewerDownloadLink').href = link;
      const content = document.getElementById('viewerContent');
      content.replaceChildren();
      if (resource.mime === 'application/pdf' || /\.pdf(?:$|[?#])/i.test(link)) {
        const frame = document.createElement('iframe');
        frame.src = link;
        frame.title = resource.title || 'PDF viewer';
        content.appendChild(frame);
      } else if ((resource.mime || '').startsWith('image/')) {
        const image = document.createElement('img');
        image.src = link; image.alt = resource.title || 'Resource preview';
        content.appendChild(image);
      } else {
        const note = document.createElement('p');
        note.textContent = 'Preview is unavailable for this file type. Use Open or Download above.';
        note.style.cssText = 'color:#fff;padding:24px;text-align:center';
        content.appendChild(note);
      }
      document.getElementById('viewerOverlay').classList.add('open');
    }

    function openShare(resource) {
      if (!resource) return;
      selectedShareResource = resource;
      const link = resourcePageUrl(resource);
      document.getElementById('shareResourceTitle').textContent = resource.title || 'Resource';
      document.getElementById('communityShareLink').href = `community.html?share=${encodeURIComponent(link)}`;
      document.getElementById('shareOverlay').classList.add('open');
    }

    // The backend returns approved resources only; pending documents stay private.
    async function invokeResourceList() {
      const controller = new AbortController();
      let timeoutId;
      const timeout = new Promise((_, reject) => {
        timeoutId = window.setTimeout(() => {
          controller.abort();
          reject(new Error('E-Library request timed out. Please try again.'));
        }, 20000);
      });
      try {
        return await Promise.race([
          invokeELibraryFunction({ action: 'list_public' }, { signal: controller.signal }),
          timeout
        ]);
      } finally {
        window.clearTimeout(timeoutId);
      }
    }

    async function loadResources() {
      try {
        const { data, error } = await invokeResourceList();
        if (error) throw new Error(await getEdgeFunctionErrorMessage(error, 'Could not load E-Library resources.'));
        if (data?.error) throw new Error(data.error);
        resources = data?.resources || [];
        // Sort array locally by timestamp (newest first)
        resources.sort((a, b) => b.timestamp - a.timestamp);
        render();
      } catch (error) {
        console.error("Error fetching data:", error);
        const detail = String(error?.message || 'Please try again later.');
        const state = document.getElementById('resGrid');
        state.replaceChildren();
        const message = document.createElement('div');
        message.className = 'empty-state';
        const sessionExpired = /session|sign in/i.test(detail);
        message.textContent = sessionExpired
          ? 'Your sign-in expired. Sign in again to load E-Library resources.'
          : `Could not load E-Library resources: ${detail}`;
        state.appendChild(message);
        if (sessionExpired) {
          const loginLink = document.createElement('a');
          const loginUrl = new URL('login.html', location.href);
          loginUrl.searchParams.set('returnTo', new URL('index.html#elibrary', location.href).href);
          loginLink.href = loginUrl.href;
          loginLink.className = 'retry-resources-btn';
          loginLink.textContent = 'Sign in again';
          message.appendChild(loginLink);
        }
        const retryButton = document.createElement('button');
        retryButton.type = 'button';
        retryButton.className = 'retry-resources-btn';
        retryButton.textContent = 'Try again';
        retryButton.addEventListener('click', loadResources);
        message.appendChild(retryButton);
      }
    }

    function cardHTML(r) {
      const meta = CAT_META[r.category] || CAT_META.Notes;
      const title = String(r.title || 'Untitled resource');
      const category = String(r.category || 'Notes');
      const id = String(r.id || '');
      const rating = Number.isFinite(Number(r.rating)) ? Number(r.rating).toFixed(1) : '0.0';
      return `<div class="res-card" data-title="${escapeHTML(title.toLowerCase())}" data-cat="${escapeHTML(category)}">
      <div class="res-top">
        <div class="res-icon" style="background:${ICON_BG[meta.cls]}"><i class="fas ${meta.icon}"></i></div>
        <span class="cat-tag cat-${escapeHTML(category)}">${escapeHTML(category)}</span>
      </div>
      <div class="res-title">${escapeHTML(title)}</div>
      <div class="res-author">${escapeHTML(r.author || 'Anonymous')}</div>
      <div class="res-rating"><i class="fas fa-star"></i> ${rating}/5</div>
      <div class="res-actions">
        <button class="dl-btn" type="button" data-open-resource="${escapeHTML(id)}"><i class="fas fa-book-open"></i> View</button>
        <button class="share-btn" type="button" data-share-resource="${escapeHTML(id)}" aria-label="Share ${escapeHTML(title)}"><i class="fas fa-share-nodes"></i></button>
        ${currentUser && r.ownerId === currentUser.id ? `<button class="share-btn delete-btn" type="button" data-delete-resource="${escapeHTML(id)}" aria-label="Delete ${escapeHTML(title)}" title="Delete your upload"><i class="fas fa-trash"></i></button>` : ''}
      </div>
    </div>`;
    }

    function render() {
      const grid = document.getElementById('resGrid');
      const filtered = resources.filter(r => r.status === 'approved' && (() => {
        const catOk = activeCat === 'All' || r.category === activeCat;
        const searchOk = !searchTerm || String(r?.title || '').toLowerCase().includes(searchTerm);
        return catOk && searchOk;
      })());
      if (!filtered.length) {
        grid.innerHTML = `<div class="empty-state"><i class="fas fa-book-open"></i><div>No resources match your search yet.</div></div>`;
        return;
      }
      grid.innerHTML = filtered.map(cardHTML).join('');
      grid.querySelectorAll('[data-open-resource]').forEach(btn => btn.addEventListener('click', () => openResource(resources.find(r => r.id === btn.dataset.openResource))));
      grid.querySelectorAll('[data-share-resource]').forEach(btn => btn.addEventListener('click', () => openShare(resources.find(r => r.id === btn.dataset.shareResource))));
      grid.querySelectorAll('[data-delete-resource]').forEach(btn => btn.addEventListener('click', () => deleteResource(btn.dataset.deleteResource)));
    }

    async function deleteResource(resourceId) {
      const resource = resources.find(r => r.id === resourceId);
      if (!resource || !currentUser || resource.ownerId !== currentUser.id) return;
      if (!await portalConfirm(`Delete "${resource.title}" from the eLibrary?`, { danger: true, confirmText: 'Delete resource' })) return;
      try {
        const { data, error } = await invokeELibraryFunction({ action: 'delete_mine', id: resource.id });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        resources = resources.filter(r => r.id !== resource.id);
        render();
        showToast('Your resource was deleted');
      } catch (error) {
        console.error('Resource delete failed:', error);
        portalToast('Could not delete this resource: ' + error.message, 'error');
      }
    }

    // UI Event Listeners
    document.getElementById('tabRow').addEventListener('click', e => {
      const btn = e.target.closest('.tab-btn'); if (!btn) return;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCat = btn.dataset.cat;
      render();
    });

    document.getElementById('searchInput').addEventListener('input', e => {
      searchTerm = e.target.value.trim().toLowerCase();
      render();
    });

    let toastTimer = null;
    function showToast(msg) {
      const toast = document.getElementById('toast');
      document.getElementById('toastMsg').textContent = msg;
      toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
    }

    const overlay = document.getElementById('modalOverlay');
    const viewerOverlay = document.getElementById('viewerOverlay');
    document.getElementById('viewerClose').addEventListener('click', () => viewerOverlay.classList.remove('open'));
    viewerOverlay.addEventListener('click', e => { if (e.target === viewerOverlay) viewerOverlay.classList.remove('open'); });
    document.getElementById('shareClose').addEventListener('click', () => document.getElementById('shareOverlay').classList.remove('open'));
    document.getElementById('shareOverlay').addEventListener('click', e => { if (e.target.id === 'shareOverlay') e.currentTarget.classList.remove('open'); });
    document.getElementById('copyShareLink').addEventListener('click', async () => {
      if (!selectedShareResource) return;
      try { await navigator.clipboard.writeText(resourcePageUrl(selectedShareResource)); showToast('Public viewer link copied'); }
      catch { showToast('Unable to copy the link. Check your browser permissions.'); }
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { viewerOverlay.classList.remove('open'); document.getElementById('shareOverlay').classList.remove('open'); } });

    // 2. Upload to Cloudinary & Save to Firebase
    document.getElementById('contributeForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const title = document.getElementById('fTitle').value.trim();
      const category = document.getElementById('fCategory').value;
      const fileInput = document.getElementById('fFile').files[0];
      const submitBtn = document.getElementById('submitBtn');

      if (!title || !fileInput) return;
      const allowedExtensions = new Set(['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'webp']);
      const extension = String(fileInput.name || '').split('.').pop().toLowerCase();
      const allowedMimes = new Set(['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'image/webp']);
      if (!allowedExtensions.has(extension) || (fileInput.type && !allowedMimes.has(fileInput.type))) {
        portalToast('Choose a PDF, DOC, DOCX, JPG, PNG, or WebP file.', 'error');
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      currentUser = session?.user || null;
      if (!currentUser) {
        portalToast('Please sign in before uploading so you can manage and delete your own resources.', 'error');
        return;
      }
      if (!fileInput.size || fileInput.size > 100 * 1024 * 1024) {
        portalToast('File must be 100 MB or smaller.', 'error');
        return;
      }

      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading File...';
      submitBtn.disabled = true;
      let uploadStage = 'requesting upload authorization';

      try {
        // The server checks the signed-in student and signs only an E-Library upload.
        const uploadSignature = await getCloudinaryUploadSignature(supabase, { purpose: 'elibrary_resource' });
        uploadStage = 'uploading the file to Cloudinary';
        const cloudinaryData = await uploadSignedCloudinaryFile(uploadSignature, fileInput);

        const fileUrl = cloudinaryData.secure_url;
        // Step B: Save metadata to Firebase Firestore
        uploadStage = 'saving the resource to Firebase';
        submitBtn.innerHTML = '<i class="fas fa-database"></i> Saving Info...';

        const { data: savedResource, error: saveError } = await invokeELibraryFunction({
          action: 'create', title, category, link: fileUrl,
          public_id: cloudinaryData.public_id, resource_type: cloudinaryData.resource_type, mime: fileInput.type
        });
        if (saveError) throw new Error(await getEdgeFunctionErrorMessage(saveError, 'Could not save the resource metadata.'));
        if (savedResource?.error) throw new Error(savedResource.error);

        // Reset UI & Refresh List
        document.getElementById('contributeForm').reset();
        overlay.classList.remove('open');
        showToast('Upload sent for admin approval');
        loadResources();

      } catch (error) {
        console.error("Upload error:", error);
        // UPDATED ERROR ALERT: Ab exact problem screen par dikhegi
        portalToast('Upload failed while ' + uploadStage + ': ' + error.message, 'error');
      } finally {
        submitBtn.innerHTML = '<i class="fas fa-cloud-arrow-up"></i> Upload & Add Resource';
        submitBtn.disabled = false;
      }
    });

    // Initial Load Call
    const { data: { session } } = await supabase.auth.getSession();
    currentUser = session?.user || null;
    if (!currentUser) {
      const loginUrl = new URL('login.html', location.href);
      loginUrl.searchParams.set('returnTo', location.href);
      try { window.top.location.replace(loginUrl.href); }
      catch { location.replace(loginUrl.href); }
    } else {
      supabase.auth.onAuthStateChange((_event, session) => {
        currentUser = session?.user || null;
        render();
      });
      loadResources().then(() => {
        const requestedId = new URLSearchParams(location.search).get('resource');
        if (requestedId) openResource(resources.find(r => r.id === requestedId));
      });
    }
