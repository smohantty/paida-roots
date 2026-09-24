// Paida Roots website. Reads data.json (made by scripts/build.mjs) and renders
// every page in the browser. No framework, so it keeps working for decades.
(() => {
  const app = document.getElementById('app');
  let D; // the data
  let lang = 'en';
  try { lang = localStorage.getItem('lang') || 'en'; } catch {}

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const P = (id) => D.people[id];
  const nm = (p) => (lang === 'or' && p.name.or) || p.name.en;
  const altNm = (p) => (lang === 'or' ? p.name.en : p.name.or) || '';
  const yr = (d) => (d?.year ? (d.approx ? 'c. ' : '') + d.year : '');
  const lifespan = (p) => {
    if (p.living) return p.born?.year ? `b. ${yr(p.born)}` : '';
    if (!p.born?.year && !p.died?.year) return '';
    return `${yr(p.born) || '?'} – ${yr(p.died) || '?'}`;
  };
  const fmtDate = (d) => {
    if (!d?.year) return '';
    const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return (d.approx ? 'about ' : '') + [d.day, d.month && M[d.month - 1], d.year].filter(Boolean).join(' ');
  };
  const place = (key) => (key && D.places[key] ? (lang === 'or' && D.places[key].or) || D.places[key].en : '');

  // ---- relationships ----
  const parents = (id) => (P(id).parentFamily ? D.families[P(id).parentFamily].partners : []);
  const spouses = (id) => P(id).families.flatMap((f) => D.families[f].partners.filter((x) => x !== id));
  const children = (id) => P(id).families.flatMap((f) => D.families[f].children);
  const siblings = (id) => (P(id).parentFamily ? D.families[P(id).parentFamily].children.filter((x) => x !== id) : []);
  const byBirth = (a, b) => (P(a).born?.year ?? 9999) - (P(b).born?.year ?? 9999);

  // Line of ancestors, preferring the parent who is themselves a child of the tree.
  function lineage(id) {
    const line = [];
    const seen = new Set();
    let cur = id;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      line.unshift(cur);
      const ps = parents(cur);
      cur = ps.find((x) => P(x).parentFamily) || ps.find((x) => P(x).gender === 'M') || ps[0];
    }
    return line;
  }

  // Top of the tree: founding couples, i.e. families where no partner has known parents.
  const rootPeople = () => {
    const out = [];
    for (const f of Object.values(D.families)) {
      if (f.partners.every((x) => !P(x).parentFamily)) {
        const main = f.partners.find((x) => P(x).gender === 'M') || f.partners[0];
        if (!out.includes(main) && !f.partners.some((x) => out.includes(x))) out.push(main);
      }
    }
    return out.sort(byBirth);
  };

  const card = (id, extra = '') => {
    const p = P(id);
    return `<a class="card g-${esc(p.gender || 'U')} ${extra}" href="#/person/${id}">
      <span class="nm">${esc(nm(p))}</span><span class="yr">${esc(lifespan(p))}</span></a>`;
  };

  // ---- views ----
  function viewTree(rootId) {
    const roots = rootPeople();
    if (!roots.length) return (app.innerHTML = '<p>No families yet. Add some in <code>data/families/</code>.</p>');
    rootId = rootId && P(rootId) ? rootId : roots[0];
    const seen = new Set();
    const node = (id) => {
      if (seen.has(id)) return `<li>${card(id)}</li>`;
      seen.add(id);
      const sp = spouses(id);
      const kids = children(id).sort(byBirth);
      const couple = [card(id), ...sp.map((s) => `<span class="amp">&amp;</span>${card(s, 'inlaw')}`)].join('');
      return `<li><div class="couple">${couple}</div>${kids.length ? `<ul>${kids.map(node).join('')}</ul>` : ''}</li>`;
    };
    const options = [...new Set([...roots, rootId])].map((r) =>
      `<option value="${r}" ${r === rootId ? 'selected' : ''}>${esc(nm(P(r)))}${spouses(r).length ? ' & ' + esc(nm(P(spouses(r)[0]))) : ''}</option>`).join('');
    app.innerHTML = `
      <div class="tree-bar">
        <h1>Family tree</h1>
        <label class="muted" for="root">Start from</label>
        <select id="root">${options}</select>
      </div>
      <div class="tree-wrap"><div class="tree"><ul>${node(rootId)}</ul></div></div>
      <div class="legend">
        <span><i style="background:var(--male)"></i>Male</span>
        <span><i style="background:var(--female)"></i>Female</span>
        <span>Dashed card = married into the family</span>
        <span>Click anyone to see their details</span>
      </div>`;
    document.getElementById('root').onchange = (e) => (location.hash = `#/tree/${e.target.value}`);
    // Centre the scroll on the top of the tree.
    const wrap = app.querySelector('.tree-wrap');
    wrap.scrollLeft = (wrap.scrollWidth - wrap.clientWidth) / 2;
  }

  function viewPerson(id) {
    const p = P(id);
    if (!p) return (app.innerHTML = '<p>Person not found.</p>');
    const chips = (ids) => (ids.length ? `<div class="chips">${ids.sort(byBirth).map((x) => card(x)).join('')}</div>` : '<span class="muted">Not recorded</span>');
    const facts = [
      ['Born', [fmtDate(p.born), place(p.birthplace)].filter(Boolean).join(', ')],
      ['Died', p.died ? fmtDate(p.died) : p.deceased ? 'Yes (date unknown)' : ''],
      ['Sahi', p.sahi],
      ['Occupation', p.occupation],
      ['Also called', (p.alias || []).join(', ')],
      ['Generation', p.generation],
    ].filter(([, v]) => v);
    const srcs = (p.sources || []).map((s) => D.sources[s]).filter(Boolean);
    const line = lineage(id);
    app.innerHTML = `
      ${line.length > 1 ? `<div class="crumbs">${line.map((x) => x === id ? esc(nm(P(x))) : `<a href="#/person/${x}">${esc(nm(P(x)))}</a>`).join(' › ')}</div>` : ''}
      <div class="person-head">
        <h1>${esc(nm(p))}</h1>
        ${altNm(p) ? `<div class="alt">${esc(altNm(p))}</div>` : ''}
        <div class="muted">${esc(lifespan(p))}</div>
      </div>
      <div class="actions">
        ${children(id).length ? `<a class="btn" href="#/tree/${id}">Show descendants</a>` : ''}
        ${line.length > 1 ? `<a class="btn ghost" href="#/tree/${line[0]}">Show whole family</a>` : ''}
      </div>
      <div class="grid">
        <section class="panel">
          <h2>About</h2>
          ${p.photo ? `<img class="photo" src="media/${esc(p.photo)}" alt="${esc(nm(p))}">` : ''}
          ${facts.length ? `<dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
          ${p.note ? `<p>${esc(p.note)}</p>` : ''}
        </section>
        <section class="panel rel">
          <h2>Family</h2>
          <h3>Parents</h3>${chips(parents(id))}
          <h3>Spouse</h3>${chips(spouses(id))}
          <h3>Children</h3>${chips(children(id))}
          <h3>Brothers &amp; sisters</h3>${chips(siblings(id))}
        </section>
        ${srcs.length ? `<section class="panel"><h2>Sources</h2><ul>${srcs.map((s) =>
          `<li>${esc(s.title)}${s.by ? ` — told by ${esc(s.by)}` : ''}${s.date ? `, ${esc(s.date)}` : ''}</li>`).join('')}</ul></section>` : ''}
      </div>`;
  }

  function viewPeople() {
    const gens = {};
    for (const p of Object.values(D.people)) (gens[p.generation] ??= []).push(p.id);
    app.innerHTML = `<h1>Everyone</h1><p class="muted">${Object.keys(D.people).length} people, grouped by generation (1 = oldest known).</p>` +
      Object.keys(gens).sort((a, b) => a - b).map((g) =>
        `<section class="gen"><h2>Generation ${g}</h2><div class="chips">${gens[g].sort(byBirth).map((x) => card(x)).join('')}</div></section>`).join('');
  }

  function viewStories(slug) {
    const s = D.stories.find((x) => x.slug === slug);
    if (s) return (app.innerHTML = `<article class="story"><div class="crumbs"><a href="#/stories">Stories</a></div><h1>${esc(s.title)}</h1>${s.html}</article>`);
    app.innerHTML = `<h1>Stories of Paida</h1>
      <ul class="story-list">${D.stories.map((x) => `<li><a href="#/stories/${esc(x.slug)}">${esc(x.title)}</a></li>`).join('')}</ul>`;
  }

  function viewAbout() {
    const gens = Math.max(0, ...Object.values(D.people).map((p) => p.generation));
    app.innerHTML = `<article class="story">
      <h1>About Paida Roots</h1>
      <p>Paida Roots records the families of Paida village and the stories of how the village came to be,
      so this knowledge is not lost when our elders are gone.</p>
      <div class="stats">
        <div class="stat"><b>${Object.keys(D.people).length}</b>people</div>
        <div class="stat"><b>${Object.keys(D.families).length}</b>families</div>
        <div class="stat"><b>${gens}</b>generations</div>
        <div class="stat"><b>${D.stories.length}</b>stories</div>
      </div>
      <h2>What we record — and what we never do</h2>
      <p>Names, relationships, the year of birth and death, where people lived and what they did, and stories told by elders.
      For living people we show only the birth year. We never record phone numbers, Aadhaar, addresses or any other private details.</p>
      <h2>Can I add my family, or correct something?</h2>
      <p>Yes, please. Speak to the maintainer with the names, relationships and years you know, and who told you.</p>
      <h2>Download</h2>
      <p><a href="paida-roots.ged" download>Family tree (GEDCOM)</a> — opens in Gramps, FamilySearch, Ancestry and other family-tree software.<br>
      <a href="data.json" download>All data (JSON)</a></p>
    </article>`;
  }

  // ---- search ----
  const q = document.getElementById('q');
  const results = document.getElementById('results');
  q.addEventListener('input', () => {
    const t = q.value.trim().toLowerCase();
    if (!t) return (results.hidden = true);
    const hits = Object.values(D.people).filter((p) =>
      [p.name.en, p.name.or, ...(p.alias || [])].some((s) => s && s.toLowerCase().includes(t))).slice(0, 8);
    results.innerHTML = hits.length
      ? hits.map((p) => `<li><a href="#/person/${p.id}">${esc(nm(p))} <small>${esc(lifespan(p))}</small></a></li>`).join('')
      : '<li class="muted" style="padding:6px 8px">No match</li>';
    results.hidden = false;
  });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') results.querySelector('a')?.click();
    if (e.key === 'Escape') results.hidden = true;
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search')) results.hidden = true;
    if (e.target.closest('#results a')) { results.hidden = true; q.value = ''; }
  });

  // ---- language ----
  const langBtn = document.getElementById('lang');
  const setLangLabel = () => (langBtn.textContent = lang === 'or' ? 'English' : 'ଓଡ଼ିଆ');
  langBtn.onclick = () => {
    lang = lang === 'or' ? 'en' : 'or';
    try { localStorage.setItem('lang', lang); } catch {}
    setLangLabel();
    route();
  };

  // ---- router ----
  function route() {
    const [, view = '', arg] = (location.hash || '#/').split('/');
    document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === (view || 'tree')));
    if (view === 'person') viewPerson(arg);
    else if (view === 'people') viewPeople();
    else if (view === 'stories') viewStories(arg && decodeURIComponent(arg));
    else if (view === 'about') viewAbout();
    else viewTree(arg);
    window.scrollTo(0, 0);
  }

  fetch('data.json')
    .then((r) => r.json())
    .then((data) => {
      D = data;
      document.getElementById('updated').textContent = `Last updated ${D.generated}.`;
      setLangLabel();
      window.addEventListener('hashchange', route);
      route();
    })
    .catch(() => (app.innerHTML = '<p>Could not load the family data. Run <code>npm run build</code> first.</p>'));
})();
