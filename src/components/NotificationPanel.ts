import type { NotificationSubscription } from '../data/types';
import { getActiveLeague } from '../state/leaguesStore';
import { getInjuries, getInSeason, getRankings, state } from '../state/appState';
import { loadInSeasonState } from '../utils/storage';
import { getAllOwnedPlayerIds, resolveRosterPlayers } from '../utils/rosterBuilder';
import {
  buildInSeasonDigestReport,
  formatDigestPlainText,
  type InSeasonDigestReport,
} from '../utils/reportBuilder';
import { escapeHtml } from '../utils/escapeHtml';
import {
  defaultNotificationSubscription,
  invokeTestDigest,
  isSupabaseConfigured,
  loadNotificationSubscription,
  saveNotificationSubscription,
} from '../services/notificationSubscriptions';
import { getSignedInEmail } from '../services/cloudSync';

export function mountNotificationPanel(container: HTMLElement): () => void {
  let sub: NotificationSubscription = defaultNotificationSubscription(getActiveLeague().id);
  let preview: InSeasonDigestReport | null = null;
  let message = '';
  let messageKind: 'info' | 'error' = 'info';
  let busy = false;
  let signedIn = false;

  const buildPreviewReport = (): InSeasonDigestReport | null => {
    const rankings = getRankings();
    const inSeasonState = loadInSeasonState();
    if (!rankings || !inSeasonState?.active) return null;

    const league = getActiveLeague();
    const allPlayers = rankings.players;
    const owned = getAllOwnedPlayerIds(inSeasonState.rosters);
    const myRoster = resolveRosterPlayers(inSeasonState.rosters[inSeasonState.myTeamIndex] ?? [], allPlayers);
    const freeAgents = allPlayers.filter((p) => !owned.has(p.id));

    return buildInSeasonDigestReport({
      leagueName: league.name,
      scoring: state.scoring,
      config: inSeasonState.config,
      roster: myRoster,
      freeAgents,
      inSeason: getInSeason(),
      injuries: getInjuries(),
      options: {
        includeInjuries: sub.includeInjuries,
        includeWaiver: sub.includeWaiver,
        includeStartSit: sub.includeStartSit,
      },
    });
  };

  const render = (): void => {
    if (!isSupabaseConfigured()) {
      container.innerHTML = '';
      return;
    }

    if (!signedIn) {
      container.innerHTML = `<p class="hint notification-signin-hint">Sign in to enable email or Slack digests for this league.</p>`;
      return;
    }

    const inSeasonActive = !!loadInSeasonState()?.active;
    const previewText = preview ? formatDigestPlainText(preview) : '';

    container.innerHTML = `
      <div class="notification-panel">
        <h4>Email &amp; Slack digests</h4>
        <p class="hint">Scheduled summaries for your in-season roster. Requires <strong>Move to in season</strong> on Live Draft.</p>
        ${
          !inSeasonActive
            ? '<p class="hint notification-warning">No in-season roster yet — settings save now; digests send once you move to in season.</p>'
            : ''
        }
        <label class="notification-toggle">
          <input type="checkbox" id="digest-enabled" ${sub.enabled ? 'checked' : ''} ${busy ? 'disabled' : ''} />
          Enable digests for this league
        </label>
        <div class="notification-grid">
          <label>Frequency
            <select id="digest-frequency" ${busy ? 'disabled' : ''}>
              <option value="daily" ${sub.frequency === 'daily' ? 'selected' : ''}>Daily</option>
              <option value="weekly" ${sub.frequency === 'weekly' ? 'selected' : ''}>Weekly (Mondays)</option>
            </select>
          </label>
          <label>Email
            <input type="email" id="digest-email" placeholder="you@example.com" value="${escapeHtml(sub.email ?? '')}" ${busy ? 'disabled' : ''} />
          </label>
        </div>
        <label class="notification-full">Slack incoming webhook URL
          <input type="url" id="digest-slack" placeholder="https://hooks.slack.com/services/…" value="${escapeHtml(sub.slackWebhookUrl ?? '')}" ${busy ? 'disabled' : ''} autocomplete="off" />
        </label>
        <fieldset class="notification-fieldset">
          <legend>Include in digest</legend>
          <label class="notification-check"><input type="checkbox" id="digest-injuries" ${sub.includeInjuries ? 'checked' : ''} ${busy ? 'disabled' : ''} /> Injuries</label>
          <label class="notification-check"><input type="checkbox" id="digest-waiver" ${sub.includeWaiver ? 'checked' : ''} ${busy ? 'disabled' : ''} /> Waiver targets</label>
          <label class="notification-check"><input type="checkbox" id="digest-startsit" ${sub.includeStartSit ? 'checked' : ''} ${busy ? 'disabled' : ''} /> Start / sit</label>
        </fieldset>
        <div class="notification-actions">
          <button type="button" class="btn secondary btn-xs" id="digest-save" ${busy ? 'disabled' : ''}>Save settings</button>
          <button type="button" class="btn secondary btn-xs" id="digest-preview" ${busy ? 'disabled' : ''}>Preview</button>
          <button type="button" class="btn secondary btn-xs" id="digest-test" ${busy || !sub.enabled ? 'disabled' : ''} title="${!sub.enabled ? 'Enable digests first' : 'Send a test now'}">Test send</button>
        </div>
        ${message ? `<p class="auth-message ${messageKind}">${escapeHtml(message)}</p>` : ''}
        ${
          previewText
            ? `<details class="notification-preview" open><summary>Preview</summary><pre class="notification-preview-body">${escapeHtml(previewText)}</pre></details>`
            : ''
        }
      </div>`;

    const readForm = (): void => {
      sub = {
        ...sub,
        leagueId: getActiveLeague().id,
        enabled: (container.querySelector('#digest-enabled') as HTMLInputElement).checked,
        frequency: (container.querySelector('#digest-frequency') as HTMLSelectElement).value as NotificationSubscription['frequency'],
        email: (container.querySelector('#digest-email') as HTMLInputElement).value.trim() || null,
        slackWebhookUrl: (container.querySelector('#digest-slack') as HTMLInputElement).value.trim() || null,
        includeInjuries: (container.querySelector('#digest-injuries') as HTMLInputElement).checked,
        includeWaiver: (container.querySelector('#digest-waiver') as HTMLInputElement).checked,
        includeStartSit: (container.querySelector('#digest-startsit') as HTMLInputElement).checked,
      };
    };

    container.querySelector('#digest-save')?.addEventListener('click', () => {
      void handleSave();
    });

    container.querySelector('#digest-preview')?.addEventListener('click', () => {
      readForm();
      preview = buildPreviewReport();
      if (!preview) {
        message = 'Preview requires an in-season roster and loaded rankings data.';
        messageKind = 'error';
      } else {
        message = '';
      }
      render();
    });

    container.querySelector('#digest-test')?.addEventListener('click', () => {
      void handleTest();
    });
  };

  async function handleSave(): Promise<void> {
    busy = true;
    message = '';
    render();
    try {
      const email = (container.querySelector('#digest-email') as HTMLInputElement)?.value;
      sub = {
        ...sub,
        leagueId: getActiveLeague().id,
        enabled: (container.querySelector('#digest-enabled') as HTMLInputElement).checked,
        frequency: (container.querySelector('#digest-frequency') as HTMLSelectElement).value as NotificationSubscription['frequency'],
        email: email?.trim() || null,
        slackWebhookUrl: (container.querySelector('#digest-slack') as HTMLInputElement)?.value.trim() || null,
        includeInjuries: (container.querySelector('#digest-injuries') as HTMLInputElement).checked,
        includeWaiver: (container.querySelector('#digest-waiver') as HTMLInputElement).checked,
        includeStartSit: (container.querySelector('#digest-startsit') as HTMLInputElement).checked,
      };

      if (sub.enabled && !sub.email && !sub.slackWebhookUrl) {
        throw new Error('Add an email address or Slack webhook URL');
      }

      sub = await saveNotificationSubscription(sub);
      message = 'Digest settings saved';
      messageKind = 'info';
    } catch (err) {
      message = err instanceof Error ? err.message : 'Could not save settings';
      messageKind = 'error';
    } finally {
      busy = false;
      render();
    }
  }

  async function handleTest(): Promise<void> {
    busy = true;
    message = '';
    render();
    try {
      const email = (container.querySelector('#digest-email') as HTMLInputElement)?.value;
      sub = {
        ...sub,
        leagueId: getActiveLeague().id,
        enabled: (container.querySelector('#digest-enabled') as HTMLInputElement).checked,
        frequency: (container.querySelector('#digest-frequency') as HTMLSelectElement).value as NotificationSubscription['frequency'],
        email: email?.trim() || null,
        slackWebhookUrl: (container.querySelector('#digest-slack') as HTMLInputElement)?.value.trim() || null,
        includeInjuries: (container.querySelector('#digest-injuries') as HTMLInputElement).checked,
        includeWaiver: (container.querySelector('#digest-waiver') as HTMLInputElement).checked,
        includeStartSit: (container.querySelector('#digest-startsit') as HTMLInputElement).checked,
      };
      if (!sub.email && !sub.slackWebhookUrl) {
        throw new Error('Add an email address or Slack webhook URL');
      }
      sub = await saveNotificationSubscription(sub);
      const result = await invokeTestDigest(getActiveLeague().id);
      message = result.message;
      messageKind = 'info';
    } catch (err) {
      message = err instanceof Error ? err.message : 'Test send failed';
      messageKind = 'error';
    } finally {
      busy = false;
      render();
    }
  }

  async function load(): Promise<void> {
    signedIn = !!(await getSignedInEmail());
    if (!signedIn) {
      render();
      return;
    }
    try {
      const existing = await loadNotificationSubscription(getActiveLeague().id);
      const email = await getSignedInEmail();
      sub = existing ?? defaultNotificationSubscription(getActiveLeague().id, email);
      if (!sub.email && email) sub = { ...sub, email };
    } catch {
      sub = defaultNotificationSubscription(getActiveLeague().id);
    }
    render();
  }

  void load();

  return () => {
    preview = null;
  };
}
