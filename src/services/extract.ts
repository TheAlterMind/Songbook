// Pulls lyrics (and chords) out of the song page open in the in-app browser.
// For personal use: Genius and Ultimate Guitar don't offer this through an API, so it reads the page the
// user is viewing, the way a reader mode would. Page layouts change without notice, so each extractor
// has a fallback, and any selected text is the last resort.

export const SOURCES = {
  genius: {
    name: 'Genius',
    hint: 'Lyrics. Open a song page, then tap Import.',
    searchUrl: (q: string) => `https://genius.com/search?q=${encodeURIComponent(q)}`,
  },
  ultimateGuitar: {
    name: 'Ultimate Guitar',
    hint: 'Chords and lyrics. Open a chords page, then tap Import.',
    searchUrl: (q: string) =>
      `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(q)}`,
  },
  google: {
    name: 'Google',
    hint: 'Any site. Select the lyrics, then tap Import.',
    searchUrl: (q: string) => `https://www.google.com/search?q=${encodeURIComponent(`${q} lyrics`.trim())}`,
  },
};

/** What the page script sends back. */
export type PageImport =
  | {
      ok: true;
      source: string; // "Genius", "Ultimate Guitar", or the site's host for a selection
      title: string;
      artist: string;
      key: string;
      text: string; // lyrics, or a chord sheet with Ultimate Guitar markup
      chordSheet: boolean;
    }
  | { ok: false; reason: string };

/**
 * Runs inside the page (WebView.injectJavaScript) and posts a PageImport back.
 * Plain ES5 on purpose: it runs in whatever engine the page's WebView has.
 */
export const EXTRACT_SCRIPT = `
(function () {
  function post(o) { window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  function tidy(s) { return String(s || '').replace(/\\r\\n?/g, '\\n').replace(/\\n{3,}/g, '\\n\\n').trim(); }
  try {
    var host = location.hostname.replace(/^www\\./, '');

    // Ultimate Guitar: the page embeds its data as JSON in .js-store (older pages: window.UGAPP).
    if (/(^|\\.)ultimate-guitar\\.com$/.test(host)) {
      var data = null;
      var store = document.querySelector('.js-store');
      if (store) { try { data = JSON.parse(store.getAttribute('data-content')).store.page.data; } catch (e) {} }
      if (!data && window.UGAPP && window.UGAPP.store && window.UGAPP.store.page) data = window.UGAPP.store.page.data;
      var view = data && data.tab_view;
      var content = view && view.wiki_tab && view.wiki_tab.content;
      if (content) {
        var tab = data.tab || {};
        var meta = view.meta || {};
        return post({ ok: true, source: 'Ultimate Guitar', title: tab.song_name || '', artist: tab.artist_name || '',
          key: meta.tonality || tab.tonality_name || '', text: tidy(content), chordSheet: true });
      }
      // Fallback: the rendered sheet, which keeps chords above words in a <pre>.
      var pre = document.querySelector('pre');
      if (pre && pre.innerText.trim()) {
        var t = document.title.replace(/\\s*\\|.*$/, '');
        var m = t.match(/^(.*?)\\s+(?:chords|tab|ukulele|bass)\\b.*?\\bby\\s+(.*)$/i);
        return post({ ok: true, source: 'Ultimate Guitar', title: m ? m[1] : t, artist: m ? m[2] : '', key: '',
          text: tidy(pre.innerText), chordSheet: true });
      }
    }

    // Genius: lyrics sit in [data-lyrics-container] blocks; each page's credits header inside them is
    // marked data-exclude-from-selection. og:title reads "Artist – Title".
    if (/(^|\\.)genius\\.com$/.test(host)) {
      var boxes = document.querySelectorAll('[data-lyrics-container="true"]');
      if (boxes.length) {
        var parts = [];
        for (var i = 0; i < boxes.length; i++) {
          var c = boxes[i].cloneNode(true);
          var skip = c.querySelectorAll('[data-exclude-from-selection="true"]');
          for (var j = 0; j < skip.length; j++) skip[j].parentNode.removeChild(skip[j]);
          var brs = c.querySelectorAll('br');
          for (var k = 0; k < brs.length; k++) brs[k].parentNode.replaceChild(document.createTextNode('\\n'), brs[k]);
          parts.push(c.textContent);
        }
        var og = (document.querySelector('meta[property="og:title"]') || {}).content || '';
        var split = og.split(' \\u2013 ');
        return post({ ok: true, source: 'Genius', artist: split.length > 1 ? split[0] : '',
          title: split.length > 1 ? split.slice(1).join(' \\u2013 ') : og, key: '', text: tidy(parts.join('\\n')), chordSheet: false });
      }
    }

    // Any other page: whatever the user selected.
    var sel = window.getSelection ? String(window.getSelection()) : '';
    if (sel.trim()) return post({ ok: true, source: host, title: '', artist: '', key: '', text: tidy(sel), chordSheet: false });

    post({ ok: false, reason: /genius\\.com|ultimate-guitar\\.com/.test(host)
      ? 'Open a song page first (not the search results), then tap Import.'
      : 'Select the lyrics on the page first, then tap Import.' });
  } catch (e) {
    post({ ok: false, reason: 'Could not read this page: ' + (e && e.message) });
  }
})();
true;
`;
