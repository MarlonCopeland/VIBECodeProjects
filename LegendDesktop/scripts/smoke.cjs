// scripts/smoke.cjs — end-to-end smoke test of the BUILT app (`npm run smoke`).
// Troubleshooting harness: it runs on the LOCAL demo backend (built with
// `build.mjs --local`) so it needs no network or Supabase test account.
// Boots dist-electron/main.cjs against a throwaway profile, seeds a demo
// network straight into the SQLite vault through the same IPC bridge the app
// uses, signs in through the real login form (local backend demo account),
// then screenshots the contacts view and the 3D network (unfocused, focused
// on a person, focused on a premise) into LEGEND_SMOKE_OUT.

const { app } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const out = process.env.LEGEND_SMOKE_OUT || path.join(os.tmpdir(), 'legend-smoke');
fs.rmSync(path.join(out, 'userData'), { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
app.setPath('userData', path.join(out, 'userData'));

require('../dist-electron/main.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OWNER = 'demo-user';

const PEOPLE = [
  ['Ada', 'Lovelace', '5550000001', [['event', 'NAACP Gala 2026'], ['expertise', 'Computing']]],
  ['Grace', 'Hopper', '5550000002', [['expertise', 'Computing'], ['place', 'Navy Yard']]],
  ['Alan', 'Turing', '5550000003', [['expertise', 'Computing'], ['hobby', 'Running']]],
  ['Maya', 'Angelou', '5550000004', [['event', 'NAACP Gala 2026'], ['topic', 'Poetry']]],
  ['James', 'Baldwin', '5550000005', [['topic', 'Poetry'], ['place', 'Harlem']]],
  ['Zora', 'Hurston', '5550000006', [['place', 'Harlem'], ['topic', 'Poetry']]],
  ['Langston', 'Hughes', '5550000007', [['place', 'Harlem'], ['event', 'NAACP Gala 2026']]],
  ['Katherine', 'Johnson', '5550000008', [['expertise', 'Computing'], ['interest', 'Space']]],
  ['Mae', 'Jemison', '5550000009', [['interest', 'Space'], ['hobby', 'Dance']]],
  ['Neil', 'Tyson', '5550000010', [['interest', 'Space'], ['topic', 'Science outreach']]],
  ['Carl', 'Sagan', '5550000011', [['interest', 'Space'], ['topic', 'Science outreach']]],
  ['Serena', 'Williams', '5550000012', [['hobby', 'Tennis'], ['event', 'NAACP Gala 2026']]],
  ['Venus', 'Williams', '5550000013', [['hobby', 'Tennis']]],
  ['Arthur', 'Ashe', '5550000014', [['hobby', 'Tennis'], ['topic', 'Civil rights']]],
  ['John', 'Lewis', '5550000015', [['topic', 'Civil rights'], ['event', 'NAACP Gala 2026']]],
  ['Rosa', 'Parks', '5550000016', [['topic', 'Civil rights']]],
  ['Bayard', 'Rustin', '5550000017', [['topic', 'Civil rights'], ['place', 'Harlem']]],
  ['Misty', 'Copeland', '5550000018', [['hobby', 'Dance']]],
  ['Alvin', 'Ailey', '5550000019', [['hobby', 'Dance'], ['place', 'Harlem']]],
  ['Jane', 'Doe', '5551234567', [['hobby', 'Running']]],
];
const KNOWS = [[0, 1], [0, 2], [1, 7], [3, 4], [4, 5], [5, 6], [3, 6], [8, 9], [9, 10], [11, 12], [11, 13], [14, 15], [15, 16], [17, 18], [2, 19], [14, 3]];

async function seed(win) {
  const stmts = [];
  const hlc = (i) => `${String(1000000000000 + i).padStart(15, '0')}-000000-smoke`;
  let i = 0;
  const ids = PEOPLE.map((_, k) => `seed-${k}`);
  PEOPLE.forEach(([first, last, phone, premises], k) => {
    i += 1;
    stmts.push([
      `INSERT INTO contacts (id, owner_id, first_name, last_name, company, favorite, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      [ids[k], OWNER, first, last, k % 3 === 0 ? 'Legend Labs' : null, k % 5 === 0 ? 1 : 0, 'manual', hlc(i), hlc(i)],
    ]);
    stmts.push([`INSERT INTO contact_phones (id, contact_id, label, number, updated_at) VALUES (?,?,?,?,?)`, [`ph-${k}`, ids[k], 'mobile', phone, hlc(i)]]);
    premises.forEach(([kind, label], j) => {
      stmts.push([`INSERT INTO premises (id, contact_id, kind, label, tags, updated_at) VALUES (?,?,?,?,?,?)`, [`pr-${k}-${j}`, ids[k], kind, label, '[]', hlc(i)]]);
    });
    // Vary grades: more recent interactions for earlier people.
    for (let t = 0; t < (k * 7) % 9; t += 1) {
      const when = new Date(Date.now() - (t * 6 + k) * 86400000).toISOString();
      stmts.push([
        `INSERT INTO interactions (id, contact_id, kind, occurred_at, updated_at) VALUES (?,?,?,?,?)`,
        [`in-${k}-${t}`, ids[k], ['call', 'visit', 'text'][t % 3], when, hlc(i)],
      ]);
    }
  });
  KNOWS.forEach(([a, b], k) => {
    const [fa, la, pa] = PEOPLE[a];
    const [fb, lb, pb] = PEOPLE[b];
    stmts.push([
      `INSERT INTO contact_knows (id, owner_id, contact_id, contact_name, contact_phones, known_contact_id, known_name, known_phones, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [`kn-${k}`, OWNER, ids[a], `${fa} ${la}`, JSON.stringify([pa]), ids[b], `${fb} ${lb}`, JSON.stringify([pb]), hlc(900 + k), hlc(900 + k)],
    ]);
  });
  // A link whose other side was deleted, plus a re-imported look-alike, so
  // the Knows "possible match" suggestion shows up on Ada and the new Jane.
  stmts.push([
    `INSERT INTO contact_knows (id, owner_id, contact_id, contact_name, contact_phones, known_contact_id, known_name, known_phones, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ['kn-dangling', OWNER, ids[0], 'Ada Lovelace', '["5550000001"]', 'deleted-contact', 'Charles Babbage', '["5559990000"]', hlc(990), hlc(990)],
  ]);
  stmts.push([
    `INSERT INTO contacts (id, owner_id, first_name, last_name, favorite, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
    ['seed-babbage-2', OWNER, 'Charles', 'Babbage', 0, 'csv', hlc(991), hlc(991)],
  ]);
  stmts.push([`INSERT INTO contact_phones (id, contact_id, label, number, updated_at) VALUES (?,?,?,?,?)`, ['ph-bab', 'seed-babbage-2', 'mobile', '+1 (555) 999-0000', hlc(991)]]);

  await win.webContents.executeJavaScript(`(async () => {
    for (const [sql, params] of ${JSON.stringify(stmts)}) await window.legend.sql('run', sql, params);
    localStorage.setItem('legend.appSettings', JSON.stringify({ hasSeenTutorial: true }));
  })()`);
}

async function login(win) {
  await win.webContents.executeJavaScript(`(async () => {
    location.hash = '#/login';
    await new Promise((r) => setTimeout(r, 800));
    const set = (el, v) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set(document.querySelector('input[type=email]'), 'demo@unjadeddigital.com');
    set(document.querySelector('input[type=password]'), 'Password1');
    document.querySelector('button[type=submit]').click();
  })()`);
}

async function shot(win, name) {
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(out, `${name}.png`), img.toPNG());
  console.log('saved', path.join(out, `${name}.png`));
}

async function go(win, hash, wait) {
  await win.webContents.executeJavaScript(`location.hash = ${JSON.stringify(hash)}`);
  await sleep(wait);
}

async function run(win) {
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 3) errors.push(message);
  });
  win.setSize(1440, 920);
  await sleep(1500); // schema migration runs on first load
  await seed(win);
  win.webContents.reload();
  await new Promise((r) => win.webContents.once('did-finish-load', r));
  await sleep(1000);
  await login(win);
  await sleep(2500);
  await go(win, '#/contacts/seed-0', 1500);
  await shot(win, '1-contact-ada');
  await go(win, '#/network', 9000);
  await shot(win, '2-network');
  await win.webContents.executeJavaScript(`location.hash = '#/network?focus=seed-3'`);
  await sleep(4500);
  await shot(win, '3-network-focus-maya');
  await go(win, '#/contacts/seed-babbage-2', 1500);
  await shot(win, '4-contact-reimported');
  await go(win, '#/circles', 1200);
  await shot(win, '5-circles');
  await go(win, '#/settings', 1200);
  await shot(win, '6-settings');
  console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors');
  app.exit(0);
}

app.on('browser-window-created', (_e, win) => {
  win.webContents.once('did-finish-load', () =>
    run(win).catch((e) => {
      console.error(e);
      app.exit(1);
    }),
  );
});
