/* ── Feature Flag Admin UI ──────────────────────────────────────────────── */

const FLAG_DESCRIPTIONS = {
  'new-product-layout':          'Switches product listing from row view to a card grid. Code was deployed weeks ago — flip ON to release the new design.',
  'express-checkout':            'Streamlined single-page checkout (fewer fields, saved details). Currently deployed but hidden. Enable to release.',
  'holiday-promotion':           'Shows a holiday sale banner and applies a 20% discount to all products. A seasonal release gate.',
  'beta-search':                 'Real-time product search released only to users whose email is in the beta list (targeted rollout).',
  'canary-recommendation-engine':'AI-powered recommendations deployed to 20% of users via hash-based targeting (canary release pattern).',
};

const FLAG_TYPES = {
  'new-product-layout':          { type: 'Boolean',  pattern: 'Standard release gate' },
  'express-checkout':            { type: 'Boolean',  pattern: 'Standard release gate' },
  'holiday-promotion':           { type: 'Boolean',  pattern: 'Scheduled / seasonal release' },
  'beta-search':                 { type: 'Boolean',  pattern: 'Targeted rollout (by email)' },
  'canary-recommendation-engine':{ type: 'Boolean',  pattern: 'Canary release (20% of users)' },
};

let flagsConfig = null;
let saving = {};

async function loadFlags() {
  const res = await fetch('/api/admin/flags');
  flagsConfig = await res.json();
  render();
}

function isOn(flag) {
  return flag.defaultVariant === 'on';
}

function render() {
  const container = document.getElementById('flags-container');
  const flags = flagsConfig.flags;

  container.innerHTML = Object.entries(flags).map(([name, flag]) => {
    const on = isOn(flag);
    const meta = FLAG_TYPES[name] || { type: 'Boolean', pattern: '' };
    const desc = FLAG_DESCRIPTIONS[name] || flag.metadata?.description || '';

    return `
      <div class="flag-card ${on ? 'flag-active' : 'flag-inactive'}" id="card-${name}">
        <div class="flag-header">
          <div>
            <div class="flag-name">${name}</div>
            <span class="flag-state ${flag.state === 'ENABLED' ? 'flag-state-enabled' : 'flag-state-disabled'}">
              ${flag.state}
            </span>
          </div>
          <div class="toggle-wrap">
            <span class="toggle-label" id="label-${name}">${on ? 'ON' : 'OFF'}</span>
            <label class="toggle" title="${on ? 'Click to turn OFF' : 'Click to turn ON'}">
              <input type="checkbox"
                     id="toggle-${name}"
                     ${on ? 'checked' : ''}
                     onchange="toggleFlag('${name}', this.checked)">
              <span class="slider"></span>
            </label>
          </div>
        </div>
        <p class="flag-description">${desc}</p>
        <div class="flag-meta">
          <span class="flag-variant">Default: <span>${flag.defaultVariant}</span></span>
          <span class="flag-variant">${meta.pattern}</span>
        </div>
        <div id="status-${name}" style="margin-top:8px; min-height:18px;"></div>
      </div>
    `;
  }).join('');
}

async function toggleFlag(name, checked) {
  const newVariant = checked ? 'on' : 'off';
  const statusEl = document.getElementById(`status-${name}`);
  const labelEl  = document.getElementById(`label-${name}`);
  const card     = document.getElementById(`card-${name}`);

  statusEl.innerHTML = '<span class="saving-indicator">Saving…</span>';

  try {
    const res = await fetch(`/api/admin/flags/${name}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ defaultVariant: newVariant }),
    });

    if (!res.ok) throw new Error('Server error');

    // Update local state
    flagsConfig.flags[name].defaultVariant = newVariant;

    labelEl.textContent = checked ? 'ON' : 'OFF';
    card.className = `flag-card ${checked ? 'flag-active' : 'flag-inactive'}`;
    statusEl.innerHTML = `<span class="saved-indicator">✓ Saved — flagd reloading…</span>`;

    setTimeout(() => { statusEl.innerHTML = ''; }, 3000);
  } catch (err) {
    // Revert toggle on error
    document.getElementById(`toggle-${name}`).checked = !checked;
    statusEl.innerHTML = '<span style="color:var(--danger);font-size:.78rem;">⚠ Save failed</span>';
    console.error('Toggle failed:', err);
  }
}

loadFlags();
