import { escapeHtml } from '../utils/escapeHtml';
import { mountNotificationPanel } from './NotificationPanel';
import {
  getCloudSyncDetail,
  getCloudSyncStatus,
  getSignedInEmail,
  isSupabaseConfigured,
  signInWithEmail,
  signOutCloud,
  subscribeCloudSync,
  pushCloudStoreNow,
} from '../services/cloudSync';

export function mountAuthPanel(container: HTMLElement, onAuthChange: () => void): () => void {
  let open = false;
  let email = '';
  let message = '';
  let messageKind: 'info' | 'error' = 'info';
  let busy = false;
  let notifCleanup: (() => void) | null = null;

  /** Keep dropdown inside the viewport when header layout wraps on small screens. */
  const clampAuthPanelPosition = (): void => {
    const panel = container.querySelector('.auth-panel') as HTMLElement | null;
    if (!panel) return;

    panel.style.left = '0';
    panel.style.right = 'auto';

    requestAnimationFrame(() => {
      const margin = 12;
      const panelRect = panel.getBoundingClientRect();
      let offset = 0;

      if (panelRect.left < margin) {
        offset = margin - panelRect.left;
      } else if (panelRect.right > window.innerWidth - margin) {
        offset = window.innerWidth - margin - panelRect.right;
      }

      if (offset !== 0) {
        panel.style.left = `${offset}px`;
      }
    });
  };

  const render = (): void => {
    if (!isSupabaseConfigured()) {
      container.innerHTML = '';
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');
    const status = getCloudSyncStatus();
    const detail = getCloudSyncDetail();
    const signedIn = status !== 'signed-out' && status !== 'disabled';

    if (!open) {
      container.innerHTML = `
        <div class="auth-panel-compact">
          <button type="button" id="auth-toggle" class="btn secondary btn-xs auth-toggle" title="Sign in to sync leagues across devices">
            ${signedIn ? 'Account' : 'Sign in'}
          </button>
          ${signedIn && status === 'syncing' ? '<span class="auth-sync-hint">Syncing…</span>' : ''}
          ${signedIn && status === 'synced' ? '<span class="auth-sync-hint synced">Synced</span>' : ''}
          ${status === 'error' ? `<span class="auth-sync-hint error">${escapeHtml(detail || 'Sync error')}</span>` : ''}
        </div>`;
      container.querySelector('#auth-toggle')?.addEventListener('click', () => {
        open = true;
        void refreshEmail().then(render);
      });
      return;
    }

    container.innerHTML = `
      <div class="auth-panel">
        <div class="auth-panel-header">
          <strong>Account sync</strong>
          <button type="button" id="auth-close" class="btn secondary btn-xs" aria-label="Close">×</button>
        </div>
        <p class="hint">Sign in with a magic link to use the same leagues on your laptop and phone.</p>
        ${
          signedIn
            ? `<p class="auth-signed-in">Signed in as <strong>${escapeHtml(email || 'your account')}</strong></p>
               <p class="hint auth-status${status === 'error' ? ' auth-status-error' : ''}">${escapeHtml(
                 status === 'error'
                   ? detail || 'Sync failed — open Account for details or run supabase/schema.sql.'
                   : detail || 'Your leagues sync automatically when you make changes.',
               )}</p>
               <div class="auth-actions">
                 <button type="button" id="auth-sync-now" class="btn secondary btn-xs" ${busy ? 'disabled' : ''}>Sync now</button>
                 <button type="button" id="auth-sign-out" class="btn secondary btn-xs" ${busy ? 'disabled' : ''}>Sign out</button>
               </div>`
            : `<label class="auth-email-label">Email
                 <input type="email" id="auth-email" placeholder="you@example.com" value="${escapeHtml(email)}" ${busy ? 'disabled' : ''} />
               </label>
               <button type="button" id="auth-send-link" class="btn btn-xs" ${busy ? 'disabled' : ''}>Send magic link</button>`
        }
        ${message ? `<p class="auth-message ${messageKind}">${escapeHtml(message)}</p>` : ''}
        ${signedIn ? '<div id="auth-notifications"></div>' : ''}
      </div>`;

    container.querySelector('#auth-close')?.addEventListener('click', () => {
      open = false;
      message = '';
      notifCleanup?.();
      notifCleanup = null;
      render();
    });

    container.querySelector('#auth-email')?.addEventListener('input', (e) => {
      email = (e.target as HTMLInputElement).value;
    });

    container.querySelector('#auth-send-link')?.addEventListener('click', () => {
      void handleSendLink();
    });

    container.querySelector('#auth-sign-out')?.addEventListener('click', () => {
      void handleSignOut();
    });

    container.querySelector('#auth-sync-now')?.addEventListener('click', () => {
      void handleSyncNow();
    });

    if (signedIn) {
      notifCleanup?.();
      const notifHost = container.querySelector('#auth-notifications') as HTMLElement;
      if (notifHost) notifCleanup = mountNotificationPanel(notifHost);
    } else {
      notifCleanup?.();
      notifCleanup = null;
    }

    clampAuthPanelPosition();
  };

  async function refreshEmail(): Promise<void> {
    email = (await getSignedInEmail()) ?? email;
  }

  async function handleSendLink(): Promise<void> {
    if (!email.trim()) {
      message = 'Enter your email address';
      messageKind = 'error';
      render();
      return;
    }
    busy = true;
    message = '';
    render();
    try {
      await signInWithEmail(email);
      message = 'Check your email for a sign-in link. It works on this device and your phone.';
      messageKind = 'info';
    } catch (err) {
      message = err instanceof Error ? err.message : 'Could not send sign-in link';
      messageKind = 'error';
    } finally {
      busy = false;
      render();
    }
  }

  async function handleSignOut(): Promise<void> {
    busy = true;
    render();
    try {
      await signOutCloud();
      message = '';
      open = false;
      onAuthChange();
    } catch (err) {
      message = err instanceof Error ? err.message : 'Sign out failed';
      messageKind = 'error';
    } finally {
      busy = false;
      render();
    }
  }

  async function handleSyncNow(): Promise<void> {
    busy = true;
    render();
    try {
      await pushCloudStoreNow();
      onAuthChange();
    } catch (err) {
      message = err instanceof Error ? err.message : 'Sync failed';
      messageKind = 'error';
    } finally {
      busy = false;
      render();
    }
  }

  const unsubSync = subscribeCloudSync(() => {
    if (!open) render();
  });

  void refreshEmail().then(render);

  return () => {
    unsubSync();
    notifCleanup?.();
  };
}
