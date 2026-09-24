// Paida Roots website. Reads data.json (made by scripts/build.mjs) and renders
// every page in the browser. No framework, so it keeps working for decades.
(() => {
  const app = document.getElementById('app');
  let D; // the data
  let lang = 'en';
  try { lang = localStorage.getItem('lang') || 'en'; } catch {}
  let zoom = 1;
  let userZoomed = false; // until someone uses the zoom buttons, fit the tree to the box
  let treeAnimated = false;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const P = (id) => D.people[id];
  const nm = (p) => (lang === 'or' && p.name.or) || p.name.en;
  const altNm = (p) => (lang === 'or' ? p.name.en : p.name.or) || '';
  const yr = (d) => (d?.year ? (d.approx ? 'c. ' : '') + d.year : '');
  const lifespan = (p) => {
    if (p.living) return p.born?.year ? `Born ${yr(p.born)}` : '';
    if (!p.born?.year && !p.died?.year) return '';
    return `${yr(p.born) || '?'} – ${yr(p.died) || '?'}`;
  };
  const fmtDate = (d) => {
    if (!d?.year) return '';
    const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return (d.approx ? 'About ' : '') + [d.day, d.month && M[d.month - 1], d.year].filter(Boolean).join(' ');
  };
  const place = (key) => (key && D.places[key] ? (lang === 'or' && D.places[key].or) || D.places[key].en : '');
  const segmenter = 'Segmenter' in Intl ? new Intl.Segmenter() : null;
  const initial = (p) => {
    const s = nm(p).trim();
    return segmenter ? segmenter.segment(s)[Symbol.iterator]().next().value?.segment ?? '' : s[0];
  };

  // ---- relationships ----
  const parents = (id) => (P(id).parentFamily ? D.families[P(id).parentFamily].partners : []);
  const spouses = (id) => P(id).families.flatMap((f) => D.families[f].partners.filter((x) => x !== id));
  const children = (id) => P(id).families.flatMap((f) => D.families[f].children);
  const siblings = (id) => (P(id).parentFamily ? D.families[P(id).parentFamily].children.filter((x) => x !== id) : []);
  // Children of a parent's other marriages.
  const halfSiblings = (id) => {
    const pf = P(id).parentFamily;
    if (!pf) return [];
    const out = new Set();
    for (const parent of D.families[pf].partners) {
      for (const f of P(parent).families) if (f !== pf) D.families[f].children.forEach((c) => out.add(c));
    }
    return [...out];
  };
  // First cousins (same grandparents, different parents), grouped by the parent's sibling they come through.
  const cousinGroups = (id) => {
    const skip = new Set([id, ...siblings(id), ...halfSiblings(id)]);
    const groups = [];
    for (const parent of parents(id)) {
      for (const uncle of [...siblings(parent), ...halfSiblings(parent)].sort(byBirth)) {
        const kids = children(uncle).filter((c) => !skip.has(c));
        kids.forEach((c) => skip.add(c));
        if (kids.length) groups.push({ via: uncle, kids });
      }
    }
    return groups;
  };
  // A person's marriages, in order, as { family, spouse }.
  const marriages = (id) => P(id).families.map((f) => ({ family: D.families[f], spouse: D.families[f].partners.find((x) => x !== id) }));
  const ORD = ['1st', '2nd', '3rd', '4th', '5th'];
  const ORD_WORD = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];
  const spouseWord = (sid) => ({ M: 'husband', F: 'wife' }[sid && P(sid).gender] || 'spouse');
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

  const avatar = (p) => `<span class="av g-${esc(p.gender || 'U')}" aria-hidden="true">${esc(initial(p))}</span>`;
  const node = (id, extra = '') => {
    const p = P(id);
    return `<a class="node g-${esc(p.gender || 'U')} ${extra}" href="#/person/${id}">${avatar(p)}
      <span class="tx"><span class="nm">${esc(nm(p))}</span><span class="yr">${esc(lifespan(p))}</span>${
        p.married_into ? `<span class="went" title="Married into ${esc(place(p.married_into))}">→ ${esc(place(p.married_into))}</span>` : ''}</span></a>`;
  };
  // A spouse whose real name isn't known yet, recorded as "Wife of …" / "Husband of …".
  const unnamed = (p) => /^(wife|husband) of /i.test(p.name.en) && !p.name.or;
  // In the tree, an unnamed spouse is a small tag so placeholders don't crowd the family.
  const spouseNode = (id) => {
    const p = P(id);
    if (!unnamed(p)) return node(id, 'inlaw');
    const label = p.name.en.split(' ')[0];
    return `<a class="node inlaw tag g-${esc(p.gender || 'U')}" href="#/person/${id}" title="${esc(p.name.en)} (name not recorded yet)">${esc(label)}</a>`;
  };
  const nodes = (ids) => (ids.length
    ? `<div class="nodes">${[...ids].sort(byBirth).map((x) => node(x)).join('')}</div>`
    : '<p class="none">Not recorded yet</p>');
  const icon = {
    down: '<svg viewBox="0 0 24 24"><path d="M12 4v10m0 0-4-4m4 4 4-4M5 20h14"/></svg>',
    tree: '<svg viewBox="0 0 24 24"><path d="M12 21v-8m0 0-5-5m5 5 5-5M7 8V4m10 4V4"/></svg>',
  };

  // ---- views ----
  function viewTree(rootId) {
    const roots = rootPeople();
    if (!roots.length) {
      app.innerHTML = '<div class="page-head"><h1>No families yet</h1><p>Add a family file in <code>data/families/</code> and rebuild the site.</p></div>';
      return;
    }
    rootId = rootId && P(rootId) ? rootId : roots[0];
    const seen = new Set();
    const kidsList = (kids, depth) => (kids.length ? `<ul>${[...kids].sort(byBirth).map((k) => branch(k, depth)).join('')}</ul>` : '');
    const branch = (id, depth) => {
      if (seen.has(id)) return `<li style="--d:${depth}"><div class="couple">${node(id)}</div></li>`;
      seen.add(id);
      const ms = marriages(id);
      if (ms.length <= 1) {
        // One marriage: show the couple side by side with their children below.
        const sp = ms[0]?.spouse;
        const couple = node(id) + (sp ? `<span class="tie"></span>${spouseNode(sp)}` : '');
        return `<li style="--d:${depth}"><div class="couple">${couple}</div>${kidsList(ms[0]?.family.children ?? [], depth + 1)}</li>`;
      }
      // Several marriages: branch into each spouse, with that marriage's children under them.
      const unions = ms.map(({ family, spouse }, i) => `
        <li style="--d:${depth}" class="union">
          <div class="couple"><div class="union-box">
            <span class="union-tag">${ORD[i] ?? `${i + 1}th`} ${spouseWord(spouse)}${family.married?.year ? `, m. ${yr(family.married)}` : ''}</span>
            ${spouse ? spouseNode(spouse) : '<span class="node inlaw unknown">Not recorded</span>'}
          </div></div>
          ${kidsList(family.children, depth + 1)}
        </li>`).join('');
      return `<li style="--d:${depth}"><div class="couple">${node(id)}</div><ul>${unions}</ul></li>`;
    };
    const everyone = Object.values(D.people);
    const gens = Math.max(...everyone.map((p) => p.generation));
    const earliest = Math.min(...everyone.map((p) => p.born?.year ?? 9999));
    const options = [...new Set([...roots, rootId])].map((r) => {
      const sp = spouses(r)[0];
      return `<option value="${r}" ${r === rootId ? 'selected' : ''}>${esc(nm(P(r)))}${sp ? ' and ' + esc(nm(P(sp))) : ''}</option>`;
    }).join('');

    app.innerHTML = `
      <section class="intro">
        <h1 class="wordmark" lang="or">ପଇଦା</h1>
        <div>
          <p class="lede">The families of Paida village, from the oldest ancestors anyone remembers to the children born today.</p>
          <p class="meta">${everyone.length} people across ${gens} generations${earliest < 9999 ? `, going back to ${earliest}` : ''}.</p>
        </div>
      </section>
      <div class="stage-bar">
        <label for="root">Start from</label>
        <select id="root">${options}</select>
        <div class="zoom" role="group" aria-label="Zoom">
          <button class="icon-btn" type="button" data-zoom="-1" aria-label="Zoom out">−</button>
          <button class="icon-btn" type="button" data-zoom="0">Fit</button>
          <button class="icon-btn" type="button" data-zoom="1" aria-label="Zoom in">+</button>
        </div>
      </div>
      <div class="stage ${treeAnimated ? '' : 'animate'}" tabindex="0" aria-label="Family tree. Drag or scroll to move around, pinch to zoom.">
        <div class="tree"><ul>${branch(rootId, 0)}</ul></div>
      </div>
      <div class="legend">
        <span><i style="background:var(--indigo)"></i>Male</span>
        <span><i style="background:var(--sindoor)"></i>Female</span>
        <span><i class="dash"></i>Married into the family</span>
        <span>Drag to move around, pinch to zoom, and tap anyone to open their page.</span>
      </div>`;
    treeAnimated = true;

    const stage = app.querySelector('.stage');
    const tree = app.querySelector('.tree');
    const center = () => { stage.scrollLeft = (stage.scrollWidth - stage.clientWidth) / 2; };
    const clampZoom = (z) => Math.min(1.8, Math.max(0.2, z));
    const setZoom = (z) => { zoom = clampZoom(z); tree.style.zoom = zoom; center(); };
    // Zoom while keeping the point under (cx, cy) still, so pinching feels anchored to the fingers.
    const zoomAt = (z, cx, cy) => {
      const r = stage.getBoundingClientRect();
      const mx = cx - r.left;
      const my = cy - r.top;
      const x = (stage.scrollLeft + mx) / zoom;
      const y = (stage.scrollTop + my) / zoom;
      zoom = clampZoom(z);
      tree.style.zoom = zoom;
      stage.scrollLeft = x * zoom - mx;
      stage.scrollTop = y * zoom - my;
    };
    const fit = (floor = 0) => {
      tree.style.zoom = 1;
      setZoom(Math.max(floor, Math.min(1, (stage.clientWidth - 8) / tree.scrollWidth, (stage.clientHeight - 8) / tree.scrollHeight)));
    };
    userZoomed ? setZoom(zoom) : fit(0.6);
    app.querySelector('.zoom').onclick = (e) => {
      const b = e.target.closest('[data-zoom]');
      if (!b) return;
      const step = Number(b.dataset.zoom);
      userZoomed = true;
      step === 0 ? fit() : setZoom(zoom + step * 0.15);
    };
    document.getElementById('root').onchange = (e) => (location.hash = `#/tree/${e.target.value}`);

    stage.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      drag = { stage, x: e.clientX, y: e.clientY, left: stage.scrollLeft, top: stage.scrollTop, moved: false };
    });

    // Pinch with two fingers to zoom. One finger still scrolls natively.
    let pinch = null;
    const gap = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t) => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2];
    stage.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 2) return;
      pinch = { dist: gap(e.touches), zoom, mid: mid(e.touches) };
      userZoomed = true;
    }, { passive: true });
    stage.addEventListener('touchmove', (e) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const scale = gap(e.touches) / pinch.dist;
      const [mx, my] = mid(e.touches);
      zoomAt(pinch.zoom * scale, mx, my);
      // Moving both fingers together also pans.
      stage.scrollLeft -= mx - pinch.mid[0];
      stage.scrollTop -= my - pinch.mid[1];
      pinch.mid = [mx, my];
    }, { passive: false });
    // Stop iPhone Safari from zooming the whole page instead of the tree.
    stage.addEventListener('gesturestart', (e) => e.preventDefault());
    const endPinch = (e) => { if (e.touches.length < 2) pinch = null; };
    stage.addEventListener('touchend', endPinch);
    stage.addEventListener('touchcancel', endPinch);

    // Trackpad pinch (and Ctrl + scroll wheel) on computers.
    stage.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      userZoomed = true;
      zoomAt(zoom * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    }, { passive: false });
  }

  // Drag to pan the tree with a mouse; touch screens already pan natively.
  let drag = null;
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    drag.stage.classList.add('dragging');
    drag.stage.scrollLeft = drag.left - dx;
    drag.stage.scrollTop = drag.top - dy;
  });
  window.addEventListener('pointerup', () => {
    if (!drag) return;
    // A drag should not also count as a click on the person under the cursor.
    if (drag.moved) {
      const stage = drag.stage;
      const swallow = (e) => e.preventDefault();
      stage.addEventListener('click', swallow, { capture: true });
      setTimeout(() => stage.removeEventListener('click', swallow, { capture: true }));
    }
    drag.stage.classList.remove('dragging');
    drag = null;
  });

  function marriageBlocks(id) {
    const ms = marriages(id);
    // A daughter who married out: her new family's history lives in her husband's village.
    if (!ms.length && P(id).married_into) return '';
    if (ms.length <= 1) {
      return `<div class="rel"><h3>Married to</h3>${nodes(ms[0]?.spouse ? [ms[0].spouse] : [])}</div>
        <div class="rel"><h3>Children</h3>${nodes(ms[0]?.family.children ?? [])}</div>`;
    }
    return ms.map(({ family, spouse }, i) => {
      const s = spouse && P(spouse);
      const heading = `${ORD_WORD[i] ?? `Marriage ${i + 1}`}${ORD_WORD[i] ? ' marriage' : ''}${family.married?.year ? `, ${yr(family.married)}` : ''}`;
      const ended = s?.died?.year && ms[i + 1] ? `<p class="rel-note">${esc(nm(s))} died in ${yr(s.died)}.</p>` : '';
      return `<div class="rel marriage">
        <h3>${heading}</h3>
        ${nodes(spouse ? [spouse] : [])}
        ${ended}
        <p class="rel-sub">Children</p>
        ${nodes(family.children)}
      </div>`;
    }).join('');
  }

  function cousinBlock(id) {
    const groups = cousinGroups(id);
    if (!groups.length) return '';
    return `<div class="rel"><h3>Cousins (same grandparents)</h3>
      ${groups.map(({ via, kids }) => `<p class="rel-sub">Children of <a href="#/person/${via}">${esc(nm(P(via)))}</a></p>${nodes(kids)}`).join('')}
    </div>`;
  }

  function viewPerson(id) {
    const p = P(id);
    if (!p) {
      app.innerHTML = '<div class="page-head"><h1>Person not found</h1><p>This link may be out of date. Use search to find them.</p></div>';
      return;
    }
    const facts = [
      ['Born', [fmtDate(p.born), place(p.birthplace)].filter(Boolean).join(', in ')],
      ['Died', p.died ? fmtDate(p.died) : p.deceased ? 'Date not known' : ''],
      ['Married into', place(p.married_into)],
      ['Sahi', p.sahi],
      ['Work', p.occupation],
      ['Also called', (p.alias || []).join(', ')],
      ['Generation', p.generation],
    ].filter(([, v]) => v);
    const srcs = (p.sources || []).map((s) => D.sources[s]).filter(Boolean);
    const line = lineage(id);
    const alt = altNm(p);
    const altIsOdia = lang !== 'or';
    app.innerHTML = `
      ${line.length > 1 ? `<nav class="descent" aria-label="Line of descent"><span class="lbl">Line of descent</span>
        ${line.map((x) => (x === id
          ? `<b>${avatar(P(x))}${esc(nm(P(x)))}</b>`
          : `<a href="#/person/${x}">${avatar(P(x))}${esc(nm(P(x)))}</a><span class="step"></span>`)).join('')}
      </nav>` : ''}
      <header class="phead g-${esc(p.gender || 'U')}">
        ${avatar(p)}
        <div>
          <h1>${esc(nm(p))}</h1>
          ${alt ? `<p class="alt ${altIsOdia ? '' : 'en'}" ${altIsOdia ? 'lang="or"' : ''}>${esc(alt)}</p>` : ''}
          <p class="life">${esc(lifespan(p))}</p>
        </div>
      </header>
      <div class="actions">
        ${children(id).length ? `<a class="btn" href="#/tree/${id}">${icon.down}Show descendants</a>` : ''}
        ${line.length > 1 ? `<a class="btn quiet" href="#/tree/${line[0]}">${icon.tree}Show whole family</a>` : ''}
      </div>
      <div class="pbody">
        <section>
          <h2>Life</h2>
          ${p.photo ? `<img class="photo" src="media/${esc(p.photo)}" alt="${esc(nm(p))}">` : ''}
          ${facts.length ? `<dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
          ${p.note ? `<p class="note">${esc(p.note)}</p>` : ''}
        </section>
        <section class="family" aria-label="Family">
          <div class="rel"><h3>Parents</h3>${nodes(parents(id))}</div>
          ${marriageBlocks(id)}
          <div class="rel"><h3>Brothers and sisters</h3>${nodes(siblings(id))}</div>
          ${halfSiblings(id).length ? `<div class="rel"><h3>Half brothers and sisters</h3>${nodes(halfSiblings(id))}</div>` : ''}
          ${cousinBlock(id)}
        </section>
      </div>
      ${srcs.length ? `<section class="sources"><h2>Where this comes from</h2><ul>${srcs.map((s) =>
        `<li>${esc(s.title)}${s.by ? `, told by ${esc(s.by)}` : ''}${s.date ? ` (${esc(s.date)})` : ''}</li>`).join('')}</ul></section>` : ''}`;
  }

  function viewPeople() {
    const gens = {};
    for (const p of Object.values(D.people)) (gens[p.generation] ??= []).push(p);
    const total = Object.keys(D.people).length;
    app.innerHTML = `
      <header class="page-head">
        <h1>Everyone</h1>
        <p>${total} people across ${Object.keys(gens).length} generations. Generation 1 is the oldest the family remembers.</p>
      </header>
      <ol class="gens">${Object.keys(gens).sort((a, b) => a - b).map((g) => {
        const years = gens[g].map((p) => p.born?.year).filter(Boolean);
        const range = years.length ? `Born ${Math.min(...years)}${Math.max(...years) !== Math.min(...years) ? `–${Math.max(...years)}` : ''}` : '';
        return `<li class="gen">
          <div class="gen-rail"><h2>Generation ${g}</h2><p>${range}</p></div>
          ${nodes(gens[g].map((p) => p.id))}
        </li>`;
      }).join('')}</ol>`;
  }

  const excerpt = (html) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const para = [...doc.querySelectorAll('p')].find((el) => !el.closest('blockquote'));
    const text = (para?.textContent || '').replace(/_/g, '').trim();
    return text.length > 180 ? text.slice(0, 177).trimEnd() + '…' : text;
  };

  function viewStories(slug) {
    const s = D.stories.find((x) => x.slug === slug);
    if (s) {
      app.innerHTML = `<article class="prose"><a class="back" href="#/stories">All stories</a><h1>${esc(s.title)}</h1>${s.html}</article>`;
      return;
    }
    app.innerHTML = `
      <header class="page-head">
        <h1>Stories of Paida</h1>
        <p>What the elders remember about how the village began, and how it has lived since.</p>
      </header>
      ${D.stories.length
        ? `<ul class="story-list">${D.stories.map((x) => `<li><a href="#/stories/${esc(x.slug)}"><h2>${esc(x.title)}</h2><p>${esc(excerpt(x.html))}</p></a></li>`).join('')}</ul>`
        : '<p class="none">No stories yet. Add a Markdown file to the <code>stories/</code> folder.</p>'}`;
  }

  function viewAbout() {
    const gens = Math.max(0, ...Object.values(D.people).map((p) => p.generation));
    app.innerHTML = `<article class="prose">
      <h1>About Paida Roots</h1>
      <p>Paida Roots records the families of Paida village and the story of how the village came to be.
      When our elders are gone, what they remember goes with them unless someone writes it down. This is where we write it down.</p>
      <p class="counts">So far: <b>${Object.keys(D.people).length}</b> people, <b>${Object.keys(D.families).length}</b> families,
      <b>${gens}</b> generations and <b>${D.stories.length}</b> ${D.stories.length === 1 ? 'story' : 'stories'}.</p>
      <h2>What we record, and what we never do</h2>
      <p>We record names, relationships, years of birth and death, where people lived, the work they did, and the stories elders tell.
      For living people we show only the year of birth. We never record phone numbers, Aadhaar, addresses or any other private details.</p>
      <h2>Adding your family or correcting something</h2>
      <p>Please do. Tell the maintainer the names, relationships and years you know, and who told you. Even a partial memory helps.</p>
      <h2>Download</h2>
      <p><a href="paida-roots.ged" download>The family tree as a GEDCOM file</a> opens in Gramps, FamilySearch, Ancestry and most other family-tree software.
      You can also download <a href="data.json" download>all the data as JSON</a>.</p>
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
      ? hits.map((p) => `<li><a class="g-${esc(p.gender || 'U')}" href="#/person/${p.id}">${avatar(p)}<span class="tx"><span>${esc(nm(p))}</span><br><small class="muted">${esc(lifespan(p))}</small></span></a></li>`).join('')
      : `<li class="empty">No one called “${esc(q.value.trim())}” yet</li>`;
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
  const langBtns = document.querySelectorAll('.lang button');
  const syncLang = () => langBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  langBtns.forEach((b) => (b.onclick = () => {
    if (lang === b.dataset.lang) return;
    lang = b.dataset.lang;
    try { localStorage.setItem('lang', lang); } catch {}
    syncLang();
    route(false);
  }));

  // ---- router ----
  function route(scrollTop = true) {
    const [, view = '', arg] = (location.hash || '#/').split('/');
    document.querySelectorAll('.tabs a').forEach((a) => {
      const on = a.dataset.nav === (view || 'tree');
      a.classList.toggle('active', on);
      on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
    });
    if (view === 'person') viewPerson(arg);
    else if (view === 'people') viewPeople();
    else if (view === 'stories') viewStories(arg && decodeURIComponent(arg));
    else if (view === 'about') viewAbout();
    else viewTree(arg);
    if (scrollTop) window.scrollTo(0, 0);
  }

  fetch('data.json')
    .then((r) => r.json())
    .then((data) => {
      D = data;
      document.getElementById('updated').textContent = `Last updated ${D.generated}.`;
      syncLang();
      window.addEventListener('hashchange', () => route());
      route();
    })
    .catch(() => {
      app.innerHTML = '<div class="page-head"><h1>The family data did not load</h1><p>Run <code>npm run build</code>, then reload this page.</p></div>';
    });
})();
