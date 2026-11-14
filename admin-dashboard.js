
import { createStaffClient } from './supabase-config.js';
import { installDeveloperToolsGuard } from './devtools-guard.js';
const supabase = createStaffClient();
installDeveloperToolsGuard(async () => {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) {
    try { localStorage.removeItem('mgm-academic-staff-auth'); } catch { /* storage may be disabled */ }
    try { sessionStorage.removeItem('mgm-academic-staff-auth'); } catch { /* storage may be disabled */ }
    throw error;
  }
});
    const $ = id => document.getElementById(id);
    function showLogin(message = '') {
      $('workspace').hidden = true;
      $('analyticsPanel').hidden = true;
      $('loginCard').hidden = false;
      $('status').textContent = message;
    }
    const formatCount = value => Number(value || 0).toLocaleString();
    function formatBytes(value) {
      const bytes = Number(value);
      if (!Number.isFinite(bytes)) return '—';
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let amount = Math.abs(bytes);
      let unit = 0;
      while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit++; }
      return (bytes < 0 ? '-' : '') + amount.toFixed(unit ? 1 : 0) + ' ' + units[unit];
    }
    function addTextRow(parent, label, value, className = '') {
      const row = document.createElement('div');
      row.className = className;
      const left = document.createElement('span');
      left.textContent = label;
      const right = document.createElement('strong');
      right.textContent = value;
      row.append(left, right);
      parent.append(row);
      return row;
    }
    function addMetricRow(parent, label, value, ratio, detail = '') {
      const row = addTextRow(parent, label, value, 'usage-row');
      const meter = document.createElement('div');
      meter.className = 'metric-track';
      meter.setAttribute('aria-hidden', 'true');
      const fill = document.createElement('div');
      fill.className = 'metric-fill';
      fill.style.width = Math.max(0, Math.min(100, ratio)) + '%';
      meter.append(fill);
      const item = document.createElement('div');
      item.className = 'metric-item';
      item.append(meter);
      if (detail) {
        const note = document.createElement('span');
        note.className = 'metric-detail';
        note.textContent = detail;
        item.append(note);
      }
      row.append(item);
      return row;
    }
    function addErrorRow(parent, title, detail) {
      const row = document.createElement('div');
      row.className = 'error-row';
      const heading = document.createElement('strong');
      heading.textContent = title;
      const message = document.createElement('span');
      message.textContent = detail;
      row.append(heading, message);
      parent.append(row);
    }
    function renderAnalytics(payload) {
      const portal = payload.portal || {};
      const provider = payload.provider || {};
      const days = Array.isArray(portal.daily_active_users) ? portal.daily_active_users : [];
      const today = days.length ? days[days.length - 1].users : 0;
      $('metricToday').textContent = formatCount(today);
      $('metricMonthUsers').textContent = formatCount(portal.active_users_month_to_date);
      $('metricMonthViews').textContent = formatCount(portal.page_views_month_to_date);
      $('metricDatabase').textContent = formatBytes(portal.database_bytes);
      $('metricErrors').textContent = formatCount(portal.client_errors_24h);
      const currentBytes = Number(portal.database_bytes);
      const baselineBytes = portal.database_month_start_bytes == null ? NaN : Number(portal.database_month_start_bytes);
      $('metricDatabaseChange').textContent = Number.isFinite(currentBytes) && Number.isFinite(baselineBytes)
        ? (currentBytes - baselineBytes >= 0 ? '+' : '') + formatBytes(currentBytes - baselineBytes)
        : 'No baseline yet';

      const chart = $('dailyChart');
      chart.replaceChildren();
      const values = days.map(day => Number(day.users) || 0);
      const totalUsers = values.reduce((sum, value) => sum + value, 0);
      const peak = Math.max(0, ...values);
      const peakIndex = values.indexOf(peak);
      $('dailyAverage').textContent = days.length ? (totalUsers / days.length).toFixed(1) : '—';
      $('dailyPeak').textContent = peakIndex >= 0 && days[peakIndex]
        ? formatCount(peak) + ' · ' + new Date(days[peakIndex].date + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
        : '—';
      const lastWeek = values.slice(-7).reduce((sum, value) => sum + value, 0);
      const priorWeek = values.slice(-14, -7).reduce((sum, value) => sum + value, 0);
      const trend = $('dailyTrend');
      trend.classList.remove('positive', 'negative');
      if (values.length >= 14 && priorWeek > 0) {
        const change = ((lastWeek - priorWeek) / priorWeek) * 100;
        trend.textContent = (change > 0 ? '+' : '') + change.toFixed(0) + '%';
        if (change > 0) trend.classList.add('positive');
        if (change < 0) trend.classList.add('negative');
        trend.title = formatCount(lastWeek) + ' users in the latest 7 days vs ' + formatCount(priorWeek) + ' in the 7 days before';
      } else {
        trend.textContent = values.length ? formatCount(lastWeek) + ' users' : '—';
        trend.title = 'Not enough previous data for a week-over-week comparison.';
      }
      if (!days.length) {
        const empty = document.createElement('div');
        empty.className = 'chart-empty';
        empty.textContent = 'No daily activity data available.';
        chart.append(empty);
      } else {
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 720 220');
        svg.setAttribute('preserveAspectRatio', 'none');
        const defs = document.createElementNS(svgNS, 'defs');
        const gradient = document.createElementNS(svgNS, 'linearGradient');
        gradient.id = 'dailyFill'; gradient.setAttribute('x1', '0'); gradient.setAttribute('x2', '0');
        gradient.setAttribute('y1', '0'); gradient.setAttribute('y2', '1');
        const topStop = document.createElementNS(svgNS, 'stop'); topStop.setAttribute('offset', '0%'); topStop.setAttribute('stop-color', '#4c9be5'); topStop.setAttribute('stop-opacity', '.25');
        const bottomStop = document.createElementNS(svgNS, 'stop'); bottomStop.setAttribute('offset', '100%'); bottomStop.setAttribute('stop-color', '#4c9be5'); bottomStop.setAttribute('stop-opacity', '.015');
        gradient.append(topStop, bottomStop); defs.append(gradient); svg.append(defs);
        const left = 42, right = 704, top = 15, bottom = 180;
        const maxValue = Math.max(1, peak);
        [0, .5, 1].forEach(fraction => {
          const y = bottom - fraction * (bottom - top);
          const line = document.createElementNS(svgNS, 'line');
          line.setAttribute('x1', left); line.setAttribute('x2', right); line.setAttribute('y1', y); line.setAttribute('y2', y); line.setAttribute('class', 'chart-grid'); svg.append(line);
          const label = document.createElementNS(svgNS, 'text');
          label.setAttribute('x', left - 9); label.setAttribute('y', y + 4); label.setAttribute('text-anchor', 'end'); label.setAttribute('class', 'chart-y-label');
          label.textContent = formatCount(Math.round(maxValue * fraction)); svg.append(label);
        });
        const points = days.map((day, index) => ({
          day, value: values[index],
          x: days.length === 1 ? (left + right) / 2 : left + (index / (days.length - 1)) * (right - left),
          y: bottom - (values[index] / maxValue) * (bottom - top)
        }));
        const linePath = points.map((point, index) => (index ? 'L' : 'M') + point.x + ' ' + point.y).join(' ');
        const area = document.createElementNS(svgNS, 'path'); area.setAttribute('d', linePath + ' L' + points[points.length - 1].x + ' ' + bottom + ' L' + points[0].x + ' ' + bottom + ' Z'); area.setAttribute('class', 'chart-area'); svg.append(area);
        const line = document.createElementNS(svgNS, 'path'); line.setAttribute('d', linePath); line.setAttribute('class', 'chart-line'); svg.append(line);
        points.forEach((point, index) => {
          if (index % 7 === 0 || index === points.length - 1) {
            const dateLabel = document.createElementNS(svgNS, 'text');
            dateLabel.setAttribute('x', point.x); dateLabel.setAttribute('y', 205); dateLabel.setAttribute('text-anchor', index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'); dateLabel.setAttribute('class', 'chart-x-label');
            dateLabel.textContent = new Date(point.day.date + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }); svg.append(dateLabel);
          }
          const circle = document.createElementNS(svgNS, 'circle');
          circle.setAttribute('cx', point.x); circle.setAttribute('cy', point.y); circle.setAttribute('r', index === peakIndex ? '5' : '3.5'); circle.setAttribute('class', 'chart-point'); circle.setAttribute('tabindex', '0');
          const dateText = new Date(point.day.date + 'T12:00:00Z').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
          const detail = dateText + ': ' + formatCount(point.value) + ' active users';
          circle.setAttribute('aria-label', detail);
          const title = document.createElementNS(svgNS, 'title'); title.textContent = detail; circle.append(title); svg.append(circle);
        });
        chart.append(svg);
      }

      const usage = $('usageList');
      usage.replaceChildren();
      $('usagePeriod').textContent = provider.configured
        ? 'Total requests in the last ' + (provider.usage_period || '7 days') + '.'
        : 'Counts across Auth, Realtime, REST and Storage.';
      if (provider.configured) {
        const requests = provider.requests || {};
        const requestRows = [['Auth', requests.auth], ['Realtime', requests.realtime], ['REST', requests.rest], ['Storage', requests.storage]];
        const requestTotal = requestRows.reduce((sum, [, value]) => sum + (Number(value) || 0), 0);
        requestRows.forEach(([label, value]) => {
          const count = Number(value) || 0;
          addMetricRow(usage, label, formatCount(count), requestTotal ? count / requestTotal * 100 : 0,
            requestTotal ? ((count / requestTotal) * 100).toFixed(1) + '% of requests' : 'No requests in this period');
        });
      } else {
        const note = document.createElement('p');
        note.textContent = provider.note || 'Supabase request metrics are not configured.';
        usage.append(note);
        const link = document.createElement('a');
        link.className = 'setup-link';
        link.href = '../ADMIN_ANALYTICS_SETUP.md';
        link.textContent = 'Analytics setup';
        usage.append(link);
      }
      if (provider.note && provider.configured) {
        const note = document.createElement('p');
        note.textContent = provider.note;
        usage.append(note);
      }

      const firebase = $('firebaseList');
      firebase.replaceChildren();
      const firebaseMetrics = payload.firebase || {};
      [
        ['Emergency Chat', firebaseMetrics.emergency_chat],
        ['E-Library', firebaseMetrics.elibrary]
      ].forEach(([name, metrics]) => {
        if (!metrics?.configured) {
          addErrorRow(firebase, name, metrics?.note || 'Usage is not configured.');
          const link = document.createElement('a');
          link.className = 'setup-link';
          link.href = '../ADMIN_ANALYTICS_SETUP.md';
          link.textContent = 'Analytics setup';
          firebase.append(link);
          return;
        }
        const ops = [['reads', metrics.reads], ['writes', metrics.writes], ['deletes', metrics.deletes]];
        const opTotal = ops.reduce((sum, [, value]) => sum + (Number(value) || 0), 0);
        ops.forEach(([operation, value]) => {
          const count = Number(value) || 0;
          addMetricRow(firebase, name + ' ' + operation, formatCount(count), opTotal ? count / opTotal * 100 : 0,
            opTotal ? ((count / opTotal) * 100).toFixed(1) + '% of operations' : 'No operations reported');
        });
        addTextRow(firebase, name + ' storage', formatBytes(metrics.storage_bytes), 'usage-row');
      });

      const tables = $('tableList');
      tables.replaceChildren();
      const largestTables = portal.largest_tables || [];
      const largestBytes = Math.max(1, ...largestTables.map(table => Number(table.bytes) || 0));
      largestTables.forEach(table => addMetricRow(
        tables, 'public.' + table.table, formatBytes(table.bytes), (Number(table.bytes) || 0) / largestBytes * 100,
        largestBytes > 1 ? ((Number(table.bytes) / largestBytes) * 100).toFixed(1) + '% of largest table' : ''
      ));
      if (!tables.childElementCount) {
        const empty = document.createElement('p');
        empty.textContent = 'No table data available.';
        tables.append(empty);
      }

      const issues = $('errorList');
      issues.replaceChildren();
      (portal.recent_client_errors || []).forEach(item => {
        const time = item.created_at ? new Date(item.created_at).toLocaleString() : '';
        addErrorRow(issues, (item.page || 'Portal') + ' · ' + time, item.message || 'Browser error');
      });
      (provider.errors || []).forEach(item => {
        const time = item.timestamp ? new Date(item.timestamp).toLocaleString() : '';
        const label = item.source === 'postgres_logs' ? 'Database'
          : (item.source === 'function_logs' || item.source === 'function_edge_logs' ? 'Edge Function' : 'API');
        const code = item.status ? 'HTTP ' + item.status : (item.sqlstate ? 'SQLSTATE ' + item.sqlstate : item.severity_text || 'Error');
        addErrorRow(issues, label + ' · ' + code + ' · ' + time, item.path || item.source || 'Supabase service error');
      });
      if (!issues.childElementCount) addErrorRow(issues, 'No recent issues', 'No browser or provider errors were recorded.');
      if (!provider.configured) {
        addErrorRow(issues, 'Supabase logs not connected', 'Add the Management API token to enable provider error details.');
      } else if (provider.note) {
        addErrorRow(issues, 'Some Supabase metrics unavailable', provider.note);
      }
    }
    async function loadAnalytics() {
      const button = $('analyticsRefresh');
      const status = $('analyticsStatus');
      button.disabled = true;
      status.classList.remove('error');
      status.textContent = 'Loading analytics…';
      try {
        const { data, error } = await supabase.functions.invoke('admin-analytics', { body: { action: 'dashboard' } });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        renderAnalytics(data || {});
        status.textContent = 'Updated ' + new Date().toLocaleTimeString() + '.';
      } catch (error) {
        status.classList.add('error');
        status.textContent = error.message || 'Analytics could not be loaded. Check the function deployment and SQL setup.';
      } finally { button.disabled = false; }
    }
    $('analyticsRefresh').addEventListener('click', loadAnalytics);
    async function loadStaffDashboard() {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) { showLogin(); return; }
      const { data: staff, error } = await supabase.from('academic_staff').select('role').eq('user_id', session.user.id).maybeSingle();
      if (error || !staff || !['admin', 'subadmin'].includes(staff.role)) {
        await supabase.auth.signOut();
        showLogin('This account is not approved for academic staff access.');
        return;
      }
      $('loginCard').hidden = true;
      $('workspace').hidden = false;
      $('welcome').textContent = `Signed in as ${session.user.email || 'academic staff'}. Choose a staff tool below.`;
      $('roleBadge').textContent = staff.role === 'admin' ? 'Primary admin' : 'Subadmin';
      $('adminTools').hidden = staff.role !== 'admin';
      $('analyticsPanel').hidden = staff.role !== 'admin';
      if (staff.role === 'admin') loadAnalytics();
    }
    $('loginForm').addEventListener('submit', async event => {
      event.preventDefault();
      const button = $('signIn');
      button.disabled = true;
      $('status').textContent = 'Checking staff access…';
      try {
        const { error } = await supabase.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
        if (error) throw error;
        await loadStaffDashboard();
      } catch (error) {
        showLogin(error.message || 'Sign in failed.');
      } finally { button.disabled = false; }
    });
    $('logout').addEventListener('click', async () => {
      await supabase.auth.signOut();
      showLogin('Signed out from staff console.');
    });
    loadStaffDashboard().catch(error => showLogin(`${error.message || error}. Check the Supabase academic setup.`));
  
